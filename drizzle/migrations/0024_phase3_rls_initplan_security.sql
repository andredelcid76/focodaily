-- Fase 3 (auditoria): RLS mais rápida e endurecimento, sem mudar quem vê/edita o quê.

-- Projetos visíveis (dono, membro, equipe do projeto, dono da equipe) — mesma regra de is_project_member.
-- Funções internas ficam num schema fora da API (sem USAGE para anon/authenticated).
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.project_ids_for(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id FROM public.projects p WHERE p.user_id = _user_id
  UNION SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = _user_id
  UNION SELECT p.id FROM public.projects p JOIN public.team_members tm ON tm.team_id = p.team_id WHERE tm.user_id = _user_id
  UNION SELECT p.id FROM public.projects p JOIN public.teams t ON t.id = p.team_id WHERE t.owner_id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.my_project_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.project_ids_for(auth.uid())
$$;
REVOKE EXECUTE ON FUNCTION public.my_project_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_project_ids() TO authenticated, service_role;

-- S10: a quem posso delegar = eu, colegas do domínio da empresa, ou quem compartilha projeto comigo.
CREATE OR REPLACE FUNCTION private.delegation_allowed(_actor uuid, _target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _actor IS NOT NULL AND _target IS NOT NULL AND (
    _target = _actor
    OR public.is_company_colleague(_actor, _target)
    OR EXISTS (SELECT 1 FROM private.project_ids_for(_actor) a(id) WHERE public.is_project_member(a.id, _target))
  )
$$;

CREATE OR REPLACE FUNCTION public.delegable_user_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH mine AS (SELECT private.project_ids_for(auth.uid()) AS id)
  SELECT auth.uid() WHERE auth.uid() IS NOT NULL
  UNION SELECT public.company_colleague_ids()
  UNION SELECT p.user_id FROM public.projects p WHERE p.id IN (SELECT id FROM mine)
  UNION SELECT pm.user_id FROM public.project_members pm WHERE pm.project_id IN (SELECT id FROM mine)
  UNION SELECT tm.user_id FROM public.projects p JOIN public.team_members tm ON tm.team_id = p.team_id WHERE p.id IN (SELECT id FROM mine)
  UNION SELECT t.owner_id FROM public.projects p JOIN public.teams t ON t.id = p.team_id WHERE p.id IN (SELECT id FROM mine)
$$;
REVOKE EXECUTE ON FUNCTION public.delegable_user_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delegable_user_ids() TO authenticated, service_role;

-- S10: delegar (criar já delegada ou trocar responsável) só para quem está no escopo acima.
CREATE OR REPLACE FUNCTION public.enforce_delegation_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := public.current_actor_id();
BEGIN
  IF _actor IS NULL OR NEW.assignee_id IS NULL OR NEW.assignee_id = _actor OR NEW.assignee_id = NEW.user_id THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.assignee_id IS NOT DISTINCT FROM OLD.assignee_id THEN RETURN NEW; END IF;
  -- Ocorrências de série copiam o responsável já definido na tarefa-mãe.
  IF TG_OP = 'INSERT' AND NEW.recurrence_parent_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NOT private.delegation_allowed(_actor, NEW.assignee_id) THEN
    RAISE EXCEPTION 'Só é possível delegar para pessoas da Anpla ou que já participam de um projeto com você.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.enforce_delegation_scope() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_enforce_delegation_scope ON public.tasks;
CREATE TRIGGER trg_enforce_delegation_scope BEFORE INSERT OR UPDATE OF assignee_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_delegation_scope();

-- S11: ninguém aumenta o próprio papel no projeto (o dono do projeto não tem papel editável).
CREATE OR REPLACE FUNCTION public.prevent_project_role_self_promotion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid();
  _rank_old int := CASE OLD.role WHEN 'admin' THEN 3 WHEN 'manager' THEN 2 ELSE 1 END;
  _rank_new int := CASE NEW.role WHEN 'admin' THEN 3 WHEN 'manager' THEN 2 ELSE 1 END;
BEGIN
  IF _actor IS NOT NULL AND NEW.user_id = _actor AND _rank_new > _rank_old
     AND NOT public.is_project_owner(NEW.project_id, _actor) THEN
    RAISE EXCEPTION 'Você não pode aumentar o próprio papel no projeto.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.prevent_project_role_self_promotion() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_prevent_project_role_self_promotion ON public.project_members;
CREATE TRIGGER trg_prevent_project_role_self_promotion BEFORE UPDATE OF role ON public.project_members
  FOR EACH ROW EXECUTE FUNCTION public.prevent_project_role_self_promotion();

-- Índice usado pelas regras de acesso (os demais já existem: tasks user_id/assignee_id/project_id,
-- task_subtasks(task_id, position), task_comments(task_id, created_at)).
CREATE INDEX IF NOT EXISTS project_members_user_project_idx ON public.project_members (user_id, project_id);

-- A1/A3: (select auth.uid()) avaliado uma vez por consulta e projetos visíveis via my_project_ids(),
-- reescrevendo cada regra existente sem mudar sua lógica.
CREATE OR REPLACE FUNCTION pg_temp.rls_fast(_e text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _e IS NULL THEN NULL ELSE
    regexp_replace(regexp_replace(
      regexp_replace(
        regexp_replace(_e, 'is_project_member\(([A-Za-z_\.]+), auth\.uid\(\)\)', '(\1 IN ( SELECT public.my_project_ids()))', 'g'),
        'is_company_colleague\(auth\.uid\(\), ([A-Za-z_\.]+)\)', '(\1 IN ( SELECT public.company_colleague_ids()))', 'g'),
      '(?<!SELECT )auth\.uid\(\)', '( SELECT auth.uid())', 'g'),
      '(?<!SELECT )auth\.role\(\)', '( SELECT auth.role())', 'g')
  END
$$;

-- A2: regras permissivas duplicadas do mesmo comando viram uma só (OR exato das existentes).
CREATE OR REPLACE FUNCTION pg_temp.merge_select(_table text, _names text[], _new text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE _expr text; _n text;
BEGIN
  SELECT string_agg('(' || pg_temp.rls_fast(qual) || ')', ' OR ' ORDER BY policyname) INTO _expr
  FROM pg_policies WHERE schemaname = 'public' AND tablename = _table AND policyname = ANY(_names) AND cmd = 'SELECT';
  IF _expr IS NULL THEN RETURN; END IF; -- já consolidado
  FOREACH _n IN ARRAY _names LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', _n, _table); END LOOP;
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', _new, _table);
  EXECUTE format('CREATE POLICY %I ON public.%I AS PERMISSIVE FOR SELECT TO authenticated USING (%s)', _new, _table, _expr);
END $$;

SELECT pg_temp.merge_select('tasks', ARRAY['Assignees can view delegated tasks','Users view own or shared tasks'], 'Tasks select own assigned or project');
SELECT pg_temp.merge_select('task_dependencies', ARRAY['Users view own dependencies','Project members view shared task dependencies'], 'Dependencies select own or shared');
SELECT pg_temp.merge_select('profiles', ARRAY['Company colleagues can view profiles','Profiles visible via shared tasks','Users can view collaborator profiles','Users can view contact profiles'], 'Profiles select visible people');

-- contact_invites: a regra ALL do remetente sobrepunha a SELECT do convidado; separa por comando.
DO $$
DECLARE _own text; _own_check text; _inv text;
BEGIN
  SELECT qual, with_check INTO _own, _own_check FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'contact_invites' AND policyname = 'Inviters manage their own contact invites';
  SELECT qual INTO _inv FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'contact_invites' AND policyname = 'Invitees can view invites sent to their email';
  IF _own IS NULL OR _inv IS NULL THEN RETURN; END IF;
  DROP POLICY "Inviters manage their own contact invites" ON public.contact_invites;
  DROP POLICY "Invitees can view invites sent to their email" ON public.contact_invites;
  EXECUTE format('CREATE POLICY "Contact invites select inviter or invitee" ON public.contact_invites FOR SELECT TO authenticated USING ((%s) OR (%s))', _own, _inv);
  EXECUTE format('CREATE POLICY "Inviters create contact invites" ON public.contact_invites FOR INSERT TO authenticated WITH CHECK (%s)', _own_check);
  EXECUTE format('CREATE POLICY "Inviters update contact invites" ON public.contact_invites FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', _own, _own_check);
  EXECUTE format('CREATE POLICY "Inviters delete contact invites" ON public.contact_invites FOR DELETE TO authenticated USING (%s)', _own);
END $$;

-- Reescreve todas as regras restantes do schema public.
DO $$
DECLARE r record; _q text; _c text; _stmt text;
BEGIN
  FOR r IN SELECT tablename, policyname, qual, with_check FROM pg_policies WHERE schemaname = 'public' LOOP
    _q := pg_temp.rls_fast(r.qual);
    _c := pg_temp.rls_fast(r.with_check);
    IF _q IS NOT DISTINCT FROM r.qual AND _c IS NOT DISTINCT FROM r.with_check THEN CONTINUE; END IF;
    _stmt := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);
    IF _q IS NOT NULL THEN _stmt := _stmt || format(' USING (%s)', _q); END IF;
    IF _c IS NOT NULL THEN _stmt := _stmt || format(' WITH CHECK (%s)', _c); END IF;
    EXECUTE _stmt;
  END LOOP;
END $$;

-- S15: dependência só entre duas tarefas que o usuário consegue ver (mesma regra de leitura de tasks).
DROP POLICY IF EXISTS "Users insert own dependencies" ON public.task_dependencies;
CREATE POLICY "Users insert own dependencies" ON public.task_dependencies FOR INSERT TO authenticated
  WITH CHECK (
    (( SELECT auth.uid()) = user_id)
    AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_dependencies.predecessor_id)
    AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_dependencies.successor_id)
  );
DROP POLICY IF EXISTS "Users update own dependencies" ON public.task_dependencies;
CREATE POLICY "Users update own dependencies" ON public.task_dependencies FOR UPDATE TO authenticated
  USING (( SELECT auth.uid()) = user_id)
  WITH CHECK (
    (( SELECT auth.uid()) = user_id)
    AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_dependencies.predecessor_id)
    AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_dependencies.successor_id)
  );

-- Funções de gatilho não precisam ser chamáveis pela API (gatilhos disparam igual).
REVOKE EXECUTE ON FUNCTION public.merge_unread_task_notification() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_task_comment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_notification_prefs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_member_task_constraints() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notification_delivery_wake() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_dependency_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_task_owner_changes() FROM PUBLIC, anon, authenticated;
