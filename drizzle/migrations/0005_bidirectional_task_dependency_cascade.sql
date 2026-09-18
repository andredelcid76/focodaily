CREATE OR REPLACE FUNCTION public.cascade_task_dependencies()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  _successor_id uuid;
  _new_date date;
BEGIN
  IF NEW.completed OR NEW.scheduled_date IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.scheduled_date IS NOT DISTINCT FROM OLD.scheduled_date
     AND NEW.completed IS NOT DISTINCT FROM OLD.completed THEN
    RETURN NEW;
  END IF;

  -- Abort the entire change rather than silently leaving a partial cascade.
  IF pg_trigger_depth() > 64 THEN
    RAISE EXCEPTION 'Limite de profundidade da cascata de dependências excedido (64)';
  END IF;

  FOR _successor_id IN
    SELECT d.successor_id
      FROM public.task_dependencies d
      JOIN public.tasks t ON t.id = d.successor_id
     WHERE d.predecessor_id = NEW.id
       AND d.dep_type = 'FS'
       AND NOT t.completed
     ORDER BY d.successor_id
  LOOP
    -- All dated predecessors constrain this successor, including completed ones.
    -- Completed predecessors never initiate propagation themselves.
    SELECT max(p.scheduled_date + d.lag_days)
      INTO _new_date
      FROM public.task_dependencies d
      JOIN public.tasks p ON p.id = d.predecessor_id
     WHERE d.successor_id = _successor_id
       AND d.dep_type = 'FS'
       AND p.scheduled_date IS NOT NULL;

    IF _new_date IS NOT NULL THEN
      _new_date := GREATEST(CURRENT_DATE, _new_date);
      UPDATE public.tasks
         SET scheduled_date = _new_date,
             updated_at = now()
       WHERE id = _successor_id
         AND NOT completed
         AND scheduled_date IS DISTINCT FROM _new_date;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;