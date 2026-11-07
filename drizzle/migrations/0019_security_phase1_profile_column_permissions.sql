REVOKE UPDATE ON public.profiles FROM authenticated;
REVOKE UPDATE(email) ON public.profiles FROM authenticated;
DO $$ DECLARE _columns text; BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO _columns
    FROM pg_attribute WHERE attrelid='public.profiles'::regclass AND attnum>0 AND NOT attisdropped AND attname <> 'email';
  EXECUTE 'GRANT UPDATE (' || _columns || ') ON public.profiles TO authenticated';
END $$;
ALTER FUNCTION public.protect_profile_email() SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.protect_profile_email() FROM PUBLIC, anon, authenticated;