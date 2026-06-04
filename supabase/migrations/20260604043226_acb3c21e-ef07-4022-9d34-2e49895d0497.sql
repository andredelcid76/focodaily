
-- 1) Default planned_date to scheduled_date instead of CURRENT_DATE.
ALTER TABLE public.tasks ALTER COLUMN planned_date DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.set_task_planned_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.planned_date IS NULL THEN
    NEW.planned_date := NEW.scheduled_date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_task_planned_date ON public.tasks;
CREATE TRIGGER trg_set_task_planned_date
  BEFORE INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_task_planned_date();

-- 2) Ignore recurring instances when tracking postponements.
CREATE OR REPLACE FUNCTION public.track_task_postponement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
     AND NEW.recurrence_parent_id IS NULL
     AND NEW.scheduled_date > OLD.scheduled_date THEN
    NEW.postpone_count := COALESCE(OLD.postpone_count, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

-- 3) Backfill — bypass member-task enforcement (admin migration context).
SET session_replication_role = replica;

UPDATE public.tasks
   SET planned_date = scheduled_date,
       postpone_count = 0
 WHERE recurrence_parent_id IS NOT NULL
   AND (planned_date <> scheduled_date OR postpone_count > 0);

UPDATE public.tasks
   SET planned_date = scheduled_date
 WHERE recurrence_parent_id IS NULL
   AND postpone_count = 0
   AND planned_date < scheduled_date;

SET session_replication_role = origin;
