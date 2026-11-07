ALTER TABLE public.notifications ADD COLUMN delivery_attempts integer NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.claim_pending_notifications() RETURNS SETOF public.notifications LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.notifications SET
    emailed_at = CASE WHEN delivery_attempts >= 5 THEN emailed_at ELSE NULL END,
    delivery_claim_id = NULL,
    delivery_error = concat_ws(' | ', NULLIF(delivery_error, ''), CASE WHEN delivery_attempts >= 5 THEN 'delivery:attempt_limit_5' ELSE 'delivery:orphan_claim_recovered' END)
  WHERE id IN (SELECT id FROM public.notifications WHERE delivery_claim_id IS NOT NULL AND emailed_at < now() - interval '15 minutes' FOR UPDATE SKIP LOCKED);
  UPDATE public.notifications SET emailed_at = now(), delivery_error = concat_ws(' | ', NULLIF(delivery_error, ''), 'delivery:attempt_limit_5')
  WHERE emailed_at IS NULL AND delivery_claim_id IS NULL AND delivery_attempts >= 5;
  RETURN QUERY UPDATE public.notifications SET emailed_at = now(), delivery_claim_id = gen_random_uuid(), delivery_attempts = delivery_attempts + 1
  WHERE id IN (
    SELECT id FROM public.notifications
    WHERE emailed_at IS NULL AND delivery_claim_id IS NULL AND delivery_attempts < 5
      AND created_at >= now() - interval '24 hours'
      AND type IN ('task_assigned','task_completed','task_updated','task_comment','task_mention','task_blocked','task_unblocked','task_due_soon','task_overdue')
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 50
  ) RETURNING *;
END $$;
REVOKE ALL ON FUNCTION public.claim_pending_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_notifications() TO service_role;
CREATE OR REPLACE FUNCTION public.finish_notification_delivery(_id uuid, _claim uuid, _failed boolean, _teams_ok boolean, _digest boolean, _error text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.notifications SET
    emailed_at = CASE WHEN _failed AND delivery_attempts < 5 THEN NULL ELSE COALESCE(emailed_at, now()) END,
    teams_sent_at = CASE WHEN _teams_ok THEN now() ELSE teams_sent_at END,
    digest_pending = _digest,
    delivery_error = CASE WHEN _failed AND delivery_attempts >= 5 THEN concat_ws(' | ', NULLIF(_error, ''), 'delivery:attempt_limit_5') ELSE _error END,
    delivery_claim_id = NULL
  WHERE id = _id AND delivery_claim_id = _claim;
END $$;
REVOKE ALL ON FUNCTION public.finish_notification_delivery(uuid,uuid,boolean,boolean,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_notification_delivery(uuid,uuid,boolean,boolean,boolean,text) TO service_role;