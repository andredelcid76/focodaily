-- Revoke EXECUTE from public/authenticated on SECURITY DEFINER functions
-- that should not be called directly by signed-in users.
-- Trigger functions and RLS helpers don't need to be in the Data API.

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_task_assignment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_project_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_project_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- accept_project_invite must remain callable by authenticated users (used by invite flow)
-- so we keep its EXECUTE grant intact.
GRANT EXECUTE ON FUNCTION public.accept_project_invite(text) TO authenticated;