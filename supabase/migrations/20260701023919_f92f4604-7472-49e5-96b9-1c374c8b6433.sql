CREATE POLICY "Project members view shared task dependencies"
ON public.task_dependencies
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_dependencies.predecessor_id
      AND t.project_id IS NOT NULL
      AND public.is_project_member(t.project_id, auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_dependencies.successor_id
      AND t.project_id IS NOT NULL
      AND public.is_project_member(t.project_id, auth.uid())
  )
);