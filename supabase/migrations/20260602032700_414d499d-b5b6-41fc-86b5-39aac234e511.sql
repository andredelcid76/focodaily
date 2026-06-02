
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  task_id UUID,
  project_id UUID,
  actor_id UUID,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, read_at, created_at DESC);

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications"
ON public.notifications FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications"
ON public.notifications FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own notifications"
ON public.notifications FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Trigger: notify on task delegation
CREATE OR REPLACE FUNCTION public.notify_task_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor_name text;
BEGIN
  IF NEW.assignee_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.assignee_id IS NOT DISTINCT FROM OLD.assignee_id THEN
    RETURN NEW;
  END IF;

  IF NEW.assignee_id = auth.uid() THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(display_name, email) INTO _actor_name
  FROM public.profiles WHERE user_id = auth.uid();

  INSERT INTO public.notifications (user_id, type, title, body, task_id, project_id, actor_id, link)
  VALUES (
    NEW.assignee_id,
    'task_assigned',
    'Nova tarefa delegada para você',
    COALESCE(_actor_name, 'Alguém') || ' delegou: ' || NEW.title,
    NEW.id,
    NEW.project_id,
    auth.uid(),
    '/hoje'
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_task_assignment
AFTER INSERT OR UPDATE OF assignee_id ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_task_assignment();

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
