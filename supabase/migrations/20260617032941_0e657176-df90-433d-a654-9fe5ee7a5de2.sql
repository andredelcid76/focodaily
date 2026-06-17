-- 1) oauth_clients: bloquear leitura por authenticated/anon na Data API
REVOKE ALL ON public.oauth_clients FROM anon, authenticated;

DROP POLICY IF EXISTS "Block non-service access to oauth clients" ON public.oauth_clients;
CREATE POLICY "Block non-service access to oauth clients"
  ON public.oauth_clients
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- 2) tasks: adicionar WITH CHECK no UPDATE para impedir escalada de privilégio
--    por responsáveis (assignees). Donos e gestores continuam podendo mudar tudo.
DROP POLICY IF EXISTS "Tasks update own assigned or as manager" ON public.tasks;

CREATE POLICY "Tasks update own assigned or as manager"
  ON public.tasks
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR auth.uid() = assignee_id
    OR (project_id IS NOT NULL AND public.is_project_manager_or_above(project_id, auth.uid()))
  )
  WITH CHECK (
    -- Dono da tarefa: pode tudo
    auth.uid() = user_id
    -- Gestor/admin/owner do projeto: pode tudo
    OR (project_id IS NOT NULL AND public.is_project_manager_or_above(project_id, auth.uid()))
    -- Responsável (assignee): só pode salvar se não alterou dono, projeto nem responsável
    OR (
      auth.uid() = assignee_id
      AND user_id     = (SELECT t.user_id     FROM public.tasks t WHERE t.id = tasks.id)
      AND assignee_id = (SELECT t.assignee_id FROM public.tasks t WHERE t.id = tasks.id)
      AND project_id IS NOT DISTINCT FROM (SELECT t.project_id FROM public.tasks t WHERE t.id = tasks.id)
    )
  );