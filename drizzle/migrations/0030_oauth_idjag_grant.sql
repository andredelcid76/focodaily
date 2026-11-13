CREATE TABLE public.oauth_external_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer text NOT NULL,
  subject text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  created_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  UNIQUE (issuer, subject)
);
GRANT ALL ON public.oauth_external_identities TO service_role;
ALTER TABLE public.oauth_external_identities ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.oauth_idjag_used_jti (
  jti text PRIMARY KEY,
  issuer text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);
GRANT ALL ON public.oauth_idjag_used_jti TO service_role;
ALTER TABLE public.oauth_idjag_used_jti ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.oauth_access_tokens ALTER COLUMN refresh_token_hash DROP NOT NULL;
ALTER TABLE public.oauth_access_tokens ALTER COLUMN refresh_expires_at DROP NOT NULL;

UPDATE public.oauth_clients
SET grant_types = array_append(grant_types, 'urn:ietf:params:oauth:grant-type:jwt-bearer')
WHERE client_name = 'Claude'
  AND NOT ('urn:ietf:params:oauth:grant-type:jwt-bearer' = ANY(grant_types));