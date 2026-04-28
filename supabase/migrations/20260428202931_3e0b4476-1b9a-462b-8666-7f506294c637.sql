-- Revoke direct access to outlook_connections from client roles.
-- All access to OAuth tokens now happens server-side via service_role.
REVOKE ALL ON public.outlook_connections FROM authenticated, anon;

-- Drop the now-redundant RLS policies (table is service_role-only).
DROP POLICY IF EXISTS "Users view own outlook conn" ON public.outlook_connections;
DROP POLICY IF EXISTS "Users insert own outlook conn" ON public.outlook_connections;
DROP POLICY IF EXISTS "Users update own outlook conn" ON public.outlook_connections;
DROP POLICY IF EXISTS "Users delete own outlook conn" ON public.outlook_connections;

-- Keep RLS enabled as a defense-in-depth measure; with no policies and no grants,
-- only service_role (which bypasses RLS) can access this table.
-- The outlook_connections_safe view continues to expose non-sensitive metadata to authenticated users.