-- Run against a disposable database AFTER a minimal fixture + migration 0023.
-- The fixture's realtime.send() stub records broadcasts in realtime_sent.
DO $$
DECLARE n int;
BEGIN
  -- 1) Reassigning my delegated task (Alice owns, not a project task) rings only my doorbell.
  TRUNCATE realtime_sent;
  UPDATE public.tasks SET assignee_id = '00000000-0000-0000-0000-00000000000b' WHERE id = '10000000-0000-0000-0000-000000000001';
  SELECT count(*) INTO n FROM realtime_sent WHERE topic = 'user:00000000-0000-0000-0000-00000000000e' AND event = 'task-access' AND payload->>'task_id' = '10000000-0000-0000-0000-000000000001';
  IF n <> 1 THEN RAISE EXCEPTION 'previous assignee was not notified (%).', n; END IF;
  SELECT count(*) INTO n FROM realtime_sent WHERE topic IN ('user:00000000-0000-0000-0000-00000000000a', 'user:00000000-0000-0000-0000-00000000000b');
  IF n <> 0 THEN RAISE EXCEPTION 'owner/new assignee who keep access were notified.'; END IF;

  -- 2) Moving a task out of a shared project rings old-project members who lose access.
  TRUNCATE realtime_sent;
  UPDATE public.tasks SET project_id = NULL WHERE id = '10000000-0000-0000-0000-000000000002';
  SELECT count(*) INTO n FROM realtime_sent WHERE topic = 'user:00000000-0000-0000-0000-00000000000e';
  IF n <> 1 THEN RAISE EXCEPTION 'project member losing access was not notified.'; END IF;

  -- 3) Title-only updates never ring.
  TRUNCATE realtime_sent;
  UPDATE public.tasks SET title = 'renamed' WHERE id = '10000000-0000-0000-0000-000000000002';
  SELECT count(*) INTO n FROM realtime_sent;
  IF n <> 0 THEN RAISE EXCEPTION 'unrelated update rang a doorbell.'; END IF;

  -- 4) Being added to / removed from a project rings that user only.
  TRUNCATE realtime_sent;
  INSERT INTO public.project_members (id, project_id, user_id) VALUES ('30000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000e');
  DELETE FROM public.project_members WHERE id = '30000000-0000-0000-0000-000000000009';
  SELECT count(*) INTO n FROM realtime_sent WHERE topic = 'user:00000000-0000-0000-0000-00000000000e' AND event = 'project-access';
  IF n <> 2 THEN RAISE EXCEPTION 'membership doorbell count %', n; END IF;
  SELECT count(*) INTO n FROM realtime_sent WHERE payload->>'change' = 'added' AND payload->>'project_id' = '20000000-0000-0000-0000-000000000002';
  IF n <> 1 THEN RAISE EXCEPTION 'added payload missing'; END IF;

  -- 5) A failing realtime.send never blocks the write.
  UPDATE realtime_fail SET enabled = true;
  UPDATE public.tasks SET assignee_id = '00000000-0000-0000-0000-00000000000e' WHERE id = '10000000-0000-0000-0000-000000000001';
  UPDATE public.tasks SET assignee_id = '00000000-0000-0000-0000-00000000000b' WHERE id = '10000000-0000-0000-0000-000000000001';
  UPDATE realtime_fail SET enabled = false;
  RAISE NOTICE 'realtime access doorbell tests passed';
END $$;
