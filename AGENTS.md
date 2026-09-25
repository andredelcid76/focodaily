# Architecture decisions

- Keep the shared authentication provider in the root route so authenticated navigation never rechecks the session on every page change.