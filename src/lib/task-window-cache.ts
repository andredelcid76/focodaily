import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Task } from "@/hooks/useTasks";
import { fetchAllRows } from "./fetchAll";
import { todayISO } from "./date";
import type { LiveTaskUpdate } from "./task-live-state";
import {
  applyChangeToWindow,
  dayWindowFilter,
  taskInWindow,
  taskWindowFromKey,
  windowCoversDate,
  TASKS_ROOT_KEY,
  type TaskWindow,
} from "./task-windows";
import { addDays } from "./date";

/** Changes applied recently, replayed onto window reads that were in flight when they arrived. */
let changeSeq = 0;
const recentChanges: Array<{ seq: number; change: LiveTaskUpdate }> = [];

function windowEntries(qc: QueryClient) {
  return qc
    .getQueriesData<Task[]>({ queryKey: TASKS_ROOT_KEY })
    .flatMap(([key, data]) => {
      const window = taskWindowFromKey(key);
      return window && Array.isArray(data) ? [{ key, window, data }] : [];
    });
}

/** Apply a change to every cached task window (mounted or not): enters, updates or leaves each one. */
export function applyTaskUpdateToCaches(qc: QueryClient, change: LiveTaskUpdate) {
  changeSeq += 1;
  recentChanges.push({ seq: changeSeq, change });
  if (recentChanges.length > 1000) recentChanges.splice(0, recentChanges.length - 1000);
  const today = todayISO();
  for (const { key, window, data } of windowEntries(qc)) {
    const next = applyChangeToWindow(data, change, window, today);
    if (next !== data) qc.setQueryData(key, next);
  }
}

/** A full task row from any cached window (slim project-stats rows excluded). */
export function findCachedTask(qc: QueryClient, id: string): Task | undefined {
  for (const { window, data } of windowEntries(qc)) {
    if (window.kind === "project-stats") continue;
    const row = data.find((t) => t.id === id);
    if (row) return row;
  }
  return undefined;
}

/** Every task of a date when some cached window holds the whole date; otherwise null. */
export function cachedTasksForDate(qc: QueryClient, date: string | null): Task[] | null {
  for (const { window, data } of windowEntries(qc)) {
    if (windowCoversDate(window, date)) return data.filter((t) => t.scheduled_date === date);
  }
  return null;
}

const STATS_COLUMNS = "id,project_id,completed,duration_minutes,time_spent_seconds,scheduled_date,status";

export async function fetchTaskWindow(window: TaskWindow): Promise<Task[]> {
  const startedAt = changeSeq;
  const today = todayISO();
  const ordered = <Q extends { order: (c: string, o?: { ascending: boolean }) => Q }>(q: Q) =>
    q.order("scheduled_date", { ascending: true }).order("position", { ascending: true }).order("id", { ascending: true });
  let rows: Task[];
  switch (window.kind) {
    case "day":
      rows = await fetchAllRows<Task>(() => ordered(supabase.from("tasks").select("*").or(dayWindowFilter(window.date, today))) as never);
      break;
    case "week":
      rows = await fetchAllRows<Task>(() =>
        ordered(supabase.from("tasks").select("*").gte("scheduled_date", window.start).lte("scheduled_date", addDays(window.start, 6))) as never);
      break;
    case "project":
      rows = await fetchAllRows<Task>(() => ordered(supabase.from("tasks").select("*").eq("project_id", window.projectId)) as never);
      break;
    case "project-stats":
      rows = await fetchAllRows<Task>(() =>
        supabase.from("tasks").select(STATS_COLUMNS).not("project_id", "is", null).order("id", { ascending: true }) as never);
      break;
  }
  rows = rows.filter((t) => taskInWindow(t, window, today));
  return recentChanges
    .filter((c) => c.seq > startedAt)
    .reduce((acc, c) => applyChangeToWindow(acc, c.change, window, today), rows);
}

/** Lowest position on a date minus one, so a new/moved task lands at the top (cache first, else one read). */
export async function topPositionFor(qc: QueryClient, date: string | null): Promise<number> {
  const cached = cachedTasksForDate(qc, date);
  if (cached) return cached.length ? Math.min(...cached.map((t) => t.position ?? 0)) - 1 : 0;
  let q = supabase.from("tasks").select("position");
  q = date ? q.eq("scheduled_date", date) : q.is("scheduled_date", null);
  const { data, error } = await q.order("position", { ascending: true }).limit(1);
  if (error) throw error;
  const min = (data?.[0] as { position?: number } | undefined)?.position;
  return typeof min === "number" ? min - 1 : 0;
}
