ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS recurrence_until date;

CREATE TABLE IF NOT EXISTS public.task_recurrence_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  parent_task_id uuid NOT NULL,
  exception_date date NOT NULL,
  kind text NOT NULL DEFAULT 'deleted',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT task_recurrence_exceptions_kind_check CHECK (kind IN ('deleted')),
  CONSTRAINT task_recurrence_exceptions_unique UNIQUE (user_id, parent_task_id, exception_date, kind)
);

ALTER TABLE public.task_recurrence_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own recurrence exceptions"
ON public.task_recurrence_exceptions
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own recurrence exceptions"
ON public.task_recurrence_exceptions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own recurrence exceptions"
ON public.task_recurrence_exceptions
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own recurrence exceptions"
ON public.task_recurrence_exceptions
FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER update_task_recurrence_exceptions_updated_at
BEFORE UPDATE ON public.task_recurrence_exceptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();