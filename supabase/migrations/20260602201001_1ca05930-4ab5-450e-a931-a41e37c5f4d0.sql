DROP POLICY IF EXISTS "Project update by manager or above" ON public.projects;
CREATE POLICY "Project update by leader only"
ON public.projects FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);