ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS time_spent_seconds integer NOT NULL DEFAULT 0;

ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.roles;
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER TABLE public.roles REPLICA IDENTITY FULL;