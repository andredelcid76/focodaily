CREATE OR REPLACE FUNCTION public.company_domain_of(_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT lower(split_part(u.email, '@', 2))
  FROM auth.users u
  WHERE u.id = _user_id
    AND u.email_confirmed_at IS NOT NULL
    AND lower(split_part(u.email, '@', 2)) IN ('anpla.com.br')
$$;

CREATE OR REPLACE FUNCTION public.is_company_colleague(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.company_domain_of(_a) IS NOT NULL
     AND public.company_domain_of(_a) = public.company_domain_of(_b)
$$;

CREATE OR REPLACE FUNCTION public.company_colleague_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT u.id FROM auth.users u
  WHERE public.company_domain_of(auth.uid()) IS NOT NULL
    AND u.email_confirmed_at IS NOT NULL
    AND lower(split_part(u.email, '@', 2)) = public.company_domain_of(auth.uid())
$$;

REVOKE EXECUTE ON FUNCTION public.company_domain_of(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_company_colleague(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.company_colleague_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_company_colleague(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_colleague_ids() TO authenticated;

DROP POLICY IF EXISTS "Company colleagues can view profiles" ON public.profiles;
CREATE POLICY "Company colleagues can view profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_company_colleague(auth.uid(), user_id));

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture')
  )
  ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$function$;