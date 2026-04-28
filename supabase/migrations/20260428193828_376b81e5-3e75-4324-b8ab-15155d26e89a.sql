-- Remove duplicatas existentes mantendo a mais recente
DELETE FROM public.meetings a USING public.meetings b
WHERE a.ctid < b.ctid
  AND a.user_id = b.user_id
  AND a.external_id IS NOT NULL
  AND a.external_id = b.external_id;

-- Cria índice único parcial (só quando external_id não é nulo)
CREATE UNIQUE INDEX IF NOT EXISTS meetings_user_external_uidx
  ON public.meetings (user_id, external_id)
  WHERE external_id IS NOT NULL;