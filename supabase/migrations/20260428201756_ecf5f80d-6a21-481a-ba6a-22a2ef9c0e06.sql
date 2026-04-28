-- 1) OAuth CSRF protection: pending state tokens
CREATE TABLE IF NOT EXISTS public.oauth_pending_states (
  state_token text PRIMARY KEY,
  user_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'outlook',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);

ALTER TABLE public.oauth_pending_states ENABLE ROW LEVEL SECURITY;

-- Deny-all to clients; only service role (which bypasses RLS) writes/reads.
-- No policies created intentionally => no client access.

CREATE INDEX IF NOT EXISTS oauth_pending_states_expires_at_idx
  ON public.oauth_pending_states (expires_at);

-- 2) Restrict client access to outlook_connections sensitive columns.
-- Drop the broad SELECT policy and create a column-safe view.
DROP POLICY IF EXISTS "Users view own outlook conn" ON public.outlook_connections;

CREATE OR REPLACE VIEW public.outlook_connections_safe
WITH (security_invoker = true) AS
SELECT
  id, user_id, ms_user_id, email, display_name, scope,
  last_sync_at, expires_at, created_at, updated_at
FROM public.outlook_connections;

-- Re-add SELECT policy but only allow reading non-sensitive columns via the view.
-- Keep a SELECT policy on the base table so the view (security_invoker) works for the owner.
-- We restrict the base table SELECT through column privileges instead of policy text.
CREATE POLICY "Users view own outlook conn"
  ON public.outlook_connections
  FOR SELECT
  USING (auth.uid() = user_id);

-- Revoke direct column access to tokens for client roles.
REVOKE ALL ON public.outlook_connections FROM anon, authenticated;
GRANT SELECT (id, user_id, ms_user_id, email, display_name, scope,
              last_sync_at, expires_at, created_at, updated_at)
  ON public.outlook_connections TO authenticated;
-- INSERT/UPDATE/DELETE happen via service role on the server; no need for client grants.

GRANT SELECT ON public.outlook_connections_safe TO authenticated;

-- 3) Realtime: restrict channel subscriptions to the user's own topic.
-- Topic convention going forward: "user:<auth.uid()>"
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can subscribe to own realtime topic" ON realtime.messages;
CREATE POLICY "Users can subscribe to own realtime topic"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() = 'user:' || auth.uid()::text
  );
