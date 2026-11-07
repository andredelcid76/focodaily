import type { Task } from "@/hooks/useTasks";
export const TASKS_CHANGED_EVENT = "foco:tasks-changed";
export const TASKS_RESYNC_EVENT = "foco:tasks-resync";
export const DEPENDENCIES_CHANGED_EVENT = "foco:dependencies-changed";
export type TaskChange = { eventType: "INSERT" | "UPDATE" | "DELETE"; new: Partial<Task>; old: Partial<Task>; commit_timestamp?: string };

export function applyTaskChange(tasks: Task[], change: TaskChange): Task[] {
  const id = change.eventType === "DELETE" ? change.old.id : change.new.id;
  if (!id) return tasks;
  const existing = tasks.find(t => t.id === id);
  if (change.eventType === "DELETE") return existing ? tasks.filter(t => t.id !== id) : tasks;
  if (existing) {
    if (Object.entries(change.new).every(([key, value]) => JSON.stringify(existing[key as keyof Task]) === JSON.stringify(value))) return tasks;
    return tasks.map(t => t.id === id ? { ...t, ...change.new } : t);
  }
  if (!change.new.user_id || !change.new.title) return tasks;
  return [...tasks, change.new as Task];
}

/** Correlate exact changed fields, not actor IDs: same-user MCP writes must still arrive. */
const optimistic = new Map<string, { patch: Partial<Task>; expires: number }>();
export function rememberOptimisticTask(id: string, patch: Partial<Task>) {
  optimistic.set(id, { patch, expires: Date.now() + 15_000 });
}
export function forgetOptimisticTask(id: string) { optimistic.delete(id); }
export function matchesOptimisticTask(change: TaskChange): boolean {
  const id = change.new.id;
  if (!id) return false;
  const entry = optimistic.get(id);
  if (!entry) return false;
  if (entry.expires < Date.now()) { optimistic.delete(id); return false; }
  const matches = Object.entries(entry.patch).every(([key, value]) => JSON.stringify(change.new[key as keyof Task]) === JSON.stringify(value));
  if (matches) optimistic.delete(id);
  return matches;
}
export function taskSubscriptionFilters(userId: string, projectIds: string[]) {
  return [`user_id=eq.${userId}`, `assignee_id=eq.${userId}`, ...Array.from(new Set(projectIds)).sort().map(id => `project_id=eq.${id}`)];
}
export function taskQueryKeys(change: TaskChange): unknown[][] {
  const projects = new Set([change.new.project_id, change.old.project_id].filter(Boolean));
  return [["my-assigned-tasks"], ["dependency-status"], ...Array.from(projects).map(id => ["project-tasks", id])];
}