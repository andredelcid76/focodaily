-- User preferences (daily capacity, etc.)
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY,
  daily_capacity_minutes INTEGER NOT NULL DEFAULT 480,
  auto_organize_use_ai BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own preferences" ON public.user_preferences
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own preferences" ON public.user_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own preferences" ON public.user_preferences
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own preferences" ON public.user_preferences
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Reorder log: every time the user manually changes order after auto-organize, capture signal for future learning.
CREATE TABLE IF NOT EXISTS public.task_reorder_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  reference_date DATE NOT NULL,
  source TEXT NOT NULL DEFAULT 'auto', -- 'auto' | 'manual'
  ordered_task_ids UUID[] NOT NULL,
  reasoning TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_reorder_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own reorder logs" ON public.task_reorder_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own reorder logs" ON public.task_reorder_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own reorder logs" ON public.task_reorder_logs
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_task_reorder_logs_user_date
  ON public.task_reorder_logs(user_id, reference_date DESC);