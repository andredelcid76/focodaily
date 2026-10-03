CREATE POLICY "Profiles visible via shared tasks" ON public.profiles FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.tasks t WHERE (t.user_id = auth.uid() AND t.assignee_id = profiles.user_id) OR (t.assignee_id = auth.uid() AND t.user_id = profiles.user_id)));
CREATE INDEX IF NOT EXISTS tasks_user_assignee_idx ON public.tasks (user_id, assignee_id);
CREATE INDEX IF NOT EXISTS tasks_assignee_user_idx ON public.tasks (assignee_id, user_id);