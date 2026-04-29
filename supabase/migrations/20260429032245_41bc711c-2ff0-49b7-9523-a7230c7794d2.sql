-- Comentários do projeto
CREATE TABLE public.project_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_project_comments_project ON public.project_comments(project_id, created_at DESC);
ALTER TABLE public.project_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own project comments" ON public.project_comments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own project comments" ON public.project_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own project comments" ON public.project_comments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own project comments" ON public.project_comments FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER project_comments_updated_at BEFORE UPDATE ON public.project_comments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Links / referências
CREATE TABLE public.project_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  user_id UUID NOT NULL,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'link',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_project_links_project ON public.project_links(project_id, position);
ALTER TABLE public.project_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own project links" ON public.project_links FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own project links" ON public.project_links FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own project links" ON public.project_links FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own project links" ON public.project_links FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER project_links_updated_at BEFORE UPDATE ON public.project_links FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Marcos
CREATE TYPE public.milestone_status AS ENUM ('pending', 'in_progress', 'done');
CREATE TABLE public.project_milestones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  status public.milestone_status NOT NULL DEFAULT 'pending',
  position INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_project_milestones_project ON public.project_milestones(project_id, position);
ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own milestones" ON public.project_milestones FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own milestones" ON public.project_milestones FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own milestones" ON public.project_milestones FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own milestones" ON public.project_milestones FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER project_milestones_updated_at BEFORE UPDATE ON public.project_milestones FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Planner: vínculo no projeto e nas tarefas
ALTER TABLE public.projects
  ADD COLUMN planner_plan_id TEXT,
  ADD COLUMN planner_synced_at TIMESTAMPTZ;

ALTER TABLE public.tasks
  ADD COLUMN planner_task_id TEXT,
  ADD COLUMN planner_etag TEXT;

CREATE INDEX idx_tasks_planner ON public.tasks(planner_task_id) WHERE planner_task_id IS NOT NULL;