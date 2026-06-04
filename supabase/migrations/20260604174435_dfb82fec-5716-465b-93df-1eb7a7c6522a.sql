
-- Tighten DELETE on project_status_history to require current project membership
DROP POLICY IF EXISTS "Users delete own project history" ON public.project_status_history;
CREATE POLICY "Users delete own project history"
ON public.project_status_history
FOR DELETE
USING (auth.uid() = user_id AND public.is_project_member(project_id, auth.uid()));

-- Prevent task assignees (who are not the owner or a manager) from changing
-- ownership/scope fields like user_id, project_id, assignee_id.
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

  -- Creator of the task: full edit
  IF _actor_id IS NOT NULL AND NEW.user_id = _actor_id THEN
    RETURN NEW;
  END IF;

  -- Project manager or leader: full edit
  IF _actor_id IS NOT NULL AND NEW.project_id IS NOT NULL THEN
    SELECT public.is_project_manager_or_above(NEW.project_id, _actor_id) INTO _privileged;
    IF _privileged THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Assignee (delegatee): broad edit BUT cannot change ownership/scope fields
  IF _actor_id IS NOT NULL AND NEW.assignee_id IS NOT NULL AND OLD.assignee_id = _actor_id THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
      RAISE EXCEPTION 'Como responsável pela tarefa, você não pode alterar dono, projeto ou responsável';
    END IF;
    RETURN NEW;
  END IF;

  -- Otherwise, plain member of a shared project: restricted edit
  IF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
     OR NEW.planned_date IS DISTINCT FROM OLD.planned_date
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
     OR NEW.category IS DISTINCT FROM OLD.category
     OR NEW.non_negotiable IS DISTINCT FROM OLD.non_negotiable
     OR NEW.recurrence IS DISTINCT FROM OLD.recurrence THEN
    RAISE EXCEPTION 'Como membro, você só pode mudar status, conclusão e tempo desta tarefa delegada';
  END IF;

  RETURN NEW;
END;
$function$;
