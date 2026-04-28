-- 1. Remove duplicates (keep earliest)
DELETE FROM public.tasks
WHERE ctid NOT IN (
  SELECT MIN(ctid)
  FROM public.tasks
  WHERE recurrence_parent_id IS NOT NULL
  GROUP BY recurrence_parent_id, scheduled_date
)
AND recurrence_parent_id IS NOT NULL;

-- 2. Prevent future duplicates
ALTER TABLE public.tasks
ADD CONSTRAINT tasks_parent_date_unique
UNIQUE (recurrence_parent_id, scheduled_date);

-- 3. Add Kanban status column
CREATE TYPE public.task_status AS ENUM ('todo', 'doing', 'done');

ALTER TABLE public.tasks
ADD COLUMN status public.task_status NOT NULL DEFAULT 'todo';

-- Backfill: completed -> done
UPDATE public.tasks SET status = 'done' WHERE completed = true;