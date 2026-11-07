# Architecture decisions

- Keep the shared authentication provider in the root route so authenticated navigation never rechecks the session on every page change.
- Keep AppShell mounted at the root for internal routes so navigation replaces only page content; standalone auth, onboarding, invite, and OAuth routes bypass it.
- Listas que podem crescer devem paginar com fetchAllRows (src/lib/fetchAll.ts) — a API corta em 1000 linhas sem avisar.
- Today task numbering uses the shared task-numbering helper on complete collections before view filters or sorting, so display order does not redefine task identity.
- Share notification grouping and rendering between the bell and history page after filters; group actions scope writes by user_id and task_id so pagination does not limit their effect.
- Task ownership authorization always uses the persisted owner/source project; actor headers are trusted only from service-role requests.
- Claim notification deliveries atomically through service-only RPCs before sending; retry only transient failures with bounded attempts, reclaim stale reservations, and preserve successful Teams delivery state.
- Cron callbacks use a dedicated server secret mirrored to a service-only database credential store, never a public key or client input.
- Enforce invitation limits and signup eligibility in database triggers; profile email comes only from Auth server synchronization.
- Validate internal auth return paths centrally; external OAuth redirects require exact registered-client allowlist checks before redirects.
- Compute user calendar dates through the shared timezone helper using profiles.timezone, with a validated fallback; keep timestamp serialization in UTC.
- Centralize filtered task Realtime in the shell and apply row payloads idempotently; access losses/gains arrive via the private user:<uid> doorbell (re-check by id), deletes/comments are acted on only for loaded tasks, and only affected query families are invalidated.
- RLS policies wrap auth.uid() as (select auth.uid()) and use my_project_ids() for project visibility, so checks run once per query instead of per row.
- Delegation scope (self, company-domain colleague or shared project) is enforced by a tasks trigger; people pickers filter through delegable_user_ids() so the UI never offers someone the database will reject.
- Projects, roles and meetings load through shared TanStack Query keys (meetings per Monday–Sunday week) and shared Realtime channels via retainSharedChannel, so shell widgets and pages do not duplicate requests.
- Task screens read only their window (["tasks","day"|"week"|"project"|"project-stats",...], Delegadas ["tasks","delegated"]) via task-window-cache; every change goes through applyTaskUpdateToCaches so rows enter/leave each cached window, and actions read series/positions/follow-ups on demand instead of holding the full collection.
- Analytics aggregates in the database (analytics_summary, SECURITY INVOKER) for the selected window; the page never downloads task rows.
