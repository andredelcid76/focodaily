-- Revisão Fase 3.
-- 1/2: S10 sem atalhos. Ocorrência de série só herda se a mãe tiver o mesmo dono e responsável;
-- trocar o dono num UPDATE exige que o novo dono esteja no escopo de delegação.
CREATE OR REPLACE FUNCTION public.enforce_delegation_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor uuid := public.current_actor_id();
  _owner_changed boolean := TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id;
BEGIN
  IF _actor IS NULL THEN RETURN NEW; END IF;

  IF _owner_changed AND NEW.user_id IS DISTINCT FROM _actor
     AND NOT private.delegation_allowed(_actor, NEW.user_id) THEN
    RAISE EXCEPTION 'Só é possível delegar para pessoas da Anpla ou que já participam de um projeto com você.' USING ERRCODE = '42501';
  END IF;

  IF NEW.assignee_id IS NULL OR NEW.assignee_id = _actor THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.assignee_id IS NOT DISTINCT FROM OLD.assignee_id AND NOT _owner_changed THEN RETURN NEW; END IF;
  -- Responsável = dono só dispensa a checagem quando o dono não mudou nesta escrita.
  IF NEW.assignee_id = NEW.user_id AND (
       (TG_OP = 'INSERT' AND NEW.user_id = _actor) OR (TG_OP = 'UPDATE' AND NOT _owner_changed)
     ) THEN RETURN NEW; END IF;
  -- Ocorrências de série copiam dono e responsável da tarefa-mãe.
  IF TG_OP = 'INSERT' AND NEW.recurrence_parent_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.tasks p
        WHERE p.id = NEW.recurrence_parent_id
          AND p.user_id = NEW.user_id
          AND p.assignee_id IS NOT DISTINCT FROM NEW.assignee_id
     ) THEN RETURN NEW; END IF;

  IF NOT private.delegation_allowed(_actor, NEW.assignee_id) THEN
    RAISE EXCEPTION 'Só é possível delegar para pessoas da Anpla ou que já participam de um projeto com você.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.enforce_delegation_scope() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_enforce_delegation_scope ON public.tasks;
CREATE TRIGGER trg_enforce_delegation_scope BEFORE INSERT OR UPDATE OF assignee_id, user_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_delegation_scope();

-- 4: UPDATE de tasks só para usuários logados (mesma lógica).
ALTER POLICY "Tasks update own assigned or project member" ON public.tasks TO authenticated;

