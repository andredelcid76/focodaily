
-- 1. Restrict task_activity INSERT: only allow inserts for tasks the user has access to
DROP POLICY IF EXISTS "System inserts activity" ON public.task_activity;
CREATE POLICY "Users insert activity for accessible tasks"
  ON public.task_activity
  FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_activity.task_id
        AND (
          t.user_id = auth.uid()
          OR t.assignee_id = auth.uid()
          OR (t.project_id IS NOT NULL AND public.is_project_member(t.project_id, auth.uid()))
        )
    )
  );

-- 2. Drop redundant permissive service_role policies (service_role bypasses RLS anyway)
DROP POLICY IF EXISTS "service role manages oauth clients" ON public.oauth_clients;
DROP POLICY IF EXISTS "service role manages oauth auth codes" ON public.oauth_auth_codes;

-- 3. Revoke EXECUTE from anon on SECURITY DEFINER functions not meant to be public
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_task_activity() FROM anon, authenticated, PUBLIC;

-- 4. Fireflies: document intent with an explicit deny-all policy for clarity
-- (Access is service-role only; service_role bypasses RLS.)
CREATE POLICY "Block client access to fireflies connections"
  ON public.fireflies_connections
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
