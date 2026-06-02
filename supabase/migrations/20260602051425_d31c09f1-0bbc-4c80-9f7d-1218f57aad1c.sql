
-- 1. Aceitar novos valores em project_members.role
ALTER TABLE public.project_members DROP CONSTRAINT IF EXISTS project_members_role_check;
ALTER TABLE public.project_members ADD CONSTRAINT project_members_role_check
  CHECK (role IN ('owner', 'editor', 'viewer', 'member'));

-- Migrar 'member' para 'editor'
UPDATE public.project_members SET role = 'editor' WHERE role = 'member';

-- Ajustar default
ALTER TABLE public.project_members ALTER COLUMN role SET DEFAULT 'editor';

-- Re-restringir (sem 'member')
ALTER TABLE public.project_members DROP CONSTRAINT IF EXISTS project_members_role_check;
ALTER TABLE public.project_members ADD CONSTRAINT project_members_role_check
  CHECK (role IN ('owner', 'editor', 'viewer'));

-- 2. Mesma coisa para team_members
ALTER TABLE public.team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
ALTER TABLE public.team_members ADD CONSTRAINT team_members_role_check
  CHECK (role IN ('owner', 'editor', 'viewer', 'member'));
UPDATE public.team_members SET role = 'editor' WHERE role = 'member';
ALTER TABLE public.team_members ALTER COLUMN role SET DEFAULT 'editor';
ALTER TABLE public.team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
ALTER TABLE public.team_members ADD CONSTRAINT team_members_role_check
  CHECK (role IN ('owner', 'editor', 'viewer'));

-- 3. Adicionar coluna role nos convites
ALTER TABLE public.project_invites ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'editor'
  CHECK (role IN ('editor', 'viewer'));
ALTER TABLE public.team_invites ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'editor'
  CHECK (role IN ('editor', 'viewer'));

-- 4. Helpers
CREATE OR REPLACE FUNCTION public.can_edit_project(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects WHERE id = _project_id AND user_id = _user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = _project_id AND user_id = _user_id AND role IN ('owner','editor')
  )
  OR EXISTS (
    SELECT 1
    FROM public.projects p
    JOIN public.team_members tm ON tm.team_id = p.team_id
    WHERE p.id = _project_id AND tm.user_id = _user_id AND tm.role IN ('owner','editor')
  )
  OR EXISTS (
    SELECT 1
    FROM public.projects p
    JOIN public.teams t ON t.id = p.team_id
    WHERE p.id = _project_id AND t.owner_id = _user_id
  );
$$;

-- 5. Atualizar accept_project_invite e accept_team_invite para usar o role do convite
CREATE OR REPLACE FUNCTION public.accept_project_invite(_token text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _invite record;
  _user_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT email INTO _user_email FROM public.profiles WHERE user_id = auth.uid();
  SELECT * INTO _invite FROM public.project_invites
   WHERE token = _token AND accepted_at IS NULL AND expires_at > now();
  IF _invite IS NULL THEN RAISE EXCEPTION 'Invite not found, expired, or already accepted'; END IF;
  IF lower(_invite.email) <> lower(_user_email) THEN RAISE EXCEPTION 'This invite was sent to a different email address'; END IF;
  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (_invite.project_id, auth.uid(), COALESCE(_invite.role,'editor'))
  ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  UPDATE public.project_invites SET accepted_at = now(), accepted_by = auth.uid() WHERE id = _invite.id;
  RETURN _invite.project_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_team_invite(_token text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _invite record;
  _user_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT email INTO _user_email FROM public.profiles WHERE user_id = auth.uid();
  SELECT * INTO _invite FROM public.team_invites
   WHERE token = _token AND accepted_at IS NULL AND expires_at > now();
  IF _invite IS NULL THEN RAISE EXCEPTION 'Invite not found, expired, or already accepted'; END IF;
  IF lower(_invite.email) <> lower(_user_email) THEN RAISE EXCEPTION 'This invite was sent to a different email address'; END IF;
  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (_invite.team_id, auth.uid(), COALESCE(_invite.role,'editor'))
  ON CONFLICT (team_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  UPDATE public.team_invites SET accepted_at = now(), accepted_by = auth.uid() WHERE id = _invite.id;
  RETURN _invite.team_id;
END;
$$;

-- 6. Reescrever RLS para restringir escrita a owner/editor

-- tasks
DROP POLICY IF EXISTS "Users insert tasks they own or in shared projects" ON public.tasks;
DROP POLICY IF EXISTS "Users update own or shared tasks" ON public.tasks;
CREATE POLICY "Users insert tasks they own or as editor"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      project_id IS NULL
      OR public.can_edit_project(project_id, auth.uid())
    )
  );
CREATE POLICY "Users update own or shared tasks as editor"
  ON public.tasks FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR (project_id IS NOT NULL AND public.can_edit_project(project_id, auth.uid()))
  );

-- task_subtasks
DROP POLICY IF EXISTS "Users insert own subtasks" ON public.task_subtasks;
DROP POLICY IF EXISTS "Users update own subtasks" ON public.task_subtasks;
DROP POLICY IF EXISTS "Users delete own subtasks" ON public.task_subtasks;
CREATE POLICY "Users insert subtasks they own or as editor"
  ON public.task_subtasks FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.project_id IS NOT NULL AND public.can_edit_project(t.project_id, auth.uid()))
    )
  );
CREATE POLICY "Users update subtasks they own or as editor"
  ON public.task_subtasks FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.project_id IS NOT NULL AND public.can_edit_project(t.project_id, auth.uid()))
  );
CREATE POLICY "Users delete subtasks they own or as editor"
  ON public.task_subtasks FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.project_id IS NOT NULL AND public.can_edit_project(t.project_id, auth.uid()))
  );

-- project_milestones
DROP POLICY IF EXISTS "Users or members insert milestones" ON public.project_milestones;
DROP POLICY IF EXISTS "Users or members update milestones" ON public.project_milestones;
DROP POLICY IF EXISTS "Users delete own milestones" ON public.project_milestones;
CREATE POLICY "Users insert milestones as editor"
  ON public.project_milestones FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_edit_project(project_id, auth.uid()));
CREATE POLICY "Users update milestones as editor"
  ON public.project_milestones FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.can_edit_project(project_id, auth.uid()));
CREATE POLICY "Users delete milestones as editor"
  ON public.project_milestones FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.can_edit_project(project_id, auth.uid()));

-- project_comments
DROP POLICY IF EXISTS "Users or members insert project comments" ON public.project_comments;
DROP POLICY IF EXISTS "Users update own project comments" ON public.project_comments;
DROP POLICY IF EXISTS "Users delete own project comments" ON public.project_comments;
CREATE POLICY "Users insert comments as editor"
  ON public.project_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_edit_project(project_id, auth.uid()));
CREATE POLICY "Users update own comments"
  ON public.project_comments FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users delete own comments"
  ON public.project_comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- project_links
DROP POLICY IF EXISTS "Users or members insert project links" ON public.project_links;
DROP POLICY IF EXISTS "Users update own project links" ON public.project_links;
DROP POLICY IF EXISTS "Users delete own project links" ON public.project_links;
CREATE POLICY "Users insert links as editor"
  ON public.project_links FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_edit_project(project_id, auth.uid()));
CREATE POLICY "Users update links as editor"
  ON public.project_links FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.can_edit_project(project_id, auth.uid()));
CREATE POLICY "Users delete links as editor"
  ON public.project_links FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.can_edit_project(project_id, auth.uid()));
