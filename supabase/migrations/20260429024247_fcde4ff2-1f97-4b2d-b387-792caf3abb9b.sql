-- Status enum
CREATE TYPE public.project_status AS ENUM ('draft', 'active', 'paused', 'done', 'archived');

-- Projects table
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  color text NOT NULL DEFAULT '#8b5cf6',
  icon text NOT NULL DEFAULT 'folder',
  role_id uuid,
  status public.project_status NOT NULL DEFAULT 'active',
  starts_on date,
  deadline date,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own projects"
  ON public.projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own projects"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own projects"
  ON public.projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own projects"
  ON public.projects FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_projects_user_status ON public.projects(user_id, status);
CREATE INDEX idx_projects_user_deadline ON public.projects(user_id, deadline);

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Activity log: status changes
CREATE TABLE public.project_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  from_status public.project_status,
  to_status public.project_status NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own project history"
  ON public.project_status_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own project history"
  ON public.project_status_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own project history"
  ON public.project_status_history FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_project_history_project ON public.project_status_history(project_id, created_at DESC);

-- Link tasks and meetings to projects
ALTER TABLE public.tasks
  ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX idx_tasks_project ON public.tasks(project_id) WHERE project_id IS NOT NULL;

ALTER TABLE public.meetings
  ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX idx_meetings_project ON public.meetings(project_id) WHERE project_id IS NOT NULL;