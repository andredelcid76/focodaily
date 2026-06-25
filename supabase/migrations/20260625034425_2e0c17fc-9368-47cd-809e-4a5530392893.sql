BEGIN;

-- Rename old enum so we can recreate it
ALTER TYPE public.project_status RENAME TO project_status_old;

-- Create new enum with the 5 desired statuses
CREATE TYPE public.project_status AS ENUM ('in_progress', 'active', 'paused', 'not_started', 'finished');

-- Drop the existing default (it still references the old enum type)
ALTER TABLE public.projects ALTER COLUMN status DROP DEFAULT;

-- Detach columns from the old enum by converting them to text
ALTER TABLE public.projects ALTER COLUMN status TYPE text USING status::text;
ALTER TABLE public.project_status_history ALTER COLUMN from_status TYPE text USING from_status::text;
ALTER TABLE public.project_status_history ALTER COLUMN to_status TYPE text USING to_status::text;

-- Migrate existing project statuses
UPDATE public.projects
SET status = CASE status
  WHEN 'draft' THEN 'not_started'
  WHEN 'active' THEN 'in_progress'
  WHEN 'paused' THEN 'paused'
  WHEN 'done' THEN 'finished'
  WHEN 'archived' THEN 'finished'
END;

-- Migrate status history records
UPDATE public.project_status_history
SET from_status = CASE from_status
  WHEN 'draft' THEN 'not_started'
  WHEN 'active' THEN 'in_progress'
  WHEN 'paused' THEN 'paused'
  WHEN 'done' THEN 'finished'
  WHEN 'archived' THEN 'finished'
END;

UPDATE public.project_status_history
SET to_status = CASE to_status
  WHEN 'draft' THEN 'not_started'
  WHEN 'active' THEN 'in_progress'
  WHEN 'paused' THEN 'paused'
  WHEN 'done' THEN 'finished'
  WHEN 'archived' THEN 'finished'
END;

-- Re-attach columns to the new enum
ALTER TABLE public.projects
  ALTER COLUMN status TYPE public.project_status USING status::public.project_status,
  ALTER COLUMN status SET DEFAULT 'active';

ALTER TABLE public.project_status_history
  ALTER COLUMN from_status TYPE public.project_status USING from_status::public.project_status,
  ALTER COLUMN to_status TYPE public.project_status USING to_status::public.project_status;

-- Drop the old enum
DROP TYPE public.project_status_old;

COMMIT;