CREATE OR REPLACE FUNCTION public.is_project_member(_project_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.projects WHERE id = _project_id AND user_id = _user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = _project_id AND user_id = _user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = _project_id
      AND p.team_id IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.team_id = p.team_id AND tm.user_id = _user_id
        )
        OR EXISTS (
          SELECT 1 FROM public.teams t
          WHERE t.id = p.team_id AND t.owner_id = _user_id
        )
      )
  );
$function$;