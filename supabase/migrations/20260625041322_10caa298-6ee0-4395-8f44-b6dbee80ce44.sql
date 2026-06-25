
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT id, (row_number() OVER (PARTITION BY user_id, status ORDER BY created_at) - 1) AS rn
  FROM public.projects
)
UPDATE public.projects p SET position = r.rn FROM ranked r WHERE p.id = r.id;

CREATE INDEX IF NOT EXISTS projects_user_status_position_idx ON public.projects(user_id, status, position);

CREATE OR REPLACE FUNCTION public.reorder_projects(p_ordered_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.projects p
  SET position = x.pos, updated_at = now()
  FROM (
    SELECT unnest(p_ordered_ids) AS id,
           generate_series(0, array_length(p_ordered_ids, 1) - 1) AS pos
  ) x
  WHERE p.id = x.id AND p.user_id = auth.uid();
END;
$$;
