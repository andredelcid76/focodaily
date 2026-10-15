ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS claude_started_at timestamptz;

CREATE OR REPLACE FUNCTION public.clear_claude_on_complete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (NEW.completed = true AND COALESCE(OLD.completed,false) = false)
     OR (NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done') THEN
    NEW.claude_started_at := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_clear_claude_on_complete ON public.tasks;
CREATE TRIGGER trg_clear_claude_on_complete BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.clear_claude_on_complete();