-- 3: Análise agregada no banco. Escopo = minhas tarefas ou atribuídas a mim, tocando a janela
-- [p_start, p_end] (fim aberto quando NULL; tudo quando p_start NULL) por data prevista, planejada,
-- conclusão ou criação. Datas no fuso do perfil (padrão America/Sao_Paulo).
-- A série diária vai de p_series_start até hoje (ou de/até o primeiro/último evento quando NULL).
CREATE OR REPLACE FUNCTION public.analytics_summary(p_start date, p_end date, p_series_start date DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH me AS (SELECT (SELECT auth.uid()) AS uid),
tz AS (
  SELECT COALESCE(
    (SELECT p.timezone FROM public.profiles p, me
      WHERE p.user_id = me.uid AND EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names n WHERE n.name = p.timezone)),
    'America/Sao_Paulo') AS name
),
today AS (SELECT (now() AT TIME ZONE tz.name)::date AS d FROM tz),
base AS (
  SELECT t.id, t.title, t.project_id, t.role_id, t.category::text AS category, t.priority,
         t.duration_minutes AS minutes, t.completed, t.scheduled_date, t.planned_date,
         COALESCE(t.postpone_count, 0) AS pc,
         (t.completed_at AT TIME ZONE tz.name)::date AS done_day,
         (t.created_at AT TIME ZONE tz.name)::date AS created_day
  FROM public.tasks t, me, tz
  WHERE t.user_id = me.uid OR t.assignee_id = me.uid
),
scoped AS (
  SELECT b.* FROM base b
  WHERE p_start IS NULL
     OR (b.scheduled_date >= p_start AND (p_end IS NULL OR b.scheduled_date <= p_end))
     OR (b.planned_date   >= p_start AND (p_end IS NULL OR b.planned_date   <= p_end))
     OR (b.done_day       >= p_start AND (p_end IS NULL OR b.done_day       <= p_end))
     OR (b.created_day    >= p_start AND (p_end IS NULL OR b.created_day    <= p_end))
),
events AS (
  SELECT x FROM base, LATERAL (VALUES (base.done_day), (base.created_day), (base.planned_date)) v(x) WHERE x IS NOT NULL
),
bounds AS (
  SELECT COALESCE(p_series_start, LEAST(today.d, (SELECT min(x) FROM events))) AS s,
         CASE WHEN p_series_start IS NULL THEN GREATEST(today.d, COALESCE((SELECT max(x) FROM events), today.d)) ELSE today.d END AS e
  FROM today
),
days AS (SELECT generate_series(bounds.s, bounds.e, interval '1 day')::date AS d FROM bounds),
done_by_day AS (SELECT done_day AS d, count(*) AS c, COALESCE(sum(minutes), 0) AS m FROM base WHERE done_day IS NOT NULL GROUP BY 1),
created_by_day AS (SELECT created_day AS d, count(*) AS c FROM base GROUP BY 1),
planned_by_day AS (SELECT planned_date AS d, count(*) AS c, COALESCE(sum(minutes), 0) AS m FROM base WHERE planned_date IS NOT NULL GROUP BY 1),
postponed_by_day AS (
  SELECT planned_date AS d, count(*) AS c FROM base
  WHERE planned_date IS NOT NULL AND scheduled_date IS NOT NULL AND scheduled_date > planned_date AND pc > 0 GROUP BY 1
)
SELECT jsonb_build_object(
  'today', (SELECT d FROM today),
  'kpis', (
    SELECT jsonb_build_object(
      'total', count(*),
      'done', count(*) FILTER (WHERE completed),
      'overdue', count(*) FILTER (WHERE NOT completed AND scheduled_date < (SELECT d FROM today)),
      'postponed', count(*) FILTER (WHERE pc > 0),
      'critical', count(*) FILTER (WHERE pc >= 3),
      'total_postpones', COALESCE(sum(pc), 0),
      'minutes', COALESCE(sum(minutes), 0),
      'done_minutes', COALESCE(sum(minutes) FILTER (WHERE completed), 0)
    ) FROM scoped
  ),
  'by_role', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('role_id', role_id, 'total', total, 'concluidas', concluidas, 'adiadas', adiadas, 'minutos', minutos) ORDER BY total DESC)
    FROM (SELECT role_id, count(*) total, count(*) FILTER (WHERE completed) concluidas, count(*) FILTER (WHERE pc > 0) adiadas, COALESCE(sum(minutes), 0) minutos
          FROM scoped GROUP BY role_id) r
  ), '[]'::jsonb),
  'by_project', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('project_id', project_id, 'total', total, 'concluidas', concluidas, 'adiadas', adiadas, 'criticas', criticas, 'minutos', minutos) ORDER BY total DESC)
    FROM (SELECT project_id, count(*) total, count(*) FILTER (WHERE completed) concluidas, count(*) FILTER (WHERE pc > 0) adiadas,
                 count(*) FILTER (WHERE pc >= 3) criticas, COALESCE(sum(minutes), 0) minutos
          FROM scoped WHERE project_id IS NOT NULL GROUP BY project_id) pr
  ), '[]'::jsonb),
  'by_category', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('category', category, 'total', total, 'concluidas', concluidas, 'minutos', minutos) ORDER BY total DESC)
    FROM (SELECT category, count(*) total, count(*) FILTER (WHERE completed) concluidas, COALESCE(sum(minutes), 0) minutos
          FROM scoped GROUP BY category) c
  ), '[]'::jsonb),
  'by_priority', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('priority', priority, 'total', total) ORDER BY priority DESC)
    FROM (SELECT priority, count(*) total FROM scoped GROUP BY priority) pp
  ), '[]'::jsonb),
  'top_postponed', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', id, 'title', title, 'project_id', project_id, 'role_id', role_id,
                                        'scheduled_date', scheduled_date, 'completed', completed, 'postpone_count', pc) ORDER BY pc DESC, id)
    FROM (SELECT * FROM scoped WHERE pc > 0 ORDER BY pc DESC, id LIMIT 8) tp
  ), '[]'::jsonb),
  'daily', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'day', days.d,
      'concluidas', COALESCE(dn.c, 0), 'minutos_concluidos', COALESCE(dn.m, 0),
      'planejadas', COALESCE(pl.c, 0), 'minutos_planejados', COALESCE(pl.m, 0),
      'criadas', COALESCE(cr.c, 0), 'adiadas', COALESCE(po.c, 0)) ORDER BY days.d)
    FROM days
    LEFT JOIN done_by_day dn ON dn.d = days.d
    LEFT JOIN planned_by_day pl ON pl.d = days.d
    LEFT JOIN created_by_day cr ON cr.d = days.d
    LEFT JOIN postponed_by_day po ON po.d = days.d
  ), '[]'::jsonb)
)
$$;
REVOKE EXECUTE ON FUNCTION public.analytics_summary(date, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analytics_summary(date, date, date) TO authenticated, service_role;
