
-- Restore the column default so the Insert type keeps planned_date optional.
ALTER TABLE public.tasks
  ALTER COLUMN planned_date SET DEFAULT CURRENT_DATE;

-- Smarter BEFORE INSERT: when the caller did not explicitly set planned_date
-- (i.e. it landed as today's date via the default) and the task is scheduled
-- in the future, align planned_date to scheduled_date.
CREATE OR REPLACE FUNCTION public.set_task_planned_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.planned_date IS NULL THEN
    NEW.planned_date := NEW.scheduled_date;
  ELSIF NEW.planned_date = CURRENT_DATE AND NEW.scheduled_date > CURRENT_DATE THEN
    -- Default fell through but the task is genuinely scheduled in the future;
    -- treat scheduled_date as the planned baseline so it is not flagged late.
    NEW.planned_date := NEW.scheduled_date;
  END IF;
  RETURN NEW;
END;
$$;
