-- Restore EXECUTE on RLS helper functions. They are invoked by RLS policy
-- expressions in the caller's context, so authenticated must be able to call them.
-- They are safe: they only return a boolean indicating membership/ownership.
GRANT EXECUTE ON FUNCTION public.is_project_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_owner(uuid, uuid) TO authenticated;