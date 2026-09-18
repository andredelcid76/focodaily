-- Run only against an empty, disposable PostgreSQL database.
CREATE TABLE public.tasks (id uuid PRIMARY KEY, scheduled_date date, completed boolean DEFAULT false, updated_at timestamptz);
CREATE TABLE public.task_dependencies (predecessor_id uuid, successor_id uuid, lag_days int, dep_type text DEFAULT 'FS');
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
CREATE OR REPLACE FUNCTION public.prevent_dependency_cycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _has_cycle boolean;
BEGIN
  WITH RECURSIVE chain AS (
    SELECT successor_id AS node
      FROM public.task_dependencies
     WHERE predecessor_id = NEW.successor_id
    UNION
    SELECT d.successor_id
      FROM public.task_dependencies d
      JOIN chain c ON d.predecessor_id = c.node
  )
  SELECT EXISTS (SELECT 1 FROM chain WHERE node = NEW.predecessor_id) INTO _has_cycle;

  IF _has_cycle THEN
    RAISE EXCEPTION 'Dependência cria um ciclo entre tarefas';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_task_dependencies_no_cycle
  BEFORE INSERT OR UPDATE ON public.task_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.prevent_dependency_cycle();


CREATE TRIGGER cascade_test AFTER UPDATE OF scheduled_date, completed ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.cascade_task_dependencies();
DO $$
DECLARE
 a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); d uuid := gen_random_uuid();
 base date := make_date(extract(year from CURRENT_DATE)::int + 1, 3, 1);
 ids uuid[]; i int;
BEGIN
 INSERT INTO tasks(id,scheduled_date) VALUES(a,base),(b,base+2),(c,base+4),(d,base+20);
 INSERT INTO task_dependencies VALUES(a,b,2,'FS'),(b,c,2,'FS');
 ASSERT (SELECT scheduled_date = base+2 FROM tasks WHERE id=b) AND (SELECT scheduled_date=base+4 FROM tasks WHERE id=c), 'initial';
 RAISE NOTICE 'PASS A 01/03 -> B 03/03 -> C 05/03 (next year)';
 UPDATE tasks SET scheduled_date=base+10 WHERE id=a;
 ASSERT (SELECT scheduled_date=base+12 FROM tasks WHERE id=b) AND (SELECT scheduled_date=base+14 FROM tasks WHERE id=c), 'push';
 RAISE NOTICE 'PASS postpone: 11/03 -> 13/03 -> 15/03';
 UPDATE tasks SET scheduled_date=base+1 WHERE id=a;
 ASSERT (SELECT scheduled_date=base+3 FROM tasks WHERE id=b) AND (SELECT scheduled_date=base+5 FROM tasks WHERE id=c), 'pull';
 RAISE NOTICE 'PASS anticipate: 02/03 -> 04/03 -> 06/03';
 UPDATE tasks SET completed=true WHERE id=a;
 UPDATE tasks SET scheduled_date=base+15 WHERE id=a;
 ASSERT (SELECT scheduled_date=base+3 FROM tasks WHERE id=b) AND (SELECT scheduled_date=base+5 FROM tasks WHERE id=c), 'completed predecessor';
 RAISE NOTICE 'PASS completed predecessor freezes chain';
 UPDATE tasks SET completed=false WHERE id=a;
 UPDATE tasks SET completed=true WHERE id=b;
 UPDATE tasks SET scheduled_date=base+3 WHERE id=a;
 ASSERT (SELECT scheduled_date=base+17 FROM tasks WHERE id=b) AND (SELECT scheduled_date=base+19 FROM tasks WHERE id=c), 'completed successor';
 RAISE NOTICE 'PASS completed successor unchanged';
 UPDATE tasks SET completed=false WHERE id=b;
 INSERT INTO task_dependencies VALUES(d,b,2,'FS');
 UPDATE tasks SET scheduled_date=base+4 WHERE id=a;
 ASSERT (SELECT scheduled_date=base+22 FROM tasks WHERE id=b) AND (SELECT scheduled_date=base+24 FROM tasks WHERE id=c), 'latest predecessor';
 UPDATE tasks SET scheduled_date=base+2 WHERE id=d;
 ASSERT (SELECT scheduled_date=base+6 FROM tasks WHERE id=b) AND (SELECT scheduled_date=base+8 FROM tasks WHERE id=c), 'latest predecessor pulls';
 RAISE NOTICE 'PASS latest of two predecessors, forward and backward';
 UPDATE tasks SET scheduled_date=CURRENT_DATE-20 WHERE id=d;
 UPDATE tasks SET scheduled_date=CURRENT_DATE-10 WHERE id=a;
 ASSERT (SELECT scheduled_date=CURRENT_DATE FROM tasks WHERE id=b) AND (SELECT scheduled_date=CURRENT_DATE+2 FROM tasks WHERE id=c), 'today floor';
 RAISE NOTICE 'PASS past date floored to today';
 BEGIN
 INSERT INTO task_dependencies VALUES(c,a,2,'FS');
 RAISE EXCEPTION 'Cycle test failed';
 EXCEPTION WHEN raise_exception THEN
 IF SQLERRM <> 'Dependência cria um ciclo entre tarefas' THEN RAISE; END IF;
 END;
 RAISE NOTICE 'PASS existing cycle detection unchanged';
 FOR i IN 1..67 LOOP
 ids := array_append(ids,gen_random_uuid());
 INSERT INTO tasks(id,scheduled_date) VALUES(ids[i],base+i);
 IF i>1 THEN INSERT INTO task_dependencies VALUES(ids[i-1],ids[i],1,'FS'); END IF;
 END LOOP;
 BEGIN
 UPDATE tasks SET scheduled_date=base+100 WHERE id=ids[1];
 RAISE EXCEPTION 'Depth test failed';
 EXCEPTION WHEN raise_exception THEN
 IF SQLERRM NOT LIKE 'Limite de profundidade%' THEN RAISE; END IF;
 END;
 ASSERT (SELECT scheduled_date=base+1 FROM tasks WHERE id=ids[1]), 'depth rollback';
 RAISE NOTICE 'PASS depth limit aborts and rolls back entire cascade';
END $$;
