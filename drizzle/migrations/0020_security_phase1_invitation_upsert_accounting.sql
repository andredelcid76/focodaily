DROP TRIGGER invitation_limit_contact ON public.contact_invites;
DROP TRIGGER invitation_limit_team ON public.team_invites;
DROP TRIGGER invitation_limit_project ON public.project_invites;
CREATE TRIGGER invitation_limit_contact AFTER INSERT OR UPDATE OF token ON public.contact_invites FOR EACH ROW EXECUTE FUNCTION public.enforce_invitation_limit();
CREATE TRIGGER invitation_limit_team AFTER INSERT OR UPDATE OF token ON public.team_invites FOR EACH ROW EXECUTE FUNCTION public.enforce_invitation_limit();
CREATE TRIGGER invitation_limit_project AFTER INSERT OR UPDATE OF token ON public.project_invites FOR EACH ROW EXECUTE FUNCTION public.enforce_invitation_limit();