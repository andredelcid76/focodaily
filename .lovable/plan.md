Investigation only. No code changed.

1. Where it comes from: a database trigger
- `trg_notify_task_assignment` runs AFTER INSERT/UPDATE on `tasks` (supabase/migrations/20260602032700_...sql:76-78).
- The current function is `public.notify_task_assignment()` (supabase/migrations/20260703015010_...sql:168+). It was checked against the live database: it uses `auth.uid()` and never reads `x-foco-actor-id`.
- What triggers it: `NEW.assignee_id IS NOT NULL AND NEW.assignee_id <> auth.uid()`. It inserts a `task_assigned` row ("Nova tarefa delegada para você", "Alguém delegou: ...").
- From there, `useRecentNotifications` (src/hooks/useNotifications.ts:91-113) picks it up in realtime and shows the toast. Email/Teams go out through `notificationsDelivery.server.ts`. The UI and MCP code do not create this notification.

2. Why it fires when you create your own task
- The MCP writes with the service role key (src/lib/mcp/supabase.ts:15). It only sends the `x-foco-actor-id` header, and the trigger ignores that header.
- With the service role, `auth.uid()` is NULL. `assignee_id <> NULL` evaluates to NULL, not false. In PL/pgSQL, `NULL AND NULL` is NULL... so in principle the IF would not fire.
- Because of that, the real cause still needs checking. The most likely suspects are other triggers on `tasks` that use the same `<> auth.uid()` pattern with `IS DISTINCT FROM`, or `COALESCE(auth.uid(), user_id)`:
  - `notify_task_owner_changes`
  - `merge_unread_task_notification`
  - an older `notify_task_assignment` in another migration
- The "Alguém" in the text matches what happens when `auth.uid()` is NULL: no actor name is found, so it falls back to "Alguém".
- Root cause confirmed so far: database triggers decide "who did it" from `auth.uid()`, which is empty for the MCP. So "I did it myself" is never recognized.
- Next step, if you want it: look at the latest `notifications` row with `actor_id IS NULL` and its `type`, to see exactly which trigger created it.

3. Is there a field that marks the origin?
- There is no `created_via` field. There is `tasks.origin_source` (plus `origin_source_label` and `origin_source_url`), but `create_task` does not fill it in. Only `update_task` accepts it (src/lib/mcp/tools/index.ts:842-844, 875-877).
- `create_task` (src/lib/mcp/tools/index.ts:687-733) does this:
  - `user_id = userId`, taken from the token (`getUserId`, supabase.ts:33).
  - `assignee_id = args.assignee_id` (after validation, lines 723-726). If none is given, it is the creator (line 728).
  - It inserts through `db(ctx.auth)` with the service role (line 735).

Suggested fix (for a later step): in the triggers, use `COALESCE(auth.uid(), current_setting('request.headers')::json->>'x-foco-actor-id', NEW.user_id)` as the actor. Also have `create_task` set `origin_source = 'mcp'`.
