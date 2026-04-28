CREATE TABLE public.roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#8b5cf6',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own roles" ON public.roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own roles" ON public.roles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own roles" ON public.roles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own roles" ON public.roles FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER roles_updated_at BEFORE UPDATE ON public.roles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.tasks
  ADD COLUMN role_id UUID REFERENCES public.roles(id) ON DELETE SET NULL,
  ADD COLUMN recurrence_interval INTEGER,
  ADD COLUMN recurrence_weekdays INTEGER[];

CREATE INDEX idx_tasks_role_id ON public.tasks(role_id);
CREATE INDEX idx_roles_user_id ON public.roles(user_id);