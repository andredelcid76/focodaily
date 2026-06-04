-- Tabela de dependências (Finish-to-Start)
CREATE TABLE public.task_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  predecessor_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  successor_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  dep_type text NOT NULL DEFAULT 'FS' CHECK (dep_type IN ('FS')),
  lag_days integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (predecessor_id, successor_id),
  CHECK (predecessor_id <> successor_id)
);

CREATE INDEX idx_task_dependencies_predecessor ON public.task_dependencies(predecessor_id);
CREATE INDEX idx_task_dependencies_successor ON public.task_dependencies(successor_id);
CREATE INDEX idx_task_dependencies_user ON public.task_dependencies(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_dependencies TO authenticated;
GRANT ALL ON public.task_dependencies TO service_role;

ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own dependencies"
  ON public.task_dependencies FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own dependencies"
  ON public.task_dependencies FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own dependencies"
  ON public.task_dependencies FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own dependencies"
  ON public.task_dependencies FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_task_dependencies_updated_at
  BEFORE UPDATE ON public.task_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Previne ciclos (DFS a partir da sucessora; se chegar de volta na predecessora, erro)
CREATE OR REPLACE FUNCTION public.prevent_dependency_cycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _has_cycle boolean;
BEGIN
  WITH RECURSIVE chain AS (
    SELECT successor_id AS node
      FROM public.task_dependencies
     WHERE predecessor_id = NEW.successor_id
    UNION
    SELECT d.successor_id
      FROM public.task_dependencies d
      JOIN chain c ON d.predecessor_id = c.node
  )
  SELECT EXISTS (SELECT 1 FROM chain WHERE node = NEW.predecessor_id) INTO _has_cycle;

  IF _has_cycle THEN
    RAISE EXCEPTION 'Dependência cria um ciclo entre tarefas';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_task_dependencies_no_cycle
  BEFORE INSERT OR UPDATE ON public.task_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.prevent_dependency_cycle();

-- Cascata de datas: quando uma predecessora muda scheduled_date ou é concluída,
-- recalcula scheduled_date das sucessoras (puxa OU empurra).
CREATE OR REPLACE FUNCTION public.cascade_task_dependencies()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _dep record;
  _new_date date;
  _base date;
BEGIN
  -- Só age quando a data muda OU quando a conclusão muda
  IF TG_OP = 'UPDATE'
     AND NEW.scheduled_date IS NOT DISTINCT FROM OLD.scheduled_date
     AND NEW.completed IS NOT DISTINCT FROM OLD.completed THEN
    RETURN NEW;
  END IF;

  FOR _dep IN
    SELECT d.successor_id, d.lag_days, t.scheduled_date AS succ_date, t.completed AS succ_completed
      FROM public.task_dependencies d
      JOIN public.tasks t ON t.id = d.successor_id
     WHERE d.predecessor_id = NEW.id
  LOOP
    IF _dep.succ_completed THEN
      CONTINUE;
    END IF;

    -- Se a predecessora foi concluída agora (antes do previsto), usa hoje como base (puxa)
    IF NEW.completed = true AND COALESCE(OLD.completed, false) = false THEN
      _base := CURRENT_DATE;
      _new_date := _base + _dep.lag_days;
      -- Puxa só se a sucessora estiver agendada DEPOIS desta nova data
      IF _dep.succ_date > _new_date THEN
        UPDATE public.tasks
           SET scheduled_date = _new_date,
               updated_at = now()
         WHERE id = _dep.successor_id;
      END IF;
    ELSE
      -- Mudança de data da predecessora: empurra sucessora se ela está antes
      _base := NEW.scheduled_date;
      _new_date := _base + _dep.lag_days;
      IF _dep.succ_date < _new_date THEN
        UPDATE public.tasks
           SET scheduled_date = _new_date,
               updated_at = now()
         WHERE id = _dep.successor_id;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tasks_cascade_dependencies
  AFTER UPDATE OF scheduled_date, completed ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.cascade_task_dependencies();