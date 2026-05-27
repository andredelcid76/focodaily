-- OAuth clients (Dynamic Client Registration)
CREATE TABLE public.oauth_clients (
  id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  redirect_uris TEXT[] NOT NULL,
  token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
  grant_types TEXT[] NOT NULL DEFAULT ARRAY['authorization_code','refresh_token'],
  response_types TEXT[] NOT NULL DEFAULT ARRAY['code'],
  software_id TEXT,
  software_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.oauth_clients TO service_role;
ALTER TABLE public.oauth_clients ENABLE ROW LEVEL SECURITY;
-- No user-level policies: only server (service role) manages these.

-- Authorization codes (short-lived, PKCE)
CREATE TABLE public.oauth_auth_codes (
  code TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES public.oauth_clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL DEFAULT 'S256',
  scope TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_oauth_auth_codes_expires ON public.oauth_auth_codes(expires_at);

GRANT ALL ON public.oauth_auth_codes TO service_role;
ALTER TABLE public.oauth_auth_codes ENABLE ROW LEVEL SECURITY;
-- No user-level policies.

-- Access tokens
CREATE TABLE public.oauth_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL REFERENCES public.oauth_clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  scope TEXT,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_oauth_access_tokens_user ON public.oauth_access_tokens(user_id);
CREATE INDEX idx_oauth_access_tokens_hash ON public.oauth_access_tokens(token_hash);

GRANT SELECT, UPDATE ON public.oauth_access_tokens TO authenticated;
GRANT ALL ON public.oauth_access_tokens TO service_role;
ALTER TABLE public.oauth_access_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own oauth tokens"
  ON public.oauth_access_tokens FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users revoke own oauth tokens"
  ON public.oauth_access_tokens FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);