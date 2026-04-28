ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS followup_chain_id uuid,
  ADD COLUMN IF NOT EXISTS followup_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tasks_followup_chain ON public.tasks(followup_chain_id);
