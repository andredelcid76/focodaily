REVOKE EXECUTE ON FUNCTION public.is_team_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.accept_team_invite(text) FROM PUBLIC, anon;