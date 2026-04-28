-- Add 'weekdays' (dias úteis) to recurrence enum
ALTER TYPE public.task_recurrence ADD VALUE IF NOT EXISTS 'weekdays';

-- Custom recurrence: week interval (e.g. every 2 weeks) and monthly pattern
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS recurrence_week_interval integer,
  ADD COLUMN IF NOT EXISTS recurrence_monthly_pattern jsonb;

COMMENT ON COLUMN public.tasks.recurrence_week_interval IS 'For custom recurrence with weekdays: repeat every N weeks (default 1)';
COMMENT ON COLUMN public.tasks.recurrence_monthly_pattern IS 'For custom recurrence: {"week": 1|2|3|4|5|-1, "weekday": 0-6} e.g. first Monday = {week:1, weekday:1}, last Friday = {week:-1, weekday:5}';
