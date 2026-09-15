-- Avisa quem delegou (dono da tarefa) quando a tarefa delegada muda ou é concluída
CREATE OR REPLACE FUNCTION public.notify_task_owner_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _actor_name text;
  _target uuid := NEW.user_id;
  _changes text[] := ARRAY[]::text[];
BEGIN
  IF NEW.assignee_id IS NULL OR NEW.assignee_id = NEW.user_id THEN
    RETURN NEW;
  END IF;
  IF _actor IS NULL OR _target = _actor THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(display_name, email) INTO _actor_name
    FROM public.profiles WHERE user_id = _actor;

  IF NEW.completed IS DISTINCT FROM OLD.completed AND NEW.completed = true THEN
    INSERT INTO public.notifications (user_id, type, title, body, task_id, project_id, actor_id, link)
    VALUES (
      _target,
      'task_completed',
      'Tarefa delegada concluída',
      COALESCE(_actor_name, 'Alguém') || ' concluiu: ' || NEW.title,
      NEW.id, NEW.project_id, _actor, '/minhas-tarefas'
    );
    RETURN NEW;
  END IF;

  IF NEW.title IS DISTINCT FROM OLD.title THEN
    _changes := _changes || 'título';
  END IF;
  IF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date THEN
    _changes := _changes || ('data para ' || COALESCE(NEW.scheduled_date::text, 'sem data'));
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    _changes := _changes || ('status para ' || NEW.status::text
      || CASE WHEN NEW.status::text = 'blocked' AND NEW.blocked_reason IS NOT NULL
              THEN ' (' || NEW.blocked_reason || ')' ELSE '' END);
  END IF;
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    _changes := _changes || ('prioridade para ' || NEW.priority::text);
  END IF;
  IF NEW.completed IS DISTINCT FROM OLD.completed AND NEW.completed = false THEN
    _changes := _changes || 'tarefa reaberta';
  END IF;

  IF array_length(_changes, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, task_id, project_id, actor_id, link)
  VALUES (
    _target,
    'task_updated',
    'Tarefa delegada foi alterada',
    COALESCE(_actor_name, 'Alguém') || ' alterou ' || array_to_string(_changes, ', ') || ' em: ' || NEW.title,
    NEW.id, NEW.project_id, _actor, '/minhas-tarefas'
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_task_owner_changes ON public.tasks;
CREATE TRIGGER trg_notify_task_owner_changes
AFTER UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_task_owner_changes();

REVOKE ALL ON FUNCTION public.notify_task_owner_changes() FROM anon, PUBLIC;