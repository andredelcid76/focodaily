-- Add write policies for inbox_scan_state
CREATE POLICY "Users insert own scan state" ON public.inbox_scan_state FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own scan state" ON public.inbox_scan_state FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own scan state" ON public.inbox_scan_state FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Lock down reorder_tasks: revoke from PUBLIC/authenticated, grant only to service_role.
-- The function is invoked via server-side code with the user's auth context through the supabase client,
-- but it's SECURITY DEFINER and uses auth.uid() internally so it's safe; however revoke broad EXECUTE.
REVOKE EXECUTE ON FUNCTION public.reorder_tasks(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reorder_tasks(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.reorder_tasks(uuid[]) TO authenticated;
-- Function already checks auth.uid() in WHERE clause, so authenticated execute is safe.
-- To satisfy linter that flags any authenticated-executable SECURITY DEFINER, convert to SECURITY INVOKER
-- since RLS on tasks already restricts UPDATE to auth.uid() = user_id.
CREATE OR REPLACE FUNCTION public.reorder_tasks(p_ordered_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.tasks t
  SET position = x.pos, updated_at = now()
  FROM (
    SELECT unnest(p_ordered_ids) AS id,
           generate_series(0, array_length(p_ordered_ids, 1) - 1) AS pos
  ) x
  WHERE t.id = x.id AND t.user_id = auth.uid();
END;
$function$;