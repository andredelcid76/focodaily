
-- Tabela de sugestões da caixa de entrada
CREATE TABLE public.inbox_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL CHECK (source IN ('email','meeting','pipedrive')),
  source_id TEXT NOT NULL,
  source_label TEXT,
  source_url TEXT,
  source_date TIMESTAMPTZ,
  suggested_category TEXT NOT NULL DEFAULT 'important' CHECK (suggested_category IN ('urgent','important','circumstantial')),
  suggested_duration_minutes INTEGER NOT NULL DEFAULT 30,
  suggested_date DATE,
  reasoning TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','dismissed')),
  accepted_task_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acted_at TIMESTAMPTZ
);

CREATE INDEX idx_inbox_suggestions_user_status ON public.inbox_suggestions(user_id, status, created_at DESC);

ALTER TABLE public.inbox_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own suggestions" ON public.inbox_suggestions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own suggestions" ON public.inbox_suggestions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own suggestions" ON public.inbox_suggestions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own suggestions" ON public.inbox_suggestions FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_inbox_suggestions_updated_at BEFORE UPDATE ON public.inbox_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Marcar fontes já processadas para deduplicação
CREATE TABLE public.inbox_processed_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('email','meeting','pipedrive')),
  source_id TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, source_id)
);

CREATE INDEX idx_inbox_processed_user ON public.inbox_processed_sources(user_id, source);

ALTER TABLE public.inbox_processed_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own processed" ON public.inbox_processed_sources FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own processed" ON public.inbox_processed_sources FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own processed" ON public.inbox_processed_sources FOR DELETE USING (auth.uid() = user_id);

-- Configurações por usuário (token Pipedrive, etc)
CREATE TABLE public.pipedrive_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  api_token TEXT NOT NULL,
  domain TEXT NOT NULL,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pipedrive_connections ENABLE ROW LEVEL SECURITY;
-- Sem políticas: só accessible via service role (server functions)

-- Última execução do scanner por usuário
CREATE TABLE public.inbox_scan_state (
  user_id UUID NOT NULL PRIMARY KEY,
  last_scan_at TIMESTAMPTZ,
  last_status TEXT,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inbox_scan_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own scan state" ON public.inbox_scan_state FOR SELECT USING (auth.uid() = user_id);
