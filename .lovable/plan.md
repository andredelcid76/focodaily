## Fix realtime channel collision in useRoles.ts

**Problem:** The `useRoles` hook uses a static Supabase Realtime channel name (`"roles-rt"`). When multiple component instances mount simultaneously (e.g., `QuickAddTaskButton` + a page component), they attempt to subscribe to the same channel name. Supabase reuses the channel instance, and the second `.on(...).subscribe()` call fails with:

> cannot add `postgres_changes` callbacks for realtime:roles-rt after `subscribe()`.

This is the same race condition previously fixed in `useTasks.ts` and `useProjects.ts`.

**Fix:** Append a random suffix to the channel name so each hook instance gets its own unique channel, preventing reuse collisions.

**File to edit:** `src/hooks/useRoles.ts` (line 37)

```typescript
// Before:
const ch = supabase
  .channel("roles-rt")

// After:
const ch = supabase
  .channel(`roles-rt-${Math.random().toString(36).slice(2)}`)
```

**Verification:** After the change, the app should open without the `roles-rt` realtime error in the console.