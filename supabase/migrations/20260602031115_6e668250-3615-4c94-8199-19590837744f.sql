
-- ============================================================
-- 1. PROFILES (display info for member listing)
-- ============================================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  email text NOT NULL,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read profiles (needed to display members/assignees).
-- Email/display_name only — no sensitive data here.
CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email)
  )
  ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill existing users
INSERT INTO public.profiles (user_id, email, display_name)
SELECT id, email, COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email)
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- 2. PROJECT MEMBERS
-- ============================================================
CREATE TABLE public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX idx_project_members_user ON public.project_members(user_id);
CREATE INDEX idx_project_members_project ON public.project_members(project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT ALL ON public.project_members TO service_role;

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Security definer helpers to avoid recursive RLS
CREATE OR REPLACE FUNCTION public.is_project_member(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = _project_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_project_owner(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = _project_id AND user_id = _user_id
  );
$$;

CREATE POLICY "Members view roster"
  ON public.project_members FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_project_owner(project_id, auth.uid())
    OR public.is_project_member(project_id, auth.uid())
  );

CREATE POLICY "Owner manages members"
  ON public.project_members FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner(project_id, auth.uid()));

CREATE POLICY "Owner removes members"
  ON public.project_members FOR DELETE TO authenticated
  USING (
    public.is_project_owner(project_id, auth.uid())
    OR user_id = auth.uid()  -- members can leave
  );

-- ============================================================
-- 3. PROJECT INVITES
-- ============================================================
CREATE TABLE public.project_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  invited_by uuid NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, email)
);

CREATE INDEX idx_project_invites_token ON public.project_invites(token);
CREATE INDEX idx_project_invites_email ON public.project_invites(lower(email));

GRANT SELECT, INSERT, DELETE ON public.project_invites TO authenticated;
GRANT ALL ON public.project_invites TO service_role;

ALTER TABLE public.project_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner views invites"
  ON public.project_invites FOR SELECT TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()));

CREATE POLICY "Owner creates invites"
  ON public.project_invites FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner(project_id, auth.uid()) AND invited_by = auth.uid());

CREATE POLICY "Owner deletes invites"
  ON public.project_invites FOR DELETE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()));

-- Accept invite function (security definer — bypasses RLS to find by token)
CREATE OR REPLACE FUNCTION public.accept_project_invite(_token text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _invite record;
  _user_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT email INTO _user_email FROM public.profiles WHERE user_id = auth.uid();

  SELECT * INTO _invite FROM public.project_invites
  WHERE token = _token AND accepted_at IS NULL AND expires_at > now();

  IF _invite IS NULL THEN
    RAISE EXCEPTION 'Invite not found, expired, or already accepted';
  END IF;

  IF lower(_invite.email) <> lower(_user_email) THEN
    RAISE EXCEPTION 'This invite was sent to a different email address';
  END IF;

  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (_invite.project_id, auth.uid(), 'member')
  ON CONFLICT (project_id, user_id) DO NOTHING;

  UPDATE public.project_invites
  SET accepted_at = now(), accepted_by = auth.uid()
  WHERE id = _invite.id;

  RETURN _invite.project_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_project_invite(text) TO authenticated;

-- ============================================================
-- 4. TASK ASSIGNEE
-- ============================================================
ALTER TABLE public.tasks ADD COLUMN assignee_id uuid;
CREATE INDEX idx_tasks_assignee ON public.tasks(assignee_id) WHERE assignee_id IS NOT NULL;

-- ============================================================
-- 5. UPDATE RLS: shared projects extend visibility
-- ============================================================

-- PROJECTS: owner OR member can SELECT; only owner can mutate
DROP POLICY IF EXISTS "Users view own projects" ON public.projects;
CREATE POLICY "Users view own or shared projects"
  ON public.projects FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_project_member(id, auth.uid()));

-- TASKS: own OR (project shared with me); same for update
DROP POLICY IF EXISTS "Users view own tasks" ON public.tasks;
CREATE POLICY "Users view own or shared tasks"
  ON public.tasks FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR (project_id IS NOT NULL AND public.is_project_member(project_id, auth.uid()))
  );

DROP POLICY IF EXISTS "Users update own tasks" ON public.tasks;
CREATE POLICY "Users update own or shared tasks"
  ON public.tasks FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR (project_id IS NOT NULL AND public.is_project_member(project_id, auth.uid()))
  );

-- Members can create tasks in shared projects (the task's user_id stays as creator)
DROP POLICY IF EXISTS "Users insert own tasks" ON public.tasks;
CREATE POLICY "Users insert tasks they own or in shared projects"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      project_id IS NULL
      OR auth.uid() = (SELECT user_id FROM public.projects WHERE id = project_id)
      OR public.is_project_member(project_id, auth.uid())
    )
  );

-- PROJECT_MILESTONES, PROJECT_COMMENTS, PROJECT_LINKS: extend SELECT to members
DROP POLICY IF EXISTS "Users view own milestones" ON public.project_milestones;
CREATE POLICY "Users view own or shared milestones"
  ON public.project_milestones FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_project_member(project_id, auth.uid()));

DROP POLICY IF EXISTS "Users insert own milestones" ON public.project_milestones;
CREATE POLICY "Users or members insert milestones"
  ON public.project_milestones FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (public.is_project_owner(project_id, auth.uid()) OR public.is_project_member(project_id, auth.uid()))
  );

DROP POLICY IF EXISTS "Users update own milestones" ON public.project_milestones;
CREATE POLICY "Users or members update milestones"
  ON public.project_milestones FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_project_member(project_id, auth.uid()));

DROP POLICY IF EXISTS "Users view own project comments" ON public.project_comments;
CREATE POLICY "Users view own or shared project comments"
  ON public.project_comments FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_project_member(project_id, auth.uid()));

DROP POLICY IF EXISTS "Users insert own project comments" ON public.project_comments;
CREATE POLICY "Users or members insert project comments"
  ON public.project_comments FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (public.is_project_owner(project_id, auth.uid()) OR public.is_project_member(project_id, auth.uid()))
  );

DROP POLICY IF EXISTS "Users view own project links" ON public.project_links;
CREATE POLICY "Users view own or shared project links"
  ON public.project_links FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_project_member(project_id, auth.uid()));

DROP POLICY IF EXISTS "Users insert own project links" ON public.project_links;
CREATE POLICY "Users or members insert project links"
  ON public.project_links FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (public.is_project_owner(project_id, auth.uid()) OR public.is_project_member(project_id, auth.uid()))
  );

-- MEETINGS: extend SELECT to project members
DROP POLICY IF EXISTS "Users view own meetings" ON public.meetings;
CREATE POLICY "Users view own or shared meetings"
  ON public.meetings FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR (project_id IS NOT NULL AND public.is_project_member(project_id, auth.uid()))
  );

-- TASK_SUBTASKS: extend SELECT via parent task
DROP POLICY IF EXISTS "Users view own subtasks" ON public.task_subtasks;
CREATE POLICY "Users view own or shared subtasks"
  ON public.task_subtasks FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_subtasks.task_id
        AND t.project_id IS NOT NULL
        AND public.is_project_member(t.project_id, auth.uid())
    )
  );
