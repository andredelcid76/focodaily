
-- Lock OAuth/token tables to service-role only (server-side access via supabaseAdmin).
DROP POLICY IF EXISTS "Users view own outlook connection" ON public.outlook_connections;
DROP POLICY IF EXISTS "Users insert own outlook connection" ON public.outlook_connections;
DROP POLICY IF EXISTS "Users update own outlook connection" ON public.outlook_connections;
DROP POLICY IF EXISTS "Users delete own outlook connection" ON public.outlook_connections;

DROP POLICY IF EXISTS "Users view own pipedrive connection" ON public.pipedrive_connections;
DROP POLICY IF EXISTS "Users insert own pipedrive connection" ON public.pipedrive_connections;
DROP POLICY IF EXISTS "Users update own pipedrive connection" ON public.pipedrive_connections;
DROP POLICY IF EXISTS "Users delete own pipedrive connection" ON public.pipedrive_connections;

DROP POLICY IF EXISTS "Users view own fireflies connection" ON public.fireflies_connections;
DROP POLICY IF EXISTS "Users insert own fireflies connection" ON public.fireflies_connections;
DROP POLICY IF EXISTS "Users update own fireflies connection" ON public.fireflies_connections;
DROP POLICY IF EXISTS "Users delete own fireflies connection" ON public.fireflies_connections;

REVOKE ALL ON public.outlook_connections FROM anon, authenticated;
REVOKE ALL ON public.pipedrive_connections FROM anon, authenticated;
REVOKE ALL ON public.fireflies_connections FROM anon, authenticated;

-- Tighten project_status_history INSERT: caller must be a member of the project.
DROP POLICY IF EXISTS "Users insert own project history" ON public.project_status_history;
CREATE POLICY "Users insert own project history"
ON public.project_status_history
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND public.is_project_member(project_id, auth.uid())
);
