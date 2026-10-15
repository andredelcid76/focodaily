-- lovable-cron-fallback-reviewed: user explicitly requested a 5-minute auto-pause job for idle Claude tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS claude_last_activity_at timestamptz;

CREATE OR REPLACE FUNCTION public.track_task_in_progress()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  was_running boolean := false;
  end_at timestamptz := now();
BEGIN
  IF TG_OP = 'UPDATE' THEN
    was_running := OLD.status = 'in_progress' AND OLD.in_progress_since IS NOT NULL;
  END IF;
  IF NEW.completed = true AND NEW.status = 'in_progress' THEN
    NEW.status := 'done';
  END IF;
  IF NEW.status = 'in_progress' THEN
    IF was_running THEN
      NEW.in_progress_since := OLD.in_progress_since;
    ELSE
      NEW.in_progress_since := now();
      IF TG_OP = 'UPDATE' AND NEW.claude_last_activity_at IS NOT DISTINCT FROM OLD.claude_last_activity_at THEN
        NEW.claude_last_activity_at := NULL;
      END IF;
    END IF;
  ELSE
    IF was_running THEN
      IF current_setting('foco.auto_pause', true) = '1' AND OLD.claude_last_activity_at IS NOT NULL THEN
        end_at := GREATEST(OLD.in_progress_since, LEAST(now(), OLD.claude_last_activity_at + interval '2 minutes'));
      END IF;
      NEW.time_spent_seconds := COALESCE(NEW.time_spent_seconds, 0)
        + GREATEST(0, LEAST(EXTRACT(EPOCH FROM (end_at - OLD.in_progress_since)), 8 * 3600))::int;
    END IF;
    NEW.in_progress_since := NULL;
  END IF;
  IF NEW.completed = true AND (TG_OP = 'INSERT' OR COALESCE(OLD.completed, false) = false) THEN
    NEW.claude_started_at := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.auto_pause_idle_claude_tasks()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  PERFORM set_config('foco.auto_pause', '1', true);
  UPDATE public.tasks SET status = 'todo'
   WHERE status = 'in_progress' AND completed = false
     AND claude_last_activity_at IS NOT NULL
     AND claude_last_activity_at < now() - interval '15 minutes';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('foco.auto_pause', '0', true);
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.auto_pause_idle_claude_tasks() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('claude-auto-pause', '*/5 * * * *', $c$ SELECT public.auto_pause_idle_claude_tasks(); $c$);