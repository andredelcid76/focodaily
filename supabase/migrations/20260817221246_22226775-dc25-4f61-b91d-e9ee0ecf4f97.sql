REVOKE EXECUTE ON FUNCTION public.accept_contact_invite(text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_contact_invite(text) TO authenticated, service_role;