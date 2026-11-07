CREATE OR REPLACE FUNCTION public.finish_notification_delivery(_id uuid, _claim uuid, _failed boolean, _teams_ok boolean, _digest boolean, _error text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.notifications SET
    emailed_at = CASE WHEN _failed OR emailed_at IS NULL THEN NULL ELSE emailed_at END,
    teams_sent_at = CASE WHEN _teams_ok THEN now() ELSE teams_sent_at END,
    digest_pending = _digest,
    delivery_error = _error,
    delivery_claim_id = NULL
  WHERE id = _id AND delivery_claim_id = _claim;
END $$;
REVOKE ALL ON FUNCTION public.finish_notification_delivery(uuid,uuid,boolean,boolean,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_notification_delivery(uuid,uuid,boolean,boolean,boolean,text) TO service_role;