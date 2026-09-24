
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS group_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS digest_pending boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON public.notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY,
  prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  email_mode text NOT NULL DEFAULT 'instant',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own notification prefs select" ON public.notification_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own notification prefs insert" ON public.notification_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own notification prefs update" ON public.notification_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own notification prefs delete" ON public.notification_preferences FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER notification_preferences_updated_at BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.apply_notification_prefs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _p jsonb;
BEGIN
  IF NEW.actor_id IS NOT NULL AND NEW.actor_id = NEW.user_id THEN
    RETURN NULL;
  END IF;
  SELECT prefs -> NEW.type INTO _p FROM public.notification_preferences WHERE user_id = NEW.user_id;
  IF _p IS NULL THEN RETURN NEW; END IF;
  IF COALESCE((_p->>'app')::boolean, true) = false THEN
    IF COALESCE((_p->>'email')::boolean, true) = false AND COALESCE((_p->>'teams')::boolean, true) = false THEN
      RETURN NULL;
    END IF;
    NEW.read_at := now();
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.apply_notification_prefs() FROM PUBLIC, anon;
CREATE TRIGGER trg_apply_notification_prefs BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.apply_notification_prefs();

UPDATE public.notifications SET link = '/?tarefa=' || task_id WHERE task_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.notify_task_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _actor_name text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.assignee_id IS NOT DISTINCT FROM OLD.assignee_id THEN RETURN NEW; END IF;
  SELECT COALESCE(display_name, email) INTO _actor_name FROM public.profiles WHERE user_id = auth.uid();
  IF NEW.assignee_id IS NOT NULL AND NEW.assignee_id IS DISTINCT FROM auth.uid() THEN
    INSERT INTO public.notifications (user_id, type, title, body, task_id, project_id, actor_id, link)
    VALUES (NEW.assignee_id, 'task_assigned', 'Nova tarefa delegada para você',
      COALESCE(_actor_name, 'Alguém') || ' delegou: ' || NEW.title
        || CASE WHEN NEW.scheduled_date IS NOT NULL THEN ' (para ' || to_char(NEW.scheduled_date,'DD/MM') || ')' ELSE ' (sem data)' END,
      NEW.id, NEW.project_id, auth.uid(), '/?tarefa=' || NEW.id);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.assignee_id IS NOT NULL AND OLD.assignee_id IS DISTINCT FROM auth.uid()
     AND OLD.assignee_id IS DISTINCT FROM NEW.assignee_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, task_id, project_id, actor_id, link)
    VALUES (OLD.assignee_id, 'task_unassigned', 'Tarefa reatribuída',
      COALESCE(_actor_name, 'Alguém') || ' reatribuiu: ' || NEW.title,
      NEW.id, NEW.project_id, auth.uid(), '/?tarefa=' || NEW.id);
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notify_task_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _task record; _actor_name text; _target uuid; _snippet text; _mentioned uuid[];
BEGIN
  SELECT id, title, user_id, assignee_id, project_id INTO _task FROM public.tasks WHERE id = NEW.task_id;
  IF _task.id IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(display_name, email) INTO _actor_name FROM public.profiles WHERE user_id = NEW.user_id;
  _snippet := left(regexp_replace(NEW.content, '\s+', ' ', 'g'), 160)
              || CASE WHEN length(NEW.content) > 160 THEN '…' ELSE '' END;

  SELECT COALESCE(array_agg(DISTINCT p.user_id), ARRAY[]::uuid[]) INTO _mentioned
  FROM public.profiles p
  WHERE p.user_id <> NEW.user_id
    AND p.display_name IS NOT NULL AND length(p.display_name) > 1
    AND position(lower('@' || p.display_name) IN lower(NEW.content)) > 0
    AND public.can_access_task(_task.id, p.user_id);

  FOREACH _target IN ARRAY _mentioned LOOP
    INSERT INTO public.notifications (user_id, type, title, body, task_id, project_id, actor_id, link, meta)
    VALUES (_target, 'task_mention', COALESCE(_actor_name,'Alguém') || ' mencionou você',
      'Em "' || _task.title || '": ' || _snippet,
      _task.id, _task.project_id, NEW.user_id, '/?tarefa=' || _task.id || '&comentarios=1',
      jsonb_build_object('comment_id', NEW.id, 'snippet', _snippet));
  END LOOP;

  FOR _target IN
    SELECT DISTINCT uid FROM (
      SELECT _task.user_id AS uid UNION SELECT _task.assignee_id
      UNION SELECT p.user_id FROM public.projects p WHERE p.id = _task.project_id
    ) s WHERE uid IS NOT NULL AND uid <> NEW.user_id AND NOT (uid = ANY(_mentioned))
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, task_id, project_id, actor_id, link, meta)
    VALUES (_target, 'task_comment', 'Comentário em: ' || _task.title,
      COALESCE(_actor_name, 'Alguém') || ': ' || _snippet,
      _task.id, _task.project_id, NEW.user_id, '/?tarefa=' || _task.id || '&comentarios=1',
      jsonb_build_object('comment_id', NEW.id, 'snippet', _snippet));
  END LOOP;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notify_task_owner_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _actor uuid := auth.uid(); _actor_name text; _target uuid := NEW.user_id;
  _changes text[] := ARRAY[]::text[]; _existing record; _all text[];
BEGIN
  IF NEW.assignee_id IS NULL OR NEW.assignee_id = NEW.user_id THEN RETURN NEW; END IF;
  IF _actor IS NULL OR _target = _actor THEN RETURN NEW; END IF;
  SELECT COALESCE(display_name, email) INTO _actor_name FROM public.profiles WHERE user_id = _actor;

  IF NEW.completed IS DISTINCT FROM OLD.completed AND NEW.completed = true THEN
    INSERT INTO public.notifications (user_id, type, title, body, task_id, project_id, actor_id, link)
    VALUES (_target, 'task_completed', 'Tarefa delegada concluída',
      COALESCE(_actor_name, 'Alguém') || ' concluiu: ' || NEW.title,
      NEW.id, NEW.project_id, _actor, '/?tarefa=' || NEW.id);
    RETURN NEW;
  END IF;

  IF NEW.title IS DISTINCT FROM OLD.title THEN
    _changes := _changes || ('título: ' || OLD.title || ' → ' || NEW.title);
  END IF;
  IF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date THEN
    _changes := _changes || ('data: ' || COALESCE(to_char(OLD.scheduled_date,'DD/MM'),'sem data') || ' → ' || COALESCE(to_char(NEW.scheduled_date,'DD/MM'),'sem data'));
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    _changes := _changes || ('status: ' || OLD.status::text || ' → ' || NEW.status::text
      || CASE WHEN NEW.status::text = 'blocked' AND NEW.blocked_reason IS NOT NULL THEN ' (' || NEW.blocked_reason || ')' ELSE '' END);
  END IF;
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    _changes := _changes || ('prioridade: ' || OLD.priority::text || ' → ' || NEW.priority::text);
  END IF;
  IF NEW.completed IS DISTINCT FROM OLD.completed AND NEW.completed = false THEN
    _changes := _changes || 'tarefa reaberta'::text;
  END IF;
  IF array_length(_changes, 1) IS NULL THEN RETURN NEW; END IF;

  SELECT id, meta INTO _existing FROM public.notifications
   WHERE user_id = _target AND task_id = NEW.id AND type = 'task_updated' AND actor_id = _actor
     AND read_at IS NULL AND created_at > now() - interval '10 minutes'
   ORDER BY created_at DESC LIMIT 1;

  IF _existing.id IS NOT NULL THEN
    SELECT COALESCE(array_agg(x), ARRAY[]::text[]) INTO _all
      FROM jsonb_array_elements_text(COALESCE(_existing.meta->'changes','[]'::jsonb)) x;
    _all := _all || _changes;
    UPDATE public.notifications
       SET body = COALESCE(_actor_name, 'Alguém') || ' alterou em "' || NEW.title || '": ' || array_to_string(_all, '; '),
           meta = jsonb_build_object('changes', to_jsonb(_all)),
           group_count = group_count + 1,
           created_at = now()
     WHERE id = _existing.id;
  ELSE
    INSERT INTO public.notifications (user_id, type, title, body, task_id, project_id, actor_id, link, meta)
    VALUES (_target, 'task_updated', 'Tarefa delegada foi alterada',
      COALESCE(_actor_name, 'Alguém') || ' alterou em "' || NEW.title || '": ' || array_to_string(_changes, '; '),
      NEW.id, NEW.project_id, _actor, '/?tarefa=' || NEW.id, jsonb_build_object('changes', to_jsonb(_changes)));
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notify_dependency_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _actor uuid := auth.uid(); _s record; _pending int;
BEGIN
  IF NEW.completed = true AND OLD.completed IS DISTINCT FROM true THEN
    FOR _s IN
      SELECT t.id, t.title, t.project_id, COALESCE(t.assignee_id, t.user_id) AS target
        FROM public.task_dependencies d JOIN public.tasks t ON t.id = d.successor_id
       WHERE d.predecessor_id = NEW.id AND NOT t.completed
    LOOP
      SELECT count(*) INTO _pending FROM public.task_dependencies d JOIN public.tasks p ON p.id = d.predecessor_id
       WHERE d.successor_id = _s.id AND NOT p.completed AND p.id <> NEW.id;
      IF _pending = 0 AND _s.target IS DISTINCT FROM _actor THEN
        INSERT INTO public.notifications (user_id, type, title, body, task_id, project_id, actor_id, link)
        VALUES (_s.target, 'task_unblocked', 'Tarefa liberada',
          '"' || NEW.title || '" foi concluída. Você já pode seguir com: ' || _s.title,
          _s.id, _s.project_id, _actor, '/?tarefa=' || _s.id);
      END IF;
    END LOOP;
  END IF;

  IF NEW.status::text = 'blocked' AND OLD.status IS DISTINCT FROM NEW.status THEN
    FOR _s IN
      SELECT DISTINCT t.id, t.title, t.project_id, COALESCE(t.assignee_id, t.user_id) AS target
        FROM public.task_dependencies d JOIN public.tasks t ON t.id = d.successor_id
       WHERE d.predecessor_id = NEW.id AND NOT t.completed
    LOOP
      IF _s.target IS DISTINCT FROM _actor THEN
        INSERT INTO public.notifications (user_id, type, title, body, task_id, project_id, actor_id, link)
        VALUES (_s.target, 'task_blocked', 'Tarefa anterior bloqueada',
          '"' || NEW.title || '" está bloqueada' || COALESCE(' (' || NEW.blocked_reason || ')', '') || ' e trava: ' || _s.title,
          _s.id, _s.project_id, _actor, '/?tarefa=' || _s.id);
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_dependency_changes() FROM PUBLIC, anon;
CREATE TRIGGER trg_notify_dependency_changes AFTER UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.notify_dependency_changes();

CREATE OR REPLACE FUNCTION public.notify_due_tasks()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, task_id, project_id, link)
  SELECT t.assignee_id, 'task_due_soon', 'Prazo amanhã', 'A tarefa "' || t.title || '" vence amanhã (' || to_char(t.scheduled_date,'DD/MM') || ').',
         t.id, t.project_id, '/?tarefa=' || t.id
    FROM public.tasks t
   WHERE NOT t.completed AND t.assignee_id IS NOT NULL AND t.assignee_id <> t.user_id
     AND t.scheduled_date = CURRENT_DATE + 1
     AND NOT EXISTS (SELECT 1 FROM public.notifications n WHERE n.task_id = t.id AND n.user_id = t.assignee_id
                     AND n.type = 'task_due_soon' AND n.created_at::date = CURRENT_DATE);

  INSERT INTO public.notifications (user_id, type, title, body, task_id, project_id, link)
  SELECT x.uid, 'task_overdue', 'Tarefa atrasada',
         'A tarefa "' || t.title || '" estava prevista para ' || to_char(t.scheduled_date,'DD/MM') || ' e ainda não foi concluída.',
         t.id, t.project_id, '/?tarefa=' || t.id
    FROM public.tasks t
    CROSS JOIN LATERAL (VALUES (t.assignee_id), (t.user_id)) x(uid)
   WHERE NOT t.completed AND t.assignee_id IS NOT NULL AND t.assignee_id <> t.user_id
     AND t.scheduled_date < CURRENT_DATE AND t.scheduled_date >= CURRENT_DATE - 14
     AND NOT EXISTS (SELECT 1 FROM public.notifications n WHERE n.task_id = t.id AND n.user_id = x.uid
                     AND n.type = 'task_overdue' AND n.created_at > now() - interval '3 days');
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_due_tasks() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('notifications-due-daily', '0 10 * * *', $c$ SELECT public.notify_due_tasks(); $c$);
SELECT cron.schedule('notifications-daily-send', '5 10 * * *', $c$
  SELECT net.http_post(url := 'https://focodaily.lovable.app/api/public/notifications/tick',
    headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb);
$c$);
