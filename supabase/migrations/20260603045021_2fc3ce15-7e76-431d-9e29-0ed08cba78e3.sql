CREATE OR REPLACE FUNCTION public.enforce_member_task_constraints()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _privileged boolean;
BEGIN
  -- Creator of the task: full edit
  IF NEW.user_id = auth.uid() THEN RETURN NEW; END IF;
  -- Assignee (delegatee / owner of the agenda where the task landed): full edit
  IF NEW.assignee_id IS NOT NULL AND NEW.assignee_id = auth.uid() THEN RETURN NEW; END IF;
  -- Project manager or leader: full edit
  IF NEW.project_id IS NOT NULL THEN
    SELECT public.is_project_manager_or_above(NEW.project_id, auth.uid()) INTO _privileged;
    IF _privileged THEN RETURN NEW; END IF;
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