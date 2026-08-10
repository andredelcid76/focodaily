CREATE TABLE public.contact_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inviter_id uuid NOT NULL,
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamp with time zone,
  accepted_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (inviter_id, email)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_invites TO authenticated;
GRANT ALL ON public.contact_invites TO service_role;

ALTER TABLE public.contact_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inviters manage their own contact invites"
  ON public.contact_invites FOR ALL
  TO authenticated
  USING (inviter_id = auth.uid())
  WITH CHECK (inviter_id = auth.uid());

CREATE POLICY "Invitees can view invites sent to their email"
  ON public.contact_invites FOR SELECT
  TO authenticated
  USING (
    lower(email) = lower(COALESCE((SELECT p.email FROM public.profiles p WHERE p.user_id = auth.uid()), ''))
  );

CREATE TRIGGER contact_invites_updated_at
  BEFORE UPDATE ON public.contact_invites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE public.contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (owner_id, contact_id),
  CHECK (owner_id <> contact_id)
);

GRANT SELECT, INSERT, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own contact links"
  ON public.contacts FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid() OR contact_id = auth.uid());

CREATE POLICY "Users can create their own contact links"
  ON public.contacts FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can remove their own contact links"
  ON public.contacts FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid() OR contact_id = auth.uid());

CREATE OR REPLACE FUNCTION public.accept_contact_invite(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _invite record; _user_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT email INTO _user_email FROM public.profiles WHERE user_id = auth.uid();
  SELECT * INTO _invite FROM public.contact_invites
   WHERE token = _token AND accepted_at IS NULL AND expires_at > now();
  IF _invite IS NULL THEN RAISE EXCEPTION 'Convite não encontrado, expirado ou já aceito'; END IF;
  IF lower(_invite.email) <> lower(COALESCE(_user_email, '')) THEN
    RAISE EXCEPTION 'Este convite foi enviado para outro e-mail';
  END IF;
  IF _invite.inviter_id = auth.uid() THEN RAISE EXCEPTION 'Você não pode aceitar seu próprio convite'; END IF;

  INSERT INTO public.contacts (owner_id, contact_id)
  VALUES (_invite.inviter_id, auth.uid())
  ON CONFLICT (owner_id, contact_id) DO NOTHING;

  INSERT INTO public.contacts (owner_id, contact_id)
  VALUES (auth.uid(), _invite.inviter_id)
  ON CONFLICT (owner_id, contact_id) DO NOTHING;

  UPDATE public.contact_invites
     SET accepted_at = now(), accepted_by = auth.uid()
   WHERE id = _invite.id;

  RETURN _invite.inviter_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_contact_invite(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_contact_invite(text) TO authenticated;