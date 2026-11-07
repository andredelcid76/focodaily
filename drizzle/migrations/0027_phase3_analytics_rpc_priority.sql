-- A página de Análise também agrupa por prioridade.
DROP FUNCTION IF EXISTS public.analytics_task_facts();
CREATE FUNCTION public.analytics_task_facts()
RETURNS TABLE (
  id uuid, title text, user_id uuid, assignee_id uuid, project_id uuid, role_id uuid,
  completed boolean, completed_at timestamptz, created_at timestamptz,
  scheduled_date date, planned_date date, postpone_count integer, priority smallint
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT t.id, t.title, t.user_id, t.assignee_id, t.project_id, t.role_id,
         t.completed, t.completed_at, t.created_at, t.scheduled_date, t.planned_date, t.postpone_count, t.priority
  FROM public.tasks t
  WHERE t.user_id = (SELECT auth.uid()) OR t.assignee_id = (SELECT auth.uid())
$$;
REVOKE EXECUTE ON FUNCTION public.analytics_task_facts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analytics_task_facts() TO authenticated, service_role;
