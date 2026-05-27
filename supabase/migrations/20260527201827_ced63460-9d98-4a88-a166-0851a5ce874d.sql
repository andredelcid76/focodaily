ALTER TABLE public.oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_auth_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages oauth clients"
ON public.oauth_clients
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "service role manages oauth auth codes"
ON public.oauth_auth_codes
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);