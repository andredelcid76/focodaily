
-- Drop legacy CHECK constraints that don't include the new vocabulary
ALTER TABLE public.project_members DROP CONSTRAINT IF EXISTS project_members_role_check;
ALTER TABLE public.team_members    DROP CONSTRAINT IF EXISTS team_members_role_check;
ALTER TABLE public.project_invites DROP CONSTRAINT IF EXISTS project_invites_role_check;
ALTER TABLE public.team_invites    DROP CONSTRAINT IF EXISTS team_invites_role_check;

-- Normalize existing roles to the new vocabulary
UPDATE public.project_members SET role = 'manager' WHERE role = 'editor';
UPDATE public.project_members SET role = 'member'  WHERE role = 'viewer';
UPDATE public.team_members    SET role = 'manager' WHERE role = 'editor';
UPDATE public.team_members    SET role = 'member'  WHERE role = 'viewer';
UPDATE public.project_invites SET role = 'manager' WHERE role = 'editor';
UPDATE public.project_invites SET role = 'member'  WHERE role = 'viewer';
UPDATE public.team_invites    SET role = 'manager' WHERE role = 'editor';
UPDATE public.team_invites    SET role = 'member'  WHERE role = 'viewer';

ALTER TABLE public.project_members ALTER COLUMN role SET DEFAULT 'member';
ALTER TABLE public.team_members    ALTER COLUMN role SET DEFAULT 'member';
ALTER TABLE public.project_invites ALTER COLUMN role SET DEFAULT 'member';
ALTER TABLE public.team_invites    ALTER COLUMN role SET DEFAULT 'member';

-- ============================================================
-- Helper functions
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_project_admin(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects WHERE id = _project_id AND user_id = _user_id)
      OR EXISTS (
        SELECT 1 FROM public.project_members
        WHERE project_id = _project_id AND user_id = _user_id AND role = 'admin'
      )
      OR EXISTS (
        SELECT 1 FROM public.projects p
        JOIN public.team_members tm ON tm.team_id = p.team_id
        WHERE p.id = _project_id AND tm.user_id = _user_id AND tm.role = 'admin'
      )
      OR EXISTS (
        SELECT 1 FROM public.projects p
        JOIN public.teams t ON t.id = p.team_id
        WHERE p.id = _project_id AND t.owner_id = _user_id
      );
$$;

CREATE OR REPLACE FUNCTION public.is_project_manager_or_above(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_project_admin(_project_id, _user_id)
      OR EXISTS (
        SELECT 1 FROM public.project_members
        WHERE project_id = _project_id AND user_id = _user_id AND role = 'manager'
      )
      OR EXISTS (
        SELECT 1 FROM public.projects p
        JOIN public.team_members tm ON tm.team_id = p.team_id
        WHERE p.id = _project_id AND tm.user_id = _user_id AND tm.role = 'manager'
      );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_project(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_project_manager_or_above(_project_id, _user_id);
$$;

-- ============================================================
-- Tasks RLS
-- ============================================================
DROP POLICY IF EXISTS "Users insert tasks they own or as editor" ON public.tasks;
DROP POLICY IF EXISTS "Users update own or shared tasks as editor" ON public.tasks;
DROP POLICY IF EXISTS "Users delete own tasks" ON public.tasks;

CREATE POLICY "Tasks insert as project member"
ON public.tasks FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (project_id IS NULL OR public.is_project_member(project_id, auth.uid()))
);

CREATE POLICY "Tasks update own assigned or as manager"
ON public.tasks FOR UPDATE TO authenticated
USING (
  auth.uid() = user_id
  OR auth.uid() = assignee_id
  OR (project_id IS NOT NULL AND public.is_project_manager_or_above(project_id, auth.uid()))
);

CREATE POLICY "Tasks delete own or as manager"
ON public.tasks FOR DELETE TO authenticated
USING (
  auth.uid() = user_id
  OR (project_id IS NOT NULL AND public.is_project_manager_or_above(project_id, auth.uid()))
);

-- Block member-assignees from changing sensitive fields
CREATE OR REPLACE FUNCTION public.enforce_member_task_constraints()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _privileged boolean;
BEGIN
  IF NEW.user_id = auth.uid() THEN RETURN NEW; END IF;
  IF NEW.project_id IS NOT NULL THEN
    SELECT public.is_project_manager_or_above(NEW.project_id, auth.uid()) INTO _privileged;
    IF _privileged THEN RETURN NEW; END IF;
  END IF;
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
$$;

DROP TRIGGER IF EXISTS enforce_member_task_constraints_trg ON public.tasks;
CREATE TRIGGER enforce_member_task_constraints_trg
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.enforce_member_task_constraints();

-- Projects: managers can edit description
DROP POLICY IF EXISTS "Users update own projects" ON public.projects;
CREATE POLICY "Project update by manager or above"
ON public.projects FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR public.is_project_manager_or_above(id, auth.uid()));

-- project_members: admins manage membership
DROP POLICY IF EXISTS "Owner manages members" ON public.project_members;
DROP POLICY IF EXISTS "Owner removes members" ON public.project_members;

CREATE POLICY "Admins add members"
ON public.project_members FOR INSERT TO authenticated
WITH CHECK (public.is_project_admin(project_id, auth.uid()));

CREATE POLICY "Admins remove or self leaves"
ON public.project_members FOR DELETE TO authenticated
USING (public.is_project_admin(project_id, auth.uid()) OR user_id = auth.uid());

CREATE POLICY "Admins change roles"
ON public.project_members FOR UPDATE TO authenticated
USING (public.is_project_admin(project_id, auth.uid()))
WITH CHECK (public.is_project_admin(project_id, auth.uid()));

-- project_invites: admins manage invites
DROP POLICY IF EXISTS "Owner creates invites" ON public.project_invites;
DROP POLICY IF EXISTS "Owner deletes invites" ON public.project_invites;
DROP POLICY IF EXISTS "Owner views invites" ON public.project_invites;

CREATE POLICY "Admins create project invites"
ON public.project_invites FOR INSERT TO authenticated
WITH CHECK (public.is_project_admin(project_id, auth.uid()) AND invited_by = auth.uid());

CREATE POLICY "Admins delete project invites"
ON public.project_invites FOR DELETE TO authenticated
USING (public.is_project_admin(project_id, auth.uid()));

CREATE POLICY "Admins view project invites"
ON public.project_invites FOR SELECT TO authenticated
USING (public.is_project_admin(project_id, auth.uid()));

-- Default invite role -> 'member'
CREATE OR REPLACE FUNCTION public.accept_project_invite(_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _invite record; _user_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT email INTO _user_email FROM public.profiles WHERE user_id = auth.uid();
  SELECT * INTO _invite FROM public.project_invites
   WHERE token = _token AND accepted_at IS NULL AND expires_at > now();
  IF _invite IS NULL THEN RAISE EXCEPTION 'Invite not found, expired, or already accepted'; END IF;
  IF lower(_invite.email) <> lower(_user_email) THEN RAISE EXCEPTION 'This invite was sent to a different email address'; END IF;
  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (_invite.project_id, auth.uid(), COALESCE(_invite.role,'member'))
  ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  UPDATE public.project_invites SET accepted_at = now(), accepted_by = auth.uid() WHERE id = _invite.id;
  RETURN _invite.project_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_team_invite(_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _invite record; _user_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT email INTO _user_email FROM public.profiles WHERE user_id = auth.uid();
  SELECT * INTO _invite FROM public.team_invites
   WHERE token = _token AND accepted_at IS NULL AND expires_at > now();
  IF _invite IS NULL THEN RAISE EXCEPTION 'Invite not found, expired, or already accepted'; END IF;
  IF lower(_invite.email) <> lower(_user_email) THEN RAISE EXCEPTION 'This invite was sent to a different email address'; END IF;
  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (_invite.team_id, auth.uid(), COALESCE(_invite.role,'member'))
  ON CONFLICT (team_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  UPDATE public.team_invites SET accepted_at = now(), accepted_by = auth.uid() WHERE id = _invite.id;
  RETURN _invite.team_id;
END;
$$;
