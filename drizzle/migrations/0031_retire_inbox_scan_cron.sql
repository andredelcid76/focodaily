CREATE OR REPLACE FUNCTION public.foco_cron_post(_path text) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _secret text;
BEGIN
  IF _path NOT IN ('/api/public/notifications/tick','/api/public/notifications/dispatch','/api/public/sync/scan-all') THEN RAISE EXCEPTION 'Invalid cron endpoint'; END IF;
  SELECT secret INTO _secret FROM public.cron_credentials WHERE id=1;
  IF _secret IS NULL THEN RAISE WARNING 'CRON_SECRET scheduler setup pending'; RETURN NULL; END IF;
  RETURN net.http_post(url := 'https://focodaily.lovable.app' || _path, headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',_secret), body := '{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.foco_cron_post(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.foco_cron_post(text) TO service_role;

DO $$ DECLARE j record; BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR j IN SELECT jobid FROM cron.job WHERE jobname IN ('inbox-scan-all-every-2h','inbox-scan-every-2h') OR command LIKE '%/api/public/inbox/%' LOOP
      PERFORM cron.unschedule(j.jobid);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sources-sync-every-2h') THEN
      PERFORM cron.schedule('sources-sync-every-2h', '0 */2 * * *', $cmd$SELECT public.foco_cron_post('/api/public/sync/scan-all');$cmd$);
    END IF;
  END IF;
END $$;