CREATE TABLE public.fireflies_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  api_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_sync_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fireflies_connections TO authenticated;
GRANT ALL ON public.fireflies_connections TO service_role;

ALTER TABLE public.fireflies_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own fireflies connection"
ON public.fireflies_connections FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own fireflies connection"
ON public.fireflies_connections FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own fireflies connection"
ON public.fireflies_connections FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own fireflies connection"
ON public.fireflies_connections FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER fireflies_connections_updated_at
BEFORE UPDATE ON public.fireflies_connections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Also add RLS policies for pipedrive_connections and outlook_connections (they exist but have no policies!)
ALTER TABLE public.pipedrive_connections ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipedrive_connections TO authenticated;
GRANT ALL ON public.pipedrive_connections TO service_role;

CREATE POLICY "Users view own pipedrive connection"
ON public.pipedrive_connections FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own pipedrive connection"
ON public.pipedrive_connections FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own pipedrive connection"
ON public.pipedrive_connections FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own pipedrive connection"
ON public.pipedrive_connections FOR DELETE
USING (auth.uid() = user_id);

ALTER TABLE public.outlook_connections ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outlook_connections TO authenticated;
GRANT ALL ON public.outlook_connections TO service_role;

CREATE POLICY "Users view own outlook connection"
ON public.outlook_connections FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own outlook connection"
ON public.outlook_connections FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own outlook connection"
ON public.outlook_connections FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own outlook connection"
ON public.outlook_connections FOR DELETE
USING (auth.uid() = user_id);