-- Restrict SECURITY DEFINER helper functions: revoke from anon and PUBLIC
REVOKE EXECUTE ON FUNCTION public.can_edit_project(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_project_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_project_manager_or_above(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enforce_member_task_constraints() FROM PUBLIC, anon;

-- Drop overly broad SELECT policy on public avatars bucket.
-- Files in a public bucket remain accessible by direct URL via the storage CDN;
-- removing this policy only prevents anonymous LISTING of all avatar files.
DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;