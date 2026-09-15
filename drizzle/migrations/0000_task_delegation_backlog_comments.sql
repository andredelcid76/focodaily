-- 1. Backlog: allow tasks without a date
ALTER TABLE public.tasks ALTER COLUMN scheduled_date DROP NOT NULL;
ALTER TABLE public.tasks ALTER COLUMN planned_date DROP NOT NULL;
ALTER TABLE public.tasks ALTER COLUMN original_date DROP NOT NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS backlog_position integer;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS blocked_reason text;

CREATE INDEX IF NOT EXISTS tasks_backlog_idx
  ON public.tasks (user_id, project_id, backlog_position)
  WHERE scheduled_date IS NULL;

-- 2. New statuses
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'in_progress';
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'blocked';

-- 3. Date-aware triggers must tolerate NULL dates and blocked tasks
CREATE OR REPLACE FUNCTION public.set_task_planned_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.scheduled_date IS NULL THEN
    NEW.planned_date := NULL;
    RETURN NEW;
  END IF;
  IF NEW.planned_date IS NULL THEN
    NEW.planned_date := NEW.scheduled_date;
  ELSIF NEW.planned_date = CURRENT_DATE AND NEW.scheduled_date > CURRENT_DATE THEN
    NEW.planned_date := NEW.scheduled_date;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.track_task_postponement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.scheduled_date IS NOT NULL
     AND OLD.scheduled_date IS NOT NULL
     AND NEW.status::text <> 'blocked'
     AND NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
     AND NEW.recurrence_parent_id IS NULL
     AND NEW.scheduled_date > OLD.scheduled_date THEN
    NEW.postpone_count := COALESCE(OLD.postpone_count, 0) + 1;
  END IF;
  RETURN NEW;
END;
$function$;

-- 4. Task comments
CREATE OR REPLACE FUNCTION public.can_access_task(_task_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = _task_id
      AND (
        t.user_id = _user_id
        OR t.assignee_id = _user_id
        OR (t.project_id IS NOT NULL AND public.is_project_member(t.project_id, _user_id))
        OR (t.project_id IS NOT NULL AND public.is_project_owner(t.project_id, _user_id))
      )
  )
$function$;

REVOKE ALL ON FUNCTION public.can_access_task(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_task(uuid, uuid) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_comments_task_idx ON public.task_comments (task_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_comments TO authenticated;
GRANT ALL ON public.task_comments TO service_role;

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Involved people can read task comments"
  ON public.task_comments FOR SELECT TO authenticated
  USING (public.can_access_task(task_id, auth.uid()));

CREATE POLICY "Involved people can comment"
  ON public.task_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_access_task(task_id, auth.uid()));

CREATE POLICY "Authors can edit their own comment"
  ON public.task_comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Authors can delete their own comment"
  ON public.task_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER task_comments_updated_at
  BEFORE UPDATE ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 5. Notify everyone involved on a new comment
CREATE OR REPLACE FUNCTION public.notify_task_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _task record;
  _actor_name text;
  _target uuid;
BEGIN
  SELECT id, title, user_id, assignee_id, project_id INTO _task
  FROM public.tasks WHERE id = NEW.task_id;
  IF _task.id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(display_name, email) INTO _actor_name
  FROM public.profiles WHERE user_id = NEW.user_id;

  FOR _target IN
    SELECT DISTINCT uid FROM (
      SELECT _task.user_id AS uid
      UNION SELECT _task.assignee_id
      UNION SELECT p.user_id FROM public.projects p WHERE p.id = _task.project_id
    ) s WHERE uid IS NOT NULL AND uid <> NEW.user_id
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, task_id, project_id, actor_id, link)
    VALUES (
      _target,
      'task_comment',
      'Novo comentário em tarefa',
      COALESCE(_actor_name, 'Alguém') || ' comentou em: ' || _task.title,
      _task.id, _task.project_id, NEW.user_id, '/minhas-tarefas'
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER task_comments_notify
  AFTER INSERT ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_task_comment();