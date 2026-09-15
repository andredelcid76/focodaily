ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS emailed_at timestamptz,
  ADD COLUMN IF NOT EXISTS teams_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_error text;

CREATE INDEX IF NOT EXISTS notifications_pending_delivery_idx
  ON public.notifications (created_at)
  WHERE emailed_at IS NULL;
