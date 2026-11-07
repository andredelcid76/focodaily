-- Data-free "doorbell" broadcasts on each user's private topic (user:<uid>).
-- Postgres Changes cannot deliver an UPDATE to someone who lost access to the row
-- (RLS hides the new row), so the previous viewers are told to re-check the task by id.
CREATE OR REPLACE FUNCTION public.notify_task_access_doorbell()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid;
BEGIN
  FOR _uid IN
    SELECT DISTINCT c.u FROM (
      SELECT OLD.user_id AS u
      UNION ALL SELECT OLD.assignee_id
      UNION ALL SELECT pm.user_id FROM public.project_members pm
        WHERE OLD.project_id IS NOT NULL AND pm.project_id = OLD.project_id
      UNION ALL SELECT tm.user_id FROM public.projects p
        JOIN public.team_members tm ON tm.team_id = p.team_id
        WHERE OLD.project_id IS NOT NULL AND p.id = OLD.project_id
      UNION ALL SELECT t.owner_id FROM public.projects p
        JOIN public.teams t ON t.id = p.team_id
        WHERE OLD.project_id IS NOT NULL AND p.id = OLD.project_id
    ) c
    WHERE c.u IS NOT NULL
      AND c.u IS DISTINCT FROM NEW.user_id
      AND c.u IS DISTINCT FROM NEW.assignee_id
      AND NOT (NEW.project_id IS NOT NULL AND public.is_project_member(NEW.project_id, c.u))
  LOOP
    BEGIN
      PERFORM realtime.send(jsonb_build_object('task_id', OLD.id), 'task-access', 'user:' || _uid::text, true);
    EXCEPTION WHEN OTHERS THEN
      NULL; -- a realtime failure must never block the task update
    END;
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_task_access_doorbell() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_task_access_doorbell ON public.tasks;
CREATE TRIGGER trg_task_access_doorbell
AFTER UPDATE OF user_id, assignee_id, project_id ON public.tasks
FOR EACH ROW
WHEN (OLD.user_id IS DISTINCT FROM NEW.user_id
   OR OLD.assignee_id IS DISTINCT FROM NEW.assignee_id
   OR OLD.project_id IS DISTINCT FROM NEW.project_id)
EXECUTE FUNCTION public.notify_task_access_doorbell();

CREATE OR REPLACE FUNCTION public.notify_project_access_doorbell()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.user_id IS NOT NULL THEN
      PERFORM realtime.send(jsonb_build_object('project_id', NEW.project_id, 'change', 'added'), 'project-access', 'user:' || NEW.user_id::text, true);
    END IF;
    IF TG_OP IN ('DELETE', 'UPDATE') AND OLD.user_id IS NOT NULL
       AND (TG_OP = 'DELETE' OR OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.project_id IS DISTINCT FROM NEW.project_id) THEN
      PERFORM realtime.send(jsonb_build_object('project_id', OLD.project_id, 'change', 'removed'), 'project-access', 'user:' || OLD.user_id::text, true);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- membership changes must never fail because of realtime
  END;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_project_access_doorbell() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_project_access_doorbell ON public.project_members;
CREATE TRIGGER trg_project_access_doorbell
AFTER INSERT OR DELETE OR UPDATE OF user_id, project_id ON public.project_members
FOR EACH ROW
EXECUTE FUNCTION public.notify_project_access_doorbell();