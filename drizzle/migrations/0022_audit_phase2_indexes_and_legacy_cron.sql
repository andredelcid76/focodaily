ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS pipedrive_missing boolean NOT NULL DEFAULT false;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS pipedrive_missing_reason text;
COMMENT ON COLUMN public.tasks.pipedrive_missing IS 'Pipedrive lookup returned 404; preserve the Foco task for review.';
CREATE INDEX IF NOT EXISTS task_subtasks_user_id_idx ON public.task_subtasks(user_id);
CREATE INDEX IF NOT EXISTS tasks_active_assignee_owner_idx ON public.tasks(assignee_id, user_id) WHERE status = 'in_progress' AND completed = false;
CREATE INDEX IF NOT EXISTS tasks_open_scheduled_assigned_idx ON public.tasks(scheduled_date) WHERE completed = false AND assignee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_unread_user_task_idx ON public.notifications(user_id, task_id) WHERE read_at IS NULL;
DO $$ DECLARE j record; BEGIN IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN FOR j IN SELECT jobid FROM cron.job WHERE jobname = 'inbox-scan-every-2h' LOOP PERFORM cron.unschedule(j.jobid); END LOOP; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='task_dependencies') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.task_dependencies; END IF; END $$;