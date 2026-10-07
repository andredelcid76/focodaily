CREATE OR REPLACE FUNCTION public.merge_unread_task_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _ex record; _items jsonb; _task_title text; _n int;
BEGIN
  IF NEW.task_id IS NULL THEN RETURN NEW; END IF;
  SELECT id, body, meta, group_count INTO _ex FROM public.notifications
   WHERE user_id = NEW.user_id AND task_id = NEW.task_id AND read_at IS NULL
   ORDER BY created_at DESC LIMIT 1;
  IF _ex.id IS NULL THEN RETURN NEW; END IF;
  SELECT title INTO _task_title FROM public.tasks WHERE id = NEW.task_id;
  _items := COALESCE(_ex.meta->'items', jsonb_build_array(COALESCE(_ex.body, '')))
            || jsonb_build_array(COALESCE(NEW.body, NEW.title));
  _n := jsonb_array_length(_items);
  UPDATE public.notifications SET
    type = NEW.type,
    title = _n || ' novidades em "' || COALESCE(_task_title, 'tarefa') || '"',
    body = (SELECT string_agg(v, E'\n') FROM (SELECT v FROM jsonb_array_elements_text(_items) WITH ORDINALITY t(v, i) ORDER BY i DESC LIMIT 6) s),
    meta = COALESCE(_ex.meta, '{}'::jsonb) || jsonb_build_object('items', _items),
    group_count = _n,
    actor_id = COALESCE(NEW.actor_id, actor_id),
    link = COALESCE(NEW.link, link),
    created_at = now(),
    emailed_at = NULL
  WHERE id = _ex.id;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_merge_unread_task_notification ON public.notifications;
CREATE TRIGGER trg_merge_unread_task_notification
BEFORE INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.merge_unread_task_notification();