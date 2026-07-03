
-- 1. Relax member trigger to allow assignee_id changes
CREATE OR REPLACE FUNCTION public.enforce_member_task_constraints()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _privileged boolean;
  _actor_id uuid;
BEGIN
  BEGIN
    _actor_id := NULLIF(auth.uid()::text, '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    _actor_id := NULL;
  END;

  IF _actor_id IS NULL THEN
    BEGIN
      _actor_id := NULLIF(
        current_setting('request.headers', true)::jsonb ->> 'x-foco-actor-id',
        ''
      )::uuid;
    EXCEPTION WHEN OTHERS THEN
      _actor_id := NULL;
    END;
  END IF;

  IF _actor_id IS NOT NULL AND NEW.user_id = _actor_id THEN
    RETURN NEW;
  END IF;

  IF _actor_id IS NOT NULL AND NEW.project_id IS NOT NULL THEN
    SELECT public.is_project_manager_or_above(NEW.project_id, _actor_id) INTO _privileged;
    IF _privileged THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Assignee: broad edit but cannot change owner/project
  IF _actor_id IS NOT NULL AND NEW.assignee_id IS NOT NULL AND OLD.assignee_id = _actor_id THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.project_id IS DISTINCT FROM OLD.project_id THEN
      RAISE EXCEPTION 'Como responsável pela tarefa, você não pode alterar dono ou projeto';
    END IF;
    RETURN NEW;
  END IF;

  -- Plain project member: can now change assignee_id too; still blocked from ownership/project changes
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    RAISE EXCEPTION 'Como membro, você não pode alterar dono ou projeto desta tarefa';
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. Activity log table
CREATE TABLE IF NOT EXISTS public.task_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  field text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_activity_task ON public.task_activity(task_id, created_at DESC);

GRANT SELECT, INSERT ON public.task_activity TO authenticated;
GRANT ALL ON public.task_activity TO service_role;

ALTER TABLE public.task_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View activity for accessible tasks"
  ON public.task_activity FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_activity.task_id
        AND (
          t.user_id = auth.uid()
          OR t.assignee_id = auth.uid()
          OR (t.project_id IS NOT NULL AND public.is_project_member(t.project_id, auth.uid()))
        )
    )
  );

CREATE POLICY "System inserts activity"
  ON public.task_activity FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 3. Trigger function to log changes
CREATE OR REPLACE FUNCTION public.log_task_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_activity(task_id, actor_id, action, new_value)
    VALUES (NEW.id, _actor, 'created', jsonb_build_object('title', NEW.title));
    RETURN NEW;
  END IF;

  IF NEW.title IS DISTINCT FROM OLD.title THEN
    INSERT INTO public.task_activity(task_id, actor_id, action, field, old_value, new_value)
    VALUES (NEW.id, _actor, 'updated', 'title', to_jsonb(OLD.title), to_jsonb(NEW.title));
  END IF;
  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
    INSERT INTO public.task_activity(task_id, actor_id, action, field, old_value, new_value)
    VALUES (NEW.id, _actor, 'reassigned', 'assignee_id', to_jsonb(OLD.assignee_id), to_jsonb(NEW.assignee_id));
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.task_activity(task_id, actor_id, action, field, old_value, new_value)
    VALUES (NEW.id, _actor, 'updated', 'status', to_jsonb(OLD.status), to_jsonb(NEW.status));
  END IF;
  IF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date THEN
    INSERT INTO public.task_activity(task_id, actor_id, action, field, old_value, new_value)
    VALUES (NEW.id, _actor, 'updated', 'scheduled_date', to_jsonb(OLD.scheduled_date), to_jsonb(NEW.scheduled_date));
  END IF;
  IF NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes THEN
    INSERT INTO public.task_activity(task_id, actor_id, action, field, old_value, new_value)
    VALUES (NEW.id, _actor, 'updated', 'duration_minutes', to_jsonb(OLD.duration_minutes), to_jsonb(NEW.duration_minutes));
  END IF;
  IF NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    INSERT INTO public.task_activity(task_id, actor_id, action, field, old_value, new_value)
    VALUES (NEW.id, _actor, 'updated', 'project_id', to_jsonb(OLD.project_id), to_jsonb(NEW.project_id));
  END IF;
  IF NEW.category IS DISTINCT FROM OLD.category THEN
    INSERT INTO public.task_activity(task_id, actor_id, action, field, old_value, new_value)
    VALUES (NEW.id, _actor, 'updated', 'category', to_jsonb(OLD.category), to_jsonb(NEW.category));
  END IF;
  IF NEW.completed IS DISTINCT FROM OLD.completed THEN
    INSERT INTO public.task_activity(task_id, actor_id, action, field, old_value, new_value)
    VALUES (NEW.id, _actor, CASE WHEN NEW.completed THEN 'completed' ELSE 'reopened' END, 'completed', to_jsonb(OLD.completed), to_jsonb(NEW.completed));
  END IF;
  IF NEW.description IS DISTINCT FROM OLD.description THEN
    INSERT INTO public.task_activity(task_id, actor_id, action, field)
    VALUES (NEW.id, _actor, 'updated', 'description');
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_log_task_activity_ins ON public.tasks;
DROP TRIGGER IF EXISTS trg_log_task_activity_upd ON public.tasks;

CREATE TRIGGER trg_log_task_activity_ins
  AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_task_activity();

CREATE TRIGGER trg_log_task_activity_upd
  AFTER UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_task_activity();

-- 4. Extend assignment notification to also notify previous assignee
CREATE OR REPLACE FUNCTION public.notify_task_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _actor_name text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.assignee_id IS NOT DISTINCT FROM OLD.assignee_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(display_name, email) INTO _actor_name
  FROM public.profiles WHERE user_id = auth.uid();

  -- Notify new assignee
  IF NEW.assignee_id IS NOT NULL AND NEW.assignee_id <> auth.uid() THEN
    INSERT INTO public.notifications (user_id, type, title, body, task_id, project_id, actor_id, link)
    VALUES (
      NEW.assignee_id,
      'task_assigned',
      'Nova tarefa delegada para você',
      COALESCE(_actor_name, 'Alguém') || ' delegou: ' || NEW.title,
      NEW.id, NEW.project_id, auth.uid(), '/hoje'
    );
  END IF;

  -- Notify previous assignee (reassigned away)
  IF TG_OP = 'UPDATE'
     AND OLD.assignee_id IS NOT NULL
     AND OLD.assignee_id <> auth.uid()
     AND OLD.assignee_id IS DISTINCT FROM NEW.assignee_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, task_id, project_id, actor_id, link)
    VALUES (
      OLD.assignee_id,
      'task_unassigned',
      'Tarefa reatribuída',
      COALESCE(_actor_name, 'Alguém') || ' reatribuiu: ' || NEW.title,
      NEW.id, NEW.project_id, auth.uid(), '/hoje'
    );
  END IF;

  RETURN NEW;
END;
$function$;
