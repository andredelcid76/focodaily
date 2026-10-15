ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS created_via text;

CREATE OR REPLACE FUNCTION public.current_actor_id()
RETURNS uuid LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE _id uuid;
BEGIN
  BEGIN _id := auth.uid(); EXCEPTION WHEN OTHERS THEN _id := NULL; END;
  IF _id IS NOT NULL THEN RETURN _id; END IF;
  BEGIN
    _id := NULLIF(current_setting('request.headers', true)::json ->> 'x-foco-actor-id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN _id := NULL; END;
  RETURN _id;
END $$;
GRANT EXECUTE ON FUNCTION public.current_actor_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.notify_task_assignment()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _actor_name text; _actor uuid := public.current_actor_id();
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.assignee_id IS NOT DISTINCT FROM OLD.assignee_id THEN RETURN NEW; END IF;
  SELECT COALESCE(display_name, email) INTO _actor_name FROM public.profiles WHERE user_id = _actor;
  IF NEW.assignee_id IS NOT NULL AND NEW.assignee_id IS DISTINCT FROM _actor THEN
    INSERT INTO public.notifications (user_id, type, title, body, task_id, project_id, actor_id, link)
    VALUES (NEW.assignee_id, 'task_assigned', 'Nova tarefa delegada para você',
      COALESCE(_actor_name, 'Alguém') || ' delegou: ' || NEW.title
        || CASE WHEN NEW.scheduled_date IS NOT NULL THEN ' (para ' || to_char(NEW.scheduled_date,'DD/MM') || ')' ELSE ' (sem data)' END,
      NEW.id, NEW.project_id, _actor, '/?tarefa=' || NEW.id);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.assignee_id IS NOT NULL AND OLD.assignee_id IS DISTINCT FROM _actor
     AND OLD.assignee_id IS DISTINCT FROM NEW.assignee_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, task_id, project_id, actor_id, link)
    VALUES (OLD.assignee_id, 'task_unassigned', 'Tarefa reatribuída',
      COALESCE(_actor_name, 'Alguém') || ' reatribuiu: ' || NEW.title,
      NEW.id, NEW.project_id, _actor, '/?tarefa=' || NEW.id);
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.notify_task_owner_changes()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := public.current_actor_id(); _actor_name text; _target uuid := NEW.user_id;
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
END $function$;

CREATE OR REPLACE FUNCTION public.notify_dependency_changes()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _actor uuid := public.current_actor_id(); _s record; _pending int;
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
END $function$;

CREATE OR REPLACE FUNCTION public.log_task_activity()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := public.current_actor_id();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_activity(task_id, actor_id, action, new_value)
    VALUES (NEW.id, _actor, 'created', jsonb_build_object('title', NEW.title));
    RETURN NEW;
  END IF;
  IF NEW.title IS DISTINCT FROM OLD.title THEN
    INSERT INTO public.task_activity(task_id, actor_id, action, field, old_value, new_value)
    VALUES (NEW.id, _actor, 'updated', 'title', to_jsonb(OLD.title), to_jsonb(NEW.title));
  END IF;
  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
    INSERT INTO public.task_activity(task_id, actor_id, action, field, old_value, new_value)
    VALUES (NEW.id, _actor, 'reassigned', 'assignee_id', to_jsonb(OLD.assignee_id), to_jsonb(NEW.assignee_id));
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.task_activity(task_id, actor_id, action, field, old_value, new_value)
    VALUES (NEW.id, _actor, 'updated', 'status', to_jsonb(OLD.status), to_jsonb(NEW.status));
  END IF;
  IF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date THEN
    INSERT INTO public.task_activity(task_id, actor_id, action, field, old_value, new_value)
    VALUES (NEW.id, _actor, 'updated', 'scheduled_date', to_jsonb(OLD.scheduled_date), to_jsonb(NEW.scheduled_date));
  END IF;
  IF NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes THEN
    INSERT INTO public.task_activity(task_id, actor_id, action, field, old_value, new_value)
    VALUES (NEW.id, _actor, 'updated', 'duration_minutes', to_jsonb(OLD.duration_minutes), to_jsonb(NEW.duration_minutes));
  END IF;
  IF NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    INSERT INTO public.task_activity(task_id, actor_id, action, field, old_value, new_value)
    VALUES (NEW.id, _actor, 'updated', 'project_id', to_jsonb(OLD.project_id), to_jsonb(NEW.project_id));
  END IF;
  IF NEW.category IS DISTINCT FROM OLD.category THEN
    INSERT INTO public.task_activity(task_id, actor_id, action, field, old_value, new_value)
    VALUES (NEW.id, _actor, 'updated', 'category', to_jsonb(OLD.category), to_jsonb(NEW.category));
  END IF;
  IF NEW.completed IS DISTINCT FROM OLD.completed THEN
    INSERT INTO public.task_activity(task_id, actor_id, action, field, old_value, new_value)
    VALUES (NEW.id, _actor, CASE WHEN NEW.completed THEN 'completed' ELSE 'reopened' END, 'completed', to_jsonb(OLD.completed), to_jsonb(NEW.completed));
  END IF;
  IF NEW.description IS DISTINCT FROM OLD.description THEN
    INSERT INTO public.task_activity(task_id, actor_id, action, field)
    VALUES (NEW.id, _actor, 'updated', 'description');
  END IF;
  RETURN NEW;
END;
$function$;