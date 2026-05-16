CREATE TABLE public.mcp_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text NOT NULL DEFAULT 'Claude',
  token_hash text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX idx_mcp_tokens_user ON public.mcp_tokens(user_id);
CREATE INDEX idx_mcp_tokens_hash ON public.mcp_tokens(token_hash) WHERE revoked_at IS NULL;

ALTER TABLE public.mcp_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own mcp tokens" ON public.mcp_tokens
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own mcp tokens" ON public.mcp_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own mcp tokens" ON public.mcp_tokens
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users delete own mcp tokens" ON public.mcp_tokens
  FOR DELETE USING (auth.uid() = user_id);