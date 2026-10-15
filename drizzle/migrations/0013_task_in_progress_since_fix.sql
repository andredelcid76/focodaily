CREATE OR REPLACE FUNCTION public.track_task_in_progress()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  was_running boolean := false;
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
    END IF;
  ELSE
    IF was_running THEN
      NEW.time_spent_seconds := COALESCE(NEW.time_spent_seconds, 0)
        + GREATEST(0, LEAST(EXTRACT(EPOCH FROM (now() - OLD.in_progress_since)), 8 * 3600))::int;
    END IF;
    NEW.in_progress_since := NULL;
  END IF;
  IF NEW.completed = true AND (TG_OP = 'INSERT' OR COALESCE(OLD.completed, false) = false) THEN
    NEW.claude_started_at := NULL;
  END IF;
  RETURN NEW;
END $$;

UPDATE public.tasks SET updated_at = updated_at WHERE status = 'in_progress' AND completed = false AND in_progress_since IS NULL;