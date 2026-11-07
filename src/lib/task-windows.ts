import type { Task } from "@/hooks/useTasks";
import { addDays, dateInTimezone } from "./date";
import type { LiveTaskUpdate } from "./task-live-state";

/**
 * Each screen reads only its own slice of tasks, cached under one TanStack Query key:
 *   Hoje     ["tasks","day",date]      — the day + overdue open + in progress (+ finished that day from later dates)
 *   Semana   ["tasks","week",monday]   — scheduled Monday..Sunday
 *   Projeto  ["tasks","project",id]    — every task of the project
 *   Projetos ["tasks","project-stats"] — slim rows for progress cards
 * Delegadas uses ["tasks","delegated"] (hydrated rows, see myTasks.functions).
 */
export type TaskWindow =
  | { kind: "day"; date: string }
  | { kind: "week"; start: string }
  | { kind: "project"; projectId: string }
  | { kind: "project-stats" };

export const TASKS_ROOT_KEY = ["tasks"] as const;
export const DELEGATED_TASKS_KEY = ["tasks", "delegated"] as const;

export function taskWindowKey(window: TaskWindow): readonly unknown[] {
  switch (window.kind) {
    case "day": return ["tasks", "day", window.date];
    case "week": return ["tasks", "week", window.start];
    case "project": return ["tasks", "project", window.projectId];
    case "project-stats": return ["tasks", "project-stats"];
  }
}

export function taskWindowFromKey(key: readonly unknown[]): TaskWindow | null {
  if (key[0] !== "tasks") return null;
  if (key[1] === "day" && typeof key[2] === "string") return { kind: "day", date: key[2] };
  if (key[1] === "week" && typeof key[2] === "string") return { kind: "week", start: key[2] };
  if (key[1] === "project" && typeof key[2] === "string") return { kind: "project", projectId: key[2] };
  if (key[1] === "project-stats") return { kind: "project-stats" };
  return null;
}

const IN_PROGRESS = new Set(["in_progress", "doing"]);

/** Whether a (full or merged) task row belongs to a window. `today` is the user's calendar day. */
export function taskInWindow(task: Partial<Task>, window: TaskWindow, today: string, timezone?: string | null): boolean {
  const date = task.scheduled_date ?? null;
  switch (window.kind) {
    case "day": {
      if (date === window.date) return true;
      if (!task.completed && !!date && date < today) return true;
      if (!task.completed && IN_PROGRESS.has(String(task.status ?? ""))) return true;
      return !!task.completed && !!task.completed_at && !!date && date > window.date
        && dateInTimezone(new Date(task.completed_at), timezone) === window.date;
    }
    case "week":
      return !!date && date >= window.start && date <= addDays(window.start, 6);
    case "project":
      return task.project_id === window.projectId;
    case "project-stats":
      return !!task.project_id;
  }
}

/** Calendar dates whose every task is guaranteed to be in this window. */
export function windowCoversDate(window: TaskWindow, date: string | null): boolean {
  if (!date) return false;
  if (window.kind === "day") return window.date === date;
  if (window.kind === "week") return date >= window.start && date <= addDays(window.start, 6);
  return false;
}

const isFullRow = (row: Partial<Task>): row is Task => !!row.id && !!row.user_id && typeof row.title === "string";
const sameRow = (a: Task, patch: Partial<Task>) =>
  Object.entries(patch).every(([k, v]) => JSON.stringify(a[k as keyof Task]) === JSON.stringify(v));

function upsertInWindow(list: Task[], row: Partial<Task>, window: TaskWindow, today: string, timezone?: string | null): Task[] {
  const index = list.findIndex((t) => t.id === row.id);
  const existing = index >= 0 ? list[index] : undefined;
  if (!existing && !isFullRow(row)) return list; // a partial patch for a row we never held
  const merged = (existing ? { ...existing, ...row } : row) as Task;
  if (!taskInWindow(merged, window, today, timezone)) return existing ? list.filter((t) => t.id !== row.id) : list;
  if (!existing) return [...list, merged];
  if (sameRow(existing, row)) return list;
  const next = list.slice();
  next[index] = merged;
  return next;
}

/** Apply one live/optimistic change to one window: insert, update or remove as the task enters or leaves. */
export function applyChangeToWindow(list: Task[], change: LiveTaskUpdate, window: TaskWindow, today: string, timezone?: string | null): Task[] {
  if (change.eventType === "PROJECT_SNAPSHOT") {
    const keep = new Set(change.rows.map((r) => r.id));
    const base = list.filter((t) => t.project_id !== change.projectId || keep.has(t.id));
    return change.rows.reduce((acc, row) => upsertInWindow(acc, row, window, today, timezone), base);
  }
  if (change.eventType === "DELETE") {
    const id = change.old.id;
    return id && list.some((t) => t.id === id) ? list.filter((t) => t.id !== id) : list;
  }
  if (!change.new.id) return list;
  return upsertInWindow(list, change.new, window, today, timezone);
}

/** Delegadas membership: delegated to me by someone else, or delegated by me to someone else. */
export function isDelegatedRow(task: Partial<Task>, userId: string): boolean {
  if (task.assignee_id === userId && task.user_id !== userId) return true;
  return task.user_id === userId && !!task.assignee_id && task.assignee_id !== userId;
}

/** PostgREST `or` filter for the day window (re-checked exactly with taskInWindow after reading). */
export function dayWindowFilter(date: string, today: string): string {
  // Wide UTC bounds cover the user's local calendar day, including DST offsets.
  const from = `${addDays(date, -1)}T00:00:00.000Z`;
  const to = `${addDays(date, 2)}T00:00:00.000Z`;
  return [
    `scheduled_date.eq.${date}`,
    `and(scheduled_date.lt.${today},completed.eq.false)`,
    `and(status.in.(in_progress,doing),completed.eq.false)`,
    `and(scheduled_date.gt.${date},completed.eq.true,completed_at.gte.${from},completed_at.lt.${to})`,
  ].join(",");
}
