DROP POLICY IF EXISTS "Tasks update own assigned or as manager" ON public.tasks;

CREATE POLICY "Tasks update own assigned or project member"
ON public.tasks
FOR UPDATE
USING (
  auth.uid() = user_id
  OR auth.uid() = assignee_id
  OR (project_id IS NOT NULL AND public.is_project_member(project_id, auth.uid()))
)
WITH CHECK (
  auth.uid() = user_id
  OR auth.uid() = assignee_id
  OR (project_id IS NOT NULL AND public.is_project_member(project_id, auth.uid()))
);