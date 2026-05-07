ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS origin_source text,
  ADD COLUMN IF NOT EXISTS origin_source_label text,
  ADD COLUMN IF NOT EXISTS origin_source_url text;