-- Add planned_date to tasks: the original intended date, set at creation, immutable.
-- Used to measure procrastination (postponements) vs anticipations.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS planned_date date,
  ADD COLUMN IF NOT EXISTS postpone_count integer NOT NULL DEFAULT 0;

-- Backfill: for existing rows, planned_date = original_date (best approximation)
UPDATE public.tasks
  SET planned_date = original_date
  WHERE planned_date IS NULL;

-- Make NOT NULL after backfill
ALTER TABLE public.tasks
  ALTER COLUMN planned_date SET NOT NULL,
  ALTER COLUMN planned_date SET DEFAULT CURRENT_DATE;

-- Trigger: increment postpone_count whenever scheduled_date moves to a later date
CREATE OR REPLACE FUNCTION public.track_task_postponement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date THEN
    IF NEW.scheduled_date > OLD.scheduled_date THEN
      NEW.postpone_count := COALESCE(OLD.postpone_count, 0) + 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_task_postponement ON public.tasks;
CREATE TRIGGER trg_track_task_postponement
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.track_task_postponement();

CREATE INDEX IF NOT EXISTS idx_tasks_planned_date ON public.tasks(user_id, planned_date);