# Architecture decisions

- Keep the shared authentication provider in the root route so authenticated navigation never rechecks the session on every page change.
- Keep AppShell mounted at the root for internal routes so navigation replaces only page content; standalone auth, onboarding, invite, and OAuth routes bypass it.