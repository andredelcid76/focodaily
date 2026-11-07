BEGIN;
DO $$
DECLARE count_indexes integer;
BEGIN
  SELECT count(*) INTO count_indexes FROM pg_indexes WHERE schemaname='public' AND indexname IN ('task_subtasks_user_id_idx','tasks_active_assignee_owner_idx','tasks_open_scheduled_assigned_idx','notifications_unread_user_task_idx');
  IF count_indexes <> 4 THEN RAISE EXCEPTION 'Missing phase 2 indexes'; END IF;
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='inbox-scan-every-2h') THEN RAISE EXCEPTION 'Legacy cron still exists'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='task_dependencies') THEN RAISE EXCEPTION 'Dependency changes not published'; END IF;
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tasks' AND column_name='pipedrive_missing' AND column_default='false') THEN RAISE EXCEPTION 'Missing safe Pipedrive marker'; END IF;
  RAISE NOTICE 'PASS phase 2 indexes, cron removal, dependency publication and missing marker';
END $$;
ROLLBACK;