import type { Task } from "@/hooks/useTasks";
export const TASKS_CHANGED_EVENT = "foco:tasks-changed";
export const TASKS_RESYNC_EVENT = "foco:tasks-resync";
export const DEPENDENCIES_CHANGED_EVENT = "foco:dependencies-changed";
export const TASK_COMMENTS_CHANGED_EVENT = "foco:task-comments-changed";
export const PROJECT_ACCESS_CHANGED_EVENT = "foco:project-access-changed";
export type TaskChange = { eventType: "INSERT" | "UPDATE" | "DELETE"; new: Partial<Task>; old: Partial<Task>; commit_timestamp?: string };
/** Authoritative rows of one project after an access change (RLS-filtered read). */
export type ProjectSnapshot = { eventType: "PROJECT_SNAPSHOT"; projectId: string; rows: Task[] };
export type LiveTaskUpdate = TaskChange | ProjectSnapshot;
export function replayTaskChanges(tasks: Task[], changes: LiveTaskUpdate[]): Task[] {
  return changes.reduce(applyLiveUpdate, tasks);
}
export function applyLiveUpdate(tasks: Task[], change: LiveTaskUpdate): Task[] {
  return change.eventType === "PROJECT_SNAPSHOT" ? applyProjectSnapshot(tasks, change) : applyTaskChange(tasks, change);
}
/** Replace one project's slice: rows no longer readable leave, newly readable rows arrive. */
export function applyProjectSnapshot(tasks: Task[], snapshot: ProjectSnapshot): Task[] {
  const keep = new Set(snapshot.rows.map(r => r.id));
  const base = tasks.filter(t => t.project_id !== snapshot.projectId || keep.has(t.id));
  return snapshot.rows.reduce((acc, row) => applyTaskChange(acc, { eventType: "INSERT", new: row, old: {} }), base);
}
/** Same scope as the tasks SELECT policies: owner, assignee, or a visible project. */
export function isTaskInScope(task: Partial<Task>, userId: string, projectIds: ReadonlySet<string>): boolean {
  return task.user_id === userId || task.assignee_id === userId || (!!task.project_id && projectIds.has(task.project_id));
}
/** An UPDATE that leaves the viewer's scope is applied as a removal. */
export function scopeTaskChange(change: TaskChange, userId: string, projectIds: ReadonlySet<string>): TaskChange {
  if (change.eventType !== "UPDATE" || !change.new.id || !("user_id" in change.new)) return change;
  return isTaskInScope(change.new, userId, projectIds) ? change : { eventType: "DELETE", new: {}, old: { id: change.new.id } };
}
/** Owner/assignee/project changes alter which list queries contain the task. */
export function changesTaskScope(change: TaskChange): boolean {
  if (change.eventType !== "UPDATE") return true;
  return (["user_id", "assignee_id", "project_id"] as const).some(k => k in change.new && k in change.old && change.new[k] !== change.old[k]);
}

/** Task ids currently held by any mounted task collection (used to ignore unrelated broadcasts). */
const loadedTaskIds = new Map<symbol, ReadonlySet<string>>();
export function setLoadedTaskIds(owner: symbol, ids: ReadonlySet<string> | null) {
  if (ids) loadedTaskIds.set(owner, ids); else loadedTaskIds.delete(owner);
}
export function isTaskIdLoaded(id: string | null | undefined): boolean {
  if (!id) return false;
  for (const ids of loadedTaskIds.values()) if (ids.has(id)) return true;
  return false;
}

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
export const MAX_PER_PROJECT_FILTERS = 20;
/** Realtime accepts up to 100 values in one `in` filter. */
export const PROJECT_FILTER_CHUNK = 100;
export function taskSubscriptionFilters(userId: string, projectIds: string[]) {
  const ids = Array.from(new Set(projectIds)).sort();
  const projectFilters: string[] = [];
  if (ids.length <= MAX_PER_PROJECT_FILTERS) projectFilters.push(...ids.map(id => `project_id=eq.${id}`));
  else for (let i = 0; i < ids.length; i += PROJECT_FILTER_CHUNK) projectFilters.push(`project_id=in.(${ids.slice(i, i + PROJECT_FILTER_CHUNK).join(",")})`);
  return [`user_id=eq.${userId}`, `assignee_id=eq.${userId}`, ...projectFilters];
}
export function taskQueryKeys(change: TaskChange): unknown[][] {
  const projects = new Set([change.new.project_id, change.old.project_id].filter(Boolean));
  if (change.eventType === "DELETE" && !projects.size) return [["my-assigned-tasks"], ["dependency-status"], ["project-tasks"]];
  return [["my-assigned-tasks"], ["dependency-status"], ...Array.from(projects).map(id => ["project-tasks", id])];
}