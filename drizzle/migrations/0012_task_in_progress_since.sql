ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS in_progress_since timestamptz;

CREATE OR REPLACE FUNCTION public.track_task_in_progress()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  was_running boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    was_running := OLD.status = 'in_progress' AND OLD.in_progress_since IS NOT NULL;
  END IF;

  -- Concluir tira de in_progress
  IF NEW.completed = true AND NEW.status = 'in_progress' THEN
    NEW.status := 'done';
  END IF;

  IF NEW.status = 'in_progress' THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'in_progress' OR NEW.in_progress_since IS NULL THEN
      IF NOT was_running THEN
        NEW.in_progress_since := now();
      ELSE
        NEW.in_progress_since := OLD.in_progress_since;
      END IF;
    ELSE
      NEW.in_progress_since := OLD.in_progress_since;
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

DROP TRIGGER IF EXISTS trg_track_task_in_progress ON public.tasks;
CREATE TRIGGER trg_track_task_in_progress BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.track_task_in_progress();

UPDATE public.tasks SET in_progress_since = now() WHERE status = 'in_progress' AND completed = false AND in_progress_since IS NULL;