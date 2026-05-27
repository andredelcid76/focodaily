ALTER TABLE public.oauth_access_tokens
ADD COLUMN refresh_token_hash TEXT,
ADD COLUMN refresh_expires_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_access_tokens_refresh_hash
  ON public.oauth_access_tokens(refresh_token_hash)
  WHERE refresh_token_hash IS NOT NULL;