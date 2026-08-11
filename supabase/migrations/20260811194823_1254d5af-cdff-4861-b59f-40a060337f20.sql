CREATE OR REPLACE FUNCTION public.is_project_admin(_project_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.projects WHERE id = _project_id AND user_id = _user_id)
      OR EXISTS (
        SELECT 1 FROM public.project_members
        WHERE project_id = _project_id AND user_id = _user_id AND role IN ('admin','manager')
      )
      OR EXISTS (
        SELECT 1 FROM public.projects p
        JOIN public.team_members tm ON tm.team_id = p.team_id
        WHERE p.id = _project_id AND tm.user_id = _user_id AND tm.role IN ('admin','manager')
      )
      OR EXISTS (
        SELECT 1 FROM public.projects p
        JOIN public.teams t ON t.id = p.team_id
        WHERE p.id = _project_id AND t.owner_id = _user_id
      );
$function$;

DROP POLICY IF EXISTS "Project update by leader only" ON public.projects;
CREATE POLICY "Project update by leader or manager" ON public.projects
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_project_admin(id, auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.is_project_admin(id, auth.uid()));

DROP POLICY IF EXISTS "Users delete own projects" ON public.projects;
CREATE POLICY "Delete by leader or manager" ON public.projects
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_project_admin(id, auth.uid()));