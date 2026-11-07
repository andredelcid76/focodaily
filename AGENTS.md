# Architecture decisions

- Keep the shared authentication provider in the root route so authenticated navigation never rechecks the session on every page change.
- Keep AppShell mounted at the root for internal routes so navigation replaces only page content; standalone auth, onboarding, invite, and OAuth routes bypass it.
- Listas que podem crescer devem paginar com fetchAllRows (src/lib/fetchAll.ts) — a API corta em 1000 linhas sem avisar.
- Today task numbering uses the shared task-numbering helper on complete collections before view filters or sorting, so display order does not redefine task identity.
- Share notification grouping and rendering between the bell and history page after filters; group actions scope writes by user_id and task_id so pagination does not limit their effect.
