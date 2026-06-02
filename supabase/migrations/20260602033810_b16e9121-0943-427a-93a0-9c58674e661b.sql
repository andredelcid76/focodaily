-- ============================================================
-- TEAMS
-- ============================================================
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#8b5cf6',
  icon text NOT NULL DEFAULT 'users',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER teams_set_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- TEAM MEMBERS
-- ============================================================
CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);

CREATE INDEX idx_team_members_user ON public.team_members(user_id);
CREATE INDEX idx_team_members_team ON public.team_members(team_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TEAM INVITES
-- ============================================================
CREATE TABLE public.team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  invited_by uuid NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, email)
);

CREATE INDEX idx_team_invites_token ON public.team_invites(token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_invites TO authenticated;
GRANT ALL ON public.team_invites TO service_role;

ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Add team_id to projects
-- ============================================================
ALTER TABLE public.projects
  ADD COLUMN team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE INDEX idx_projects_team ON public.projects(team_id);

-- ============================================================
-- Helper functions (SECURITY DEFINER, avoid recursion in policies)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_team_owner(_team_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teams
    WHERE id = _team_id AND owner_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_team_member(_team_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = _team_id AND user_id = _user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.teams
    WHERE id = _team_id AND owner_id = _user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_team_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) TO authenticated;

-- ============================================================
-- Extend is_project_member to consider team membership
-- Existing RLS policies don't need to change — they call this function.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_project_member(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = _project_id AND user_id = _user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = _project_id
      AND p.team_id IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.team_id = p.team_id AND tm.user_id = _user_id
        )
        OR EXISTS (
          SELECT 1 FROM public.teams t
          WHERE t.id = p.team_id AND t.owner_id = _user_id
        )
      )
  );
$$;

-- ============================================================
-- RLS: teams
-- ============================================================
CREATE POLICY "Users view own or member teams"
  ON public.teams FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = teams.id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users create own teams"
  ON public.teams FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner updates team"
  ON public.teams FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner deletes team"
  ON public.teams FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- ============================================================
-- RLS: team_members
-- ============================================================
CREATE POLICY "Members view roster"
  ON public.team_members FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_team_owner(team_id, auth.uid())
    OR is_team_member(team_id, auth.uid())
  );

CREATE POLICY "Owner adds members"
  ON public.team_members FOR INSERT TO authenticated
  WITH CHECK (is_team_owner(team_id, auth.uid()));

CREATE POLICY "Owner or self removes member"
  ON public.team_members FOR DELETE TO authenticated
  USING (is_team_owner(team_id, auth.uid()) OR user_id = auth.uid());

-- ============================================================
-- RLS: team_invites
-- ============================================================
CREATE POLICY "Owner creates team invites"
  ON public.team_invites FOR INSERT TO authenticated
  WITH CHECK (is_team_owner(team_id, auth.uid()) AND invited_by = auth.uid());

CREATE POLICY "Owner views team invites"
  ON public.team_invites FOR SELECT TO authenticated
  USING (is_team_owner(team_id, auth.uid()));

CREATE POLICY "Owner deletes team invites"
  ON public.team_invites FOR DELETE TO authenticated
  USING (is_team_owner(team_id, auth.uid()));

-- ============================================================
-- accept_team_invite RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.accept_team_invite(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invite record;
  _user_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT email INTO _user_email FROM public.profiles WHERE user_id = auth.uid();

  SELECT * INTO _invite FROM public.team_invites
  WHERE token = _token AND accepted_at IS NULL AND expires_at > now();

  IF _invite IS NULL THEN
    RAISE EXCEPTION 'Invite not found, expired, or already accepted';
  END IF;

  IF lower(_invite.email) <> lower(_user_email) THEN
    RAISE EXCEPTION 'This invite was sent to a different email address';
  END IF;

  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (_invite.team_id, auth.uid(), 'member')
  ON CONFLICT (team_id, user_id) DO NOTHING;

  UPDATE public.team_invites
  SET accepted_at = now(), accepted_by = auth.uid()
  WHERE id = _invite.id;

  RETURN _invite.team_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_team_invite(text) TO authenticated;