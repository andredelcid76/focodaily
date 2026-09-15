ALTER TABLE public.tasks
  ADD COLUMN priority smallint NOT NULL DEFAULT 3;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_priority_range CHECK (priority BETWEEN 1 AND 5);

CREATE INDEX IF NOT EXISTS tasks_priority_idx ON public.tasks (priority);

COMMENT ON COLUMN public.tasks.priority IS '1=Muito baixa, 2=Baixa, 3=Media, 4=Alta, 5=Critica';