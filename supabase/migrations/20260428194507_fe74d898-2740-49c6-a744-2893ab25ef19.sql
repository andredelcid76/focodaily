DROP INDEX IF EXISTS public.meetings_user_external_uidx;
DROP INDEX IF EXISTS public.meetings_user_external_unique;

DELETE FROM public.meetings a
USING public.meetings b
WHERE a.ctid < b.ctid
  AND a.user_id = b.user_id
  AND a.external_id IS NOT NULL
  AND a.external_id = b.external_id;

ALTER TABLE public.meetings
ADD CONSTRAINT meetings_user_external_unique_key UNIQUE (user_id, external_id);

CREATE INDEX IF NOT EXISTS meetings_user_date_idx
  ON public.meetings (user_id, scheduled_date);