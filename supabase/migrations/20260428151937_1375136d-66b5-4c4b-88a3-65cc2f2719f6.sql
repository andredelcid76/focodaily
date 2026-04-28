
CREATE TABLE public.outlook_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  ms_user_id text,
  email text,
  display_name text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  scope text,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.outlook_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own outlook conn" ON public.outlook_connections
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own outlook conn" ON public.outlook_connections
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own outlook conn" ON public.outlook_connections
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own outlook conn" ON public.outlook_connections
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER outlook_connections_updated_at
  BEFORE UPDATE ON public.outlook_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS meetings_user_external_unique
  ON public.meetings(user_id, external_id)
  WHERE external_id IS NOT NULL;
