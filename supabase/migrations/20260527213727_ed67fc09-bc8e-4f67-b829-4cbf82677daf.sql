
-- Lock down outlook_connections: remove direct user CRUD access. Client code already
-- reads via the outlook_connections_safe view and writes via server functions using the
-- service role (which bypasses RLS).
DROP POLICY IF EXISTS "Users view own outlook connections" ON public.outlook_connections;
DROP POLICY IF EXISTS "Users insert own outlook connections" ON public.outlook_connections;
DROP POLICY IF EXISTS "Users update own outlook connections" ON public.outlook_connections;
DROP POLICY IF EXISTS "Users delete own outlook connections" ON public.outlook_connections;

REVOKE ALL ON public.outlook_connections FROM anon, authenticated;
GRANT ALL ON public.outlook_connections TO service_role;

-- Lock down pipedrive_connections: remove direct user CRUD access. Tokens should only
-- be touched server-side via the service role.
DROP POLICY IF EXISTS "Users view own pipedrive connections" ON public.pipedrive_connections;
DROP POLICY IF EXISTS "Users insert own pipedrive connections" ON public.pipedrive_connections;
DROP POLICY IF EXISTS "Users update own pipedrive connections" ON public.pipedrive_connections;
DROP POLICY IF EXISTS "Users delete own pipedrive connections" ON public.pipedrive_connections;

REVOKE ALL ON public.pipedrive_connections FROM anon, authenticated;
GRANT ALL ON public.pipedrive_connections TO service_role;
