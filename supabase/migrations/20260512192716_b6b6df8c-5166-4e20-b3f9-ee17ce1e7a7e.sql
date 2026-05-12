CREATE POLICY "Users view own oauth pending states"
ON public.oauth_pending_states
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own oauth pending states"
ON public.oauth_pending_states
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own oauth pending states"
ON public.oauth_pending_states
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own oauth pending states"
ON public.oauth_pending_states
FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Users view own outlook connections"
ON public.outlook_connections
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own outlook connections"
ON public.outlook_connections
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own outlook connections"
ON public.outlook_connections
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own outlook connections"
ON public.outlook_connections
FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Users view own pipedrive connections"
ON public.pipedrive_connections
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own pipedrive connections"
ON public.pipedrive_connections
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own pipedrive connections"
ON public.pipedrive_connections
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own pipedrive connections"
ON public.pipedrive_connections
FOR DELETE
USING (auth.uid() = user_id);