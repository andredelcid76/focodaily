-- Disposable fixture only. No external messages are sent.
BEGIN;
DELETE FROM notifications;
DO $$
DECLARE owner_id uuid := gen_random_uuid(); assignee_id uuid := gen_random_uuid(); source_id uuid := gen_random_uuid(); task_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO projects(id,user_id,members_can_reassign) VALUES(source_id,owner_id,true);
  INSERT INTO tasks(id,user_id,project_id,assignee_id) VALUES(task_id,owner_id,source_id,assignee_id);
  PERFORM set_config('request.jwt.claim.sub',assignee_id::text,true);
  UPDATE tasks SET assignee_id=owner_id WHERE id=task_id;
  ASSERT (SELECT assignee_id=owner_id FROM tasks WHERE id=task_id), 'assignee reassigns when enabled';
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  UPDATE tasks SET assignee_id=assignee_id WHERE id=task_id;
  UPDATE projects SET members_can_reassign=false WHERE id=source_id;
  PERFORM set_config('request.jwt.claim.sub',assignee_id::text,true);
  BEGIN UPDATE tasks SET assignee_id=owner_id WHERE id=task_id; RAISE EXCEPTION 'TEST_FAILED disabled reassign allowed';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST_FAILED%' THEN RAISE; END IF; END;
  RAISE NOTICE 'PASS database assignee reassignment enabled/disabled';
END $$;
DO $$
DECLARE n public.notifications; i integer;
BEGIN
  INSERT INTO notifications(id,user_id,type,title) VALUES(gen_random_uuid(),gen_random_uuid(),'task_assigned','permanent failure');
  SELECT * INTO n FROM claim_pending_notifications();
  ASSERT n.delivery_attempts = 1, 'first attempt counted';
  PERFORM finish_notification_delivery(n.id,n.delivery_claim_id,false,false,false,'teams:sender_without_microsoft_connection');
  ASSERT (SELECT emailed_at IS NOT NULL AND delivery_error='teams:sender_without_microsoft_connection' FROM notifications WHERE id=n.id), 'permanent remains processed with reason';
  ASSERT (SELECT count(*)=0 FROM claim_pending_notifications()), 'permanent never returns to queue';

  INSERT INTO notifications(id,user_id,type,title) VALUES(gen_random_uuid(),gen_random_uuid(),'task_assigned','transient failure');
  FOR i IN 1..5 LOOP
    SELECT * INTO n FROM claim_pending_notifications();
    ASSERT n.delivery_attempts=i, 'each retry counts one attempt';
    PERFORM finish_notification_delivery(n.id,n.delivery_claim_id,true,i=1,false,'teams:recipient_lookup_503');
    ASSERT (SELECT teams_sent_at IS NOT NULL FROM notifications WHERE id=n.id), 'successful Teams preserved';
    IF i<5 THEN ASSERT (SELECT emailed_at IS NULL FROM notifications WHERE id=n.id), 'transient returns before limit'; END IF;
  END LOOP;
  ASSERT (SELECT emailed_at IS NOT NULL AND delivery_error LIKE '%attempt_limit_5%' FROM notifications WHERE id=n.id), 'fifth failure terminal';
  ASSERT (SELECT count(*)=0 FROM claim_pending_notifications()), 'no sixth attempt';

  INSERT INTO notifications(id,user_id,type,title,emailed_at,delivery_claim_id,delivery_attempts)
    VALUES(gen_random_uuid(),gen_random_uuid(),'task_assigned','orphan',now()-interval '16 minutes',gen_random_uuid(),1);
  SELECT * INTO n FROM claim_pending_notifications();
  ASSERT n.title='orphan' AND n.delivery_attempts=2, 'orphan reclaimed after 15 minutes';
  ASSERT n.delivery_error LIKE '%orphan_claim_recovered%', 'recovery recorded';
  PERFORM finish_notification_delivery(n.id,n.delivery_claim_id,false,false,false,'');
  INSERT INTO notifications(id,user_id,type,title,emailed_at,delivery_claim_id,delivery_attempts)
    VALUES(gen_random_uuid(),gen_random_uuid(),'task_assigned','fresh claim',now()-interval '14 minutes',gen_random_uuid(),1),
          (gen_random_uuid(),gen_random_uuid(),'task_assigned','fifth orphan',now()-interval '16 minutes',gen_random_uuid(),5);
  ASSERT (SELECT count(*)=0 FROM claim_pending_notifications()), 'fresh reservation intact and fifth orphan never retried';
  ASSERT (SELECT delivery_claim_id IS NOT NULL FROM notifications WHERE title='fresh claim'), 'fresh claim kept';
  ASSERT (SELECT emailed_at IS NOT NULL AND delivery_claim_id IS NULL AND delivery_error LIKE '%attempt_limit_5%' FROM notifications WHERE title='fifth orphan'), 'fifth orphan processed';
  RAISE NOTICE 'PASS terminal errors, transient retries, max 5 attempts, orphan recovery at 15 minutes, Teams retention';
END $$;
ROLLBACK;