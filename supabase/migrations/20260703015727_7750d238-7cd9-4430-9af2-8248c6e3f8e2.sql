ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS members_can_reassign boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.enforce_member_task_constraints()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _privileged boolean;
  _actor_id uuid;
  _members_can_reassign boolean;
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
    -- Check if members can reassign in this project
    IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id AND NEW.project_id IS NOT NULL THEN
      SELECT members_can_reassign INTO _members_can_reassign
        FROM public.projects WHERE id = NEW.project_id;
      IF COALESCE(_members_can_reassign, true) = false THEN
        RAISE EXCEPTION 'Apenas o dono ou administradores deste projeto podem reatribuir tarefas';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Plain project member
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    RAISE EXCEPTION 'Como membro, você não pode alterar dono ou projeto desta tarefa';
  END IF;

  -- Reassignment check for plain members
  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id AND NEW.project_id IS NOT NULL THEN
    SELECT members_can_reassign INTO _members_can_reassign
      FROM public.projects WHERE id = NEW.project_id;
    IF COALESCE(_members_can_reassign, true) = false THEN
      RAISE EXCEPTION 'Apenas o dono ou administradores deste projeto podem reatribuir tarefas';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;