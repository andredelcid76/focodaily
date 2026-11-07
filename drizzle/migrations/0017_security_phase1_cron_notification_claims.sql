CREATE TABLE public.cron_credentials (id integer PRIMARY KEY DEFAULT 1, secret text NOT NULL, CONSTRAINT cron_credentials_singleton CHECK (id = 1));
GRANT ALL ON public.cron_credentials TO service_role;
ALTER TABLE public.cron_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cron_credentials FROM anon, authenticated;
ALTER TABLE public.notifications ADD COLUMN delivery_claim_id uuid;
CREATE OR REPLACE FUNCTION public.claim_pending_notifications() RETURNS SETOF public.notifications LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.notifications SET emailed_at = now(), delivery_claim_id = gen_random_uuid()
  WHERE id IN (
    SELECT id FROM public.notifications
    WHERE emailed_at IS NULL AND delivery_claim_id IS NULL
      AND created_at >= now() - interval '24 hours'
      AND type IN ('task_assigned','task_completed','task_updated','task_comment','task_mention','task_blocked','task_unblocked','task_due_soon','task_overdue')
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 50
  ) RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_pending_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_notifications() TO service_role;
CREATE OR REPLACE FUNCTION public.foco_cron_post(_path text) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _secret text;
BEGIN
  IF _path NOT IN ('/api/public/notifications/tick','/api/public/notifications/dispatch','/api/public/inbox/scan-all') THEN RAISE EXCEPTION 'Invalid cron endpoint'; END IF;
  SELECT secret INTO _secret FROM public.cron_credentials WHERE id=1;
  IF _secret IS NULL THEN RAISE WARNING 'CRON_SECRET scheduler setup pending'; RETURN NULL; END IF;
  RETURN net.http_post(url := 'https://focodaily.lovable.app' || _path, headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',_secret), body := '{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.foco_cron_post(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.foco_cron_post(text) TO service_role;
CREATE OR REPLACE FUNCTION public.notification_delivery_wake() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.type <> 'task_assigned' THEN RETURN NULL; END IF;
  BEGIN PERFORM public.foco_cron_post('/api/public/notifications/dispatch'); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'notification_delivery_wake failed'; END;
  RETURN NULL;
END $$;
DO $$ DECLARE _job record; BEGIN
  FOR _job IN SELECT jobid, command FROM cron.job WHERE command LIKE '%/api/public/notifications/tick%' OR command LIKE '%/api/public/inbox/scan-all%' LOOP
    IF _job.command LIKE '%/api/public/notifications/tick%' THEN
      PERFORM cron.alter_job(_job.jobid, command := 'SELECT public.foco_cron_post(''/api/public/notifications/tick'');');
    ELSE
      PERFORM cron.alter_job(_job.jobid, command := 'SELECT public.foco_cron_post(''/api/public/inbox/scan-all'');');
    END IF;
  END LOOP;
END $$;