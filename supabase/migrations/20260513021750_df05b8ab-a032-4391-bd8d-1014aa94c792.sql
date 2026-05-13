REVOKE EXECUTE ON FUNCTION public.reorder_tasks(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_tasks(uuid[]) TO authenticated;