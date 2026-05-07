CREATE TABLE public.task_subtasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_subtasks_task_position ON public.task_subtasks(task_id, position);

ALTER TABLE public.task_subtasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own subtasks" ON public.task_subtasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own subtasks" ON public.task_subtasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own subtasks" ON public.task_subtasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own subtasks" ON public.task_subtasks FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER task_subtasks_updated_at BEFORE UPDATE ON public.task_subtasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();