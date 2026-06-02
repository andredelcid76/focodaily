
-- Fix 1: Restrict profiles SELECT to self + collaborators (project members / team members)
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;

CREATE POLICY "Users can view collaborator profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.project_members pm_self
    JOIN public.project_members pm_other
      ON pm_self.project_id = pm_other.project_id
    WHERE pm_self.user_id = auth.uid()
      AND pm_other.user_id = profiles.user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = p.id AND pm.user_id = profiles.user_id
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.project_members pm
    JOIN public.projects p ON p.id = pm.project_id
    WHERE pm.user_id = auth.uid() AND p.user_id = profiles.user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.team_members tm_self
    JOIN public.team_members tm_other
      ON tm_self.team_id = tm_other.team_id
    WHERE tm_self.user_id = auth.uid()
      AND tm_other.user_id = profiles.user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.teams t
    WHERE t.owner_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = t.id AND tm.user_id = profiles.user_id
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = auth.uid() AND t.owner_id = profiles.user_id
  )
);

-- Fix 2: Lock down email queue SECURITY DEFINER functions
-- Revoke EXECUTE from anon/public; only service_role should call these from the server.
REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;

-- Fix 3: Set immutable search_path on the email queue functions (linter warning)
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
