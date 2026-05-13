CREATE OR REPLACE FUNCTION public.reorder_tasks(p_ordered_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tasks t
  SET position = x.pos, updated_at = now()
  FROM (
    SELECT unnest(p_ordered_ids) AS id,
           generate_series(0, array_length(p_ordered_ids, 1) - 1) AS pos
  ) x
  WHERE t.id = x.id AND t.user_id = auth.uid();
END;
$$;