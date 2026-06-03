DROP POLICY IF EXISTS "Users delete own project history" ON public.project_status_history;

CREATE POLICY "Users delete own project history"
ON public.project_status_history
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);