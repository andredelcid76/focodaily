CREATE TABLE public.meetings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
  scheduled_date DATE NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  external_id TEXT,
  web_link TEXT,
  color TEXT NOT NULL DEFAULT '#0ea5e9',
  is_all_day BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own meetings" ON public.meetings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own meetings" ON public.meetings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own meetings" ON public.meetings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own meetings" ON public.meetings FOR DELETE USING (auth.uid() = user_id);

CREATE UNIQUE INDEX meetings_user_external_unique ON public.meetings (user_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX meetings_user_date_idx ON public.meetings (user_id, scheduled_date);

CREATE TRIGGER meetings_updated_at BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();