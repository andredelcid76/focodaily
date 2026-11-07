CREATE OR REPLACE FUNCTION public.current_actor_id() RETURNS uuid LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  BEGIN _id := auth.uid(); EXCEPTION WHEN OTHERS THEN _id := NULL; END;
  IF _id IS NOT NULL THEN RETURN _id; END IF;
  IF COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN RETURN NULL; END IF;
  BEGIN _id := NULLIF(current_setting('request.headers', true)::json ->> 'x-foco-actor-id', '')::uuid; EXCEPTION WHEN OTHERS THEN RETURN NULL; END;
  RETURN _id;
END $$;
CREATE OR REPLACE FUNCTION public.enforce_member_task_constraints() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor_id uuid := public.current_actor_id(); _privileged boolean := false; _members_can_reassign boolean;
BEGIN
  IF _actor_id IS NOT NULL AND OLD.project_id IS NOT NULL THEN
    _privileged := public.is_project_manager_or_above(OLD.project_id, _actor_id);
  END IF;
  IF NEW.project_id IS DISTINCT FROM OLD.project_id AND NEW.project_id IS NOT NULL THEN
    IF _actor_id IS NULL OR NOT (public.is_project_member(NEW.project_id, _actor_id) OR public.is_project_owner(NEW.project_id, _actor_id)) THEN
      RAISE EXCEPTION 'Sem acesso ao projeto de destino';
    END IF;
  END IF;
  IF _actor_id IS NOT NULL AND (OLD.user_id = _actor_id OR COALESCE(_privileged, false)) THEN RETURN NEW; END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    RAISE EXCEPTION 'Apenas o dono atual ou gestor do projeto de origem pode alterar dono ou projeto';
  END IF;
  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id AND OLD.project_id IS NOT NULL THEN
    SELECT members_can_reassign INTO _members_can_reassign FROM public.projects WHERE id = OLD.project_id;
    IF COALESCE(_members_can_reassign, true) = false THEN RAISE EXCEPTION 'Apenas o dono ou administradores deste projeto podem reatribuir tarefas'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TABLE public.invitation_send_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.invitation_send_log TO service_role;
ALTER TABLE public.invitation_send_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX invitation_send_log_user_time ON public.invitation_send_log(user_id, created_at);
CREATE OR REPLACE FUNCTION public.enforce_invitation_limit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sender uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.token IS NOT DISTINCT FROM OLD.token THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'contact_invites' THEN _sender := NEW.inviter_id; ELSE _sender := NEW.invited_by; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('foco-invites:' || _sender::text, 0));
  IF (SELECT count(*) FROM public.invitation_send_log WHERE user_id = _sender AND created_at > now() - interval '24 hours') >= 20 THEN
    RAISE EXCEPTION 'Você atingiu o limite de 20 convites em 24 horas. Tente novamente mais tarde.';
  END IF;
  INSERT INTO public.invitation_send_log(user_id) VALUES (_sender);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_invitation_limit() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER invitation_limit_contact BEFORE INSERT OR UPDATE OF token ON public.contact_invites FOR EACH ROW EXECUTE FUNCTION public.enforce_invitation_limit();
CREATE TRIGGER invitation_limit_team BEFORE INSERT OR UPDATE OF token ON public.team_invites FOR EACH ROW EXECUTE FUNCTION public.enforce_invitation_limit();
CREATE TRIGGER invitation_limit_project BEFORE INSERT OR UPDATE OF token ON public.project_invites FOR EACH ROW EXECUTE FUNCTION public.enforce_invitation_limit();
CREATE OR REPLACE FUNCTION public.protect_profile_email() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email AND COALESCE(auth.role(), '') <> 'service_role' THEN
    IF NOT (pg_trigger_depth() > 1 AND EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.user_id AND email = NEW.email)) THEN NEW.email := OLD.email; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_profile_email BEFORE UPDATE OF email ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_email();
CREATE OR REPLACE FUNCTION public.sync_auth_profile_email() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles SET email = NEW.email WHERE user_id = NEW.id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_auth_profile_email() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER foco_sync_auth_email AFTER UPDATE OF email ON auth.users FOR EACH ROW WHEN (OLD.email IS DISTINCT FROM NEW.email) EXECUTE FUNCTION public.sync_auth_profile_email();
CREATE OR REPLACE FUNCTION public.accept_project_invite(_token text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _invite record; _user_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT email INTO _user_email FROM auth.users WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL;
  IF _user_email IS NULL THEN RAISE EXCEPTION 'Confirme seu e-mail antes de aceitar o convite'; END IF;
  SELECT * INTO _invite FROM public.project_invites WHERE token = _token AND accepted_at IS NULL AND expires_at > now() FOR UPDATE;
  IF _invite IS NULL THEN RAISE EXCEPTION 'Convite não encontrado, expirado ou já aceito'; END IF;
  IF lower(_invite.email) <> lower(_user_email) THEN RAISE EXCEPTION 'Este convite foi enviado para outro e-mail'; END IF;
  INSERT INTO public.project_members(project_id,user_id,role) VALUES (_invite.project_id,auth.uid(),COALESCE(_invite.role,'member')) ON CONFLICT(project_id,user_id) DO UPDATE SET role=EXCLUDED.role;
  UPDATE public.project_invites SET accepted_at=now(),accepted_by=auth.uid() WHERE id=_invite.id;
  RETURN _invite.project_id;
END $$;
CREATE OR REPLACE FUNCTION public.accept_team_invite(_token text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _invite record; _user_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT email INTO _user_email FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL;
  IF _user_email IS NULL THEN RAISE EXCEPTION 'Confirme seu e-mail antes de aceitar o convite'; END IF;
  SELECT * INTO _invite FROM public.team_invites WHERE token=_token AND accepted_at IS NULL AND expires_at>now() FOR UPDATE;
  IF _invite IS NULL THEN RAISE EXCEPTION 'Convite não encontrado, expirado ou já aceito'; END IF;
  IF lower(_invite.email)<>lower(_user_email) THEN RAISE EXCEPTION 'Este convite foi enviado para outro e-mail'; END IF;
  INSERT INTO public.team_members(team_id,user_id,role) VALUES (_invite.team_id,auth.uid(),COALESCE(_invite.role,'member')) ON CONFLICT(team_id,user_id) DO UPDATE SET role=EXCLUDED.role;
  UPDATE public.team_invites SET accepted_at=now(),accepted_by=auth.uid() WHERE id=_invite.id;
  RETURN _invite.team_id;
END $$;
CREATE OR REPLACE FUNCTION public.accept_contact_invite(_token text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _invite record; _user_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT email INTO _user_email FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL;
  IF _user_email IS NULL THEN RAISE EXCEPTION 'Confirme seu e-mail antes de aceitar o convite'; END IF;
  SELECT * INTO _invite FROM public.contact_invites WHERE token=_token AND accepted_at IS NULL AND expires_at>now() FOR UPDATE;
  IF _invite IS NULL THEN RAISE EXCEPTION 'Convite não encontrado, expirado ou já aceito'; END IF;
  IF lower(_invite.email)<>lower(_user_email) THEN RAISE EXCEPTION 'Este convite foi enviado para outro e-mail'; END IF;
  IF _invite.inviter_id=auth.uid() THEN RAISE EXCEPTION 'Você não pode aceitar seu próprio convite'; END IF;
  INSERT INTO public.contacts(owner_id,contact_id) VALUES (_invite.inviter_id,auth.uid()),(auth.uid(),_invite.inviter_id) ON CONFLICT(owner_id,contact_id) DO NOTHING;
  UPDATE public.contact_invites SET accepted_at=now(),accepted_by=auth.uid() WHERE id=_invite.id;
  RETURN _invite.inviter_id;
END $$;
REVOKE SELECT ON public.contact_invites FROM authenticated;
REVOKE SELECT(token) ON public.contact_invites FROM authenticated;
GRANT SELECT(id,inviter_id,email,expires_at,accepted_at,accepted_by,created_at,updated_at) ON public.contact_invites TO authenticated;
CREATE OR REPLACE FUNCTION public.enforce_foco_signup() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _email text := lower(trim(COALESCE(NEW.email, '')));
BEGIN
  IF _email LIKE '%@anpla.com.br' THEN RETURN NEW; END IF;
  IF EXISTS(SELECT 1 FROM public.project_invites WHERE lower(email)=_email AND accepted_at IS NULL AND expires_at>now())
     OR EXISTS(SELECT 1 FROM public.team_invites WHERE lower(email)=_email AND accepted_at IS NULL AND expires_at>now())
     OR EXISTS(SELECT 1 FROM public.contact_invites WHERE lower(email)=_email AND accepted_at IS NULL AND expires_at>now()) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'FOCO_SIGNUP_RESTRICTED: O Foco é restrito à equipe Anpla. Peça um convite.';
END $$;
REVOKE ALL ON FUNCTION public.enforce_foco_signup() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER foco_restrict_signup BEFORE INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.enforce_foco_signup();