DROP POLICY IF EXISTS "Users view own project history" ON public.project_status_history;
CREATE POLICY "Members view project history"
  ON public.project_status_history FOR SELECT
  TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

DROP POLICY IF EXISTS "Users delete own project history" ON public.project_status_history;
CREATE POLICY "Users delete own project history"
  ON public.project_status_history FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id AND public.is_project_member(project_id, auth.uid()));