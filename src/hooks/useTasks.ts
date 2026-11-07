import { rememberOptimisticTask, forgetOptimisticTask, setLoadedTaskIds, TASKS_CHANGED_EVENT, type LiveTaskUpdate } from "@/lib/task-live-state";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { taskWindowKey, TASKS_ROOT_KEY, type TaskWindow } from "@/lib/task-windows";
import { applyTaskUpdateToCaches, cachedTasksForDate, fetchTaskWindow, findCachedTask, topPositionFor } from "@/lib/task-window-cache";
import { fetchAllRows } from "@/lib/fetchAll";
import { confirmDependencyMove } from "@/lib/dependency-check";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
export type { TaskWindow } from "@/lib/task-windows";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { todayISO, addDays } from "@/lib/date";
import { syncTaskCompletionToPipedrive } from "@/lib/pipedriveSync.functions";

export type Task = Tables<"tasks">;
export type TaskCategory = Task["category"];
export type TaskRecurrence = Task["recurrence"];
export type TaskStatus = Task["status"];
type TaskRecurrenceException = Tables<"task_recurrence_exceptions">;

// How many days ahead we materialize recurring task instances (4 weeks)
const FUTURE_DAYS = 28;

// Module-level guard prevents concurrent ensureRecurring runs (StrictMode, multi-mount, multi-tab races)
const ensureLocks = new Map<string, Promise<void>>();

// Decide whether a recurring parent should have an instance on a given date.
// Returns false for the parent's own original_date (parent occupies that slot itself).
function instanceMatchesRecurrence(parent: Task, dayISO: string): boolean {
  if (dayISO === parent.original_date) return false;
  if (parent.recurrence_until && dayISO > parent.recurrence_until) return false;
  const [sy, sm, sd] = (parent.original_date ?? parent.scheduled_date ?? "").split("-").map(Number);
  const startD = new Date(sy, sm - 1, sd);
  const [ty, tm, td] = dayISO.split("-").map(Number);
  const dayD = new Date(ty, tm - 1, td);
  if (dayD < startD) return false;
  const diffDays = Math.floor((dayD.getTime() - startD.getTime()) / 86400000);
  if (diffDays === 0) return false;

  if (parent.recurrence === "daily") return true;
  if (parent.recurrence === "weekdays") {
    const dow = dayD.getDay();
    return dow >= 1 && dow <= 5;
  }
  if (parent.recurrence === "weekly") return diffDays % 7 === 0;
  if (parent.recurrence === "monthly") return startD.getDate() === dayD.getDate();
  if (parent.recurrence === "yearly")
    return startD.getDate() === dayD.getDate() && startD.getMonth() === dayD.getMonth();
  if (parent.recurrence === "custom") {
    const interval = parent.recurrence_interval ?? 0;
    const weekdays = parent.recurrence_weekdays ?? [];
    const weekInterval = (parent as any).recurrence_week_interval as number | null ?? null;
    const monthlyPattern = (parent as any).recurrence_monthly_pattern as { week: number; weekday: number } | null ?? null;

    if (monthlyPattern && typeof monthlyPattern.week === "number" && typeof monthlyPattern.weekday === "number") {
      if (dayD.getDay() !== monthlyPattern.weekday) return false;
      if (monthlyPattern.week === -1) {
        const next = new Date(dayD.getFullYear(), dayD.getMonth(), dayD.getDate() + 7);
        return next.getMonth() !== dayD.getMonth();
      }
      const nth = Math.floor((dayD.getDate() - 1) / 7) + 1;
      return nth === monthlyPattern.week;
    }
    if (weekdays.length > 0) {
      const wInt = weekInterval && weekInterval > 0 ? weekInterval : 1;
      if (!weekdays.includes(dayD.getDay())) return false;
      if (wInt === 1) return true;
      const startMonday = new Date(startD);
      const sDow = (startMonday.getDay() + 6) % 7;
      startMonday.setDate(startMonday.getDate() - sDow);
      const dayMonday = new Date(dayD);
      const dDow = (dayMonday.getDay() + 6) % 7;
      dayMonday.setDate(dayMonday.getDate() - dDow);
      const weeksDiff = Math.round((dayMonday.getTime() - startMonday.getTime()) / (7 * 86400000));
      return weeksDiff >= 0 && weeksDiff % wInt === 0;
    }
    if (interval > 0) return diffDays % interval === 0;
  }
  return false;
}

// Evita repetir o trabalho de materializar recorrências a cada navegação
const ensureDoneAt = new Map<string, number>();
const ENSURE_TTL_MS = 5 * 60 * 1000;

// Sentinel for "top of that day": resolved on write from the cache or with one small read.
export const TOP_OF_DAY = -2147483648;

const EMPTY_TASKS: Task[] = [];

/** Dependency predecessors (or any task ids) outside the loaded window: id, title and completion only. */
export function useTaskLookup(ids: string[]) {
  const sorted = useMemo(() => Array.from(new Set(ids)).sort(), [ids]);
  const { data } = useQuery({
    queryKey: ["task-lookup", sorted],
    enabled: sorted.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const out: Array<Pick<Task, "id" | "title" | "completed">> = [];
      for (let i = 0; i < sorted.length; i += 200) {
        const { data: rows, error } = await supabase.from("tasks").select("id,title,completed").in("id", sorted.slice(i, i + 200));
        if (error) throw error;
        out.push(...((rows ?? []) as Array<Pick<Task, "id" | "title" | "completed">>));
      }
      return out;
    },
  });
  return useMemo(() => new Map((data ?? []).map((t) => [t.id, t])), [data]);
}

/**
 * Tasks of one screen window (see task-windows.ts). Without a window the hook only exposes
 * actions (quick add). Actions that need other rows (series, follow-ups, positions) read
 * exactly those rows on demand instead of holding the whole collection.
 */
export function useTasks(userId: string | undefined, window?: TaskWindow | null) {
  const qc = useQueryClient();
  const queryKey = window ? taskWindowKey(window) : (["tasks", "none"] as const);
  const query = useQuery({
    queryKey,
    queryFn: () => fetchTaskWindow(window as TaskWindow),
    enabled: !!userId && !!window,
    placeholderData: keepPreviousData,
  });
  const tasks = window ? query.data ?? EMPTY_TASKS : EMPTY_TASKS;
  const loading = !!window && query.isPending;

  const apply = useCallback((change: LiveTaskUpdate) => applyTaskUpdateToCaches(qc, change), [qc]);
  const patchLocal = useCallback((id: string, patch: Partial<Task>) => apply({ eventType: "UPDATE", new: { ...patch, id }, old: {} }), [apply]);
  const removeLocal = useCallback((id: string) => apply({ eventType: "DELETE", new: {}, old: { id } }), [apply]);
  const insertLocal = useCallback((row: Task) => apply({ eventType: "INSERT", new: row, old: {} }), [apply]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    await qc.invalidateQueries({ queryKey: TASKS_ROOT_KEY });
  }, [qc, userId]);

  /** Cached row, else one read by id. */
  const getTask = useCallback(async (id: string): Promise<Task | undefined> => {
    const cached = findCachedTask(qc, id);
    if (cached) return cached;
    const { data } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
    return (data as Task | null) ?? undefined;
  }, [qc]);

  const getTasks = useCallback(async (ids: string[]): Promise<Task[]> => {
    const found = new Map<string, Task>();
    const missing: string[] = [];
    for (const id of ids) {
      const cached = findCachedTask(qc, id);
      if (cached) found.set(id, cached); else missing.push(id);
    }
    for (let i = 0; i < missing.length; i += 200) {
      const { data } = await supabase.from("tasks").select("*").in("id", missing.slice(i, i + 200));
      for (const row of (data ?? []) as Task[]) found.set(row.id, row);
    }
    return ids.flatMap((id) => (found.has(id) ? [found.get(id)!] : []));
  }, [qc]);

  const resolvePosition = useCallback(
    (date: string | null | undefined, position: number | null | undefined) =>
      position === TOP_OF_DAY ? topPositionFor(qc, date ?? null) : Promise.resolve(position ?? undefined),
    [qc],
  );

  // Generate recurring task instances from today through FUTURE_DAYS ahead
  const ensureRecurring = useCallback(async () => {
    if (!userId) return;
    // Reuse in-flight promise if any (prevents duplicate inserts from StrictMode/multi-mount)
    const existingLock = ensureLocks.get(userId);
    if (existingLock) return existingLock;

    const run = (async () => {
      const today = todayISO();

      // STEP 0 — Auto-cleanup zombie instances:
      // Future open children whose parent is completed, deleted, or whose
      // recurrence_until has passed should not exist. They get re-introduced
      // by older code paths or by manual edits to the parent. Sweep them out
      // before materializing anything new.
      const { data: openFuture } = await supabase
        .from("tasks")
        .select("id, recurrence_parent_id, scheduled_date")
        .eq("user_id", userId)
        .eq("completed", false)
        .gte("scheduled_date", today)
        .not("recurrence_parent_id", "is", null);
      if (openFuture && openFuture.length > 0) {
        const parentIdsAll = Array.from(
          new Set(openFuture.map((c) => c.recurrence_parent_id as string)),
        );
        const { data: parentRows } = await supabase
          .from("tasks")
          .select("id, completed, recurrence, recurrence_until")
          .in("id", parentIdsAll);
        const parentMap = new Map((parentRows ?? []).map((p) => [p.id as string, p]));
        const orphanIds: string[] = [];
        for (const c of openFuture) {
          const p = parentMap.get(c.recurrence_parent_id as string);
          // Parent missing, completed, no longer recurring, or recurrence ended
          if (!p) { orphanIds.push(c.id as string); continue; }
          // NOTE: parent.completed=true is normal — it just means the user finished
          // the seed-day instance. Future occurrences should still be generated.
          if ((p as { recurrence?: string }).recurrence === "none") { orphanIds.push(c.id as string); continue; }
          const until = (p as { recurrence_until?: string | null }).recurrence_until;
          if (until && (c.scheduled_date as string) > until) { orphanIds.push(c.id as string); continue; }
        }
        if (orphanIds.length > 0) {
          await supabase.from("tasks").delete().in("id", orphanIds);
        }
      }

      // Materialize from ALL recurring seeds, even ones whose own seed-day instance
      // was completed (that's normal — the recurrence must continue).
      const { data: parents } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", userId)
        .neq("recurrence", "none")
        .is("recurrence_parent_id", null);

      if (!parents || parents.length === 0) return;

      const parentIds = parents.map((p) => p.id);
      const windowEnd = addDays(today, FUTURE_DAYS);
      const { data: existing } = await supabase
        .from("tasks")
        .select("recurrence_parent_id, scheduled_date")
        .in("recurrence_parent_id", parentIds)
        .gte("scheduled_date", today)
        .lte("scheduled_date", windowEnd);
      const { data: exceptions } = await supabase
        .from("task_recurrence_exceptions")
        .select("parent_task_id, exception_date, kind")
        .eq("user_id", userId)
        .in("parent_task_id", parentIds)
        .gte("exception_date", today)
        .lte("exception_date", windowEnd);
      const existingSet = new Set(
        (existing ?? []).map((e) => `${e.recurrence_parent_id}__${e.scheduled_date}`)
      );
      const exceptionSet = new Set(
        ((exceptions ?? []) as Pick<TaskRecurrenceException, "parent_task_id" | "exception_date" | "kind">[])
          .filter((e) => e.kind === "deleted")
          .map((e) => `${e.parent_task_id}__${e.exception_date}`)
      );

      const inserts: TablesInsert<"tasks">[] = [];

      for (const p of parents) {
        const [sy, sm, sd] = (p.original_date ?? p.scheduled_date ?? "").split("-").map(Number);
        const startD = new Date(sy, sm - 1, sd);

        for (let i = 0; i <= FUTURE_DAYS; i++) {
          const dayISO = addDays(today, i);
          if (dayISO === p.original_date) continue;
          if (existingSet.has(`${p.id}__${dayISO}`)) continue;
          if (exceptionSet.has(`${p.id}__${dayISO}`)) continue;

          const [ty, tm, td] = dayISO.split("-").map(Number);
          const dayD = new Date(ty, tm - 1, td);
          if (dayD < startD) continue;
          const diffDays = Math.floor((dayD.getTime() - startD.getTime()) / 86400000);
          if (diffDays === 0) continue;

          let matches = false;
          if (p.recurrence === "daily") matches = true;
          else if (p.recurrence === "weekdays") {
            const dow = dayD.getDay();
            matches = dow >= 1 && dow <= 5;
          }
          else if (p.recurrence === "weekly") matches = diffDays % 7 === 0;
          else if (p.recurrence === "monthly") matches = startD.getDate() === dayD.getDate();
          else if (p.recurrence === "yearly")
            matches = startD.getDate() === dayD.getDate() && startD.getMonth() === dayD.getMonth();
          else if (p.recurrence === "custom") {
            const interval = p.recurrence_interval ?? 0;
            const weekdays = p.recurrence_weekdays ?? [];
            const weekInterval = (p as any).recurrence_week_interval as number | null ?? null;
            const monthlyPattern = (p as any).recurrence_monthly_pattern as { week: number; weekday: number } | null ?? null;

            if (monthlyPattern && typeof monthlyPattern.week === "number" && typeof monthlyPattern.weekday === "number") {
              // e.g. first Monday of the month, last Friday
              if (dayD.getDay() === monthlyPattern.weekday) {
                if (monthlyPattern.week === -1) {
                  // last weekday of the month
                  const next = new Date(dayD.getFullYear(), dayD.getMonth(), dayD.getDate() + 7);
                  matches = next.getMonth() !== dayD.getMonth();
                } else {
                  const nth = Math.floor((dayD.getDate() - 1) / 7) + 1;
                  matches = nth === monthlyPattern.week;
                }
              }
            } else if (weekdays.length > 0) {
              const wInt = weekInterval && weekInterval > 0 ? weekInterval : 1;
              if (weekdays.includes(dayD.getDay())) {
                if (wInt === 1) matches = true;
                else {
                  // weeks since the parent's start, Monday-based
                  const startMonday = new Date(startD);
                  const sDow = (startMonday.getDay() + 6) % 7; // 0 = Mon
                  startMonday.setDate(startMonday.getDate() - sDow);
                  const dayMonday = new Date(dayD);
                  const dDow = (dayMonday.getDay() + 6) % 7;
                  dayMonday.setDate(dayMonday.getDate() - dDow);
                  const weeksDiff = Math.round((dayMonday.getTime() - startMonday.getTime()) / (7 * 86400000));
                  matches = weeksDiff >= 0 && weeksDiff % wInt === 0;
                }
              }
            } else if (interval > 0) matches = diffDays % interval === 0;
          }

          if (!matches) continue;

          inserts.push({
            user_id: userId,
            title: p.title,
            description: p.description,
            category: p.category,
            role_id: p.role_id,
            project_id: p.project_id,
            assignee_id: p.assignee_id ?? null,
            non_negotiable: p.non_negotiable,
            scheduled_date: dayISO,
            original_date: dayISO,
            duration_minutes: p.duration_minutes,
            recurrence: "none",
            recurrence_parent_id: p.id,
            position: 999,
          });

          // Track locally so duplicates within this batch are also prevented
          existingSet.add(`${p.id}__${dayISO}`);
        }
      }

      if (inserts.length > 0) {
        // Upsert with onConflict — if another process inserted concurrently, the unique
        // constraint (recurrence_parent_id, scheduled_date) makes this a no-op for that row.
        await supabase
          .from("tasks")
          .upsert(inserts, {
            onConflict: "recurrence_parent_id,scheduled_date",
            ignoreDuplicates: true,
          });
      }
    })().finally(() => {
      ensureLocks.delete(userId);
    });

    ensureLocks.set(userId, run);
    return run;
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    void (async () => {
      // Materializa recorrências em segundo plano (no máximo 1x a cada 5 min)
      const last = ensureDoneAt.get(userId) ?? 0;
      if (Date.now() - last < ENSURE_TTL_MS) return;
      ensureDoneAt.set(userId, Date.now());
      await ensureRecurring();
      await refresh();
    })();
  }, [userId, refresh, ensureRecurring]);

  // Lets the live feed ignore deletes/comments of tasks no screen has loaded.
  const [loadedOwner] = useState(() => Symbol("useTasks"));
  useEffect(() => {
    setLoadedTaskIds(loadedOwner, new Set(tasks.map(t => t.id)));
  }, [loadedOwner, tasks]);
  useEffect(() => () => setLoadedTaskIds(loadedOwner, null), [loadedOwner]);

  // Hoje: the neighbour days are read ahead so moving between days is instant.
  useEffect(() => {
    if (!userId || window?.kind !== "day") return;
    for (const offset of [-1, 1]) {
      const neighbour: TaskWindow = { kind: "day", date: addDays(window.date, offset) };
      void qc.prefetchQuery({ queryKey: taskWindowKey(neighbour), queryFn: () => fetchTaskWindow(neighbour) });
    }
  }, [qc, userId, window?.kind, window?.kind === "day" ? window.date : null]);

  const createTask = async (data: Omit<TablesInsert<"tasks">, "user_id">) => {
    if (!userId) return;
    // Por padrão a tarefa fica com quem criou; null explícito = sem responsável.
    const position = await resolvePosition(data.scheduled_date, data.position);
    const payload = { ...data, ...(position == null ? {} : { position }), user_id: userId, assignee_id: data.assignee_id === undefined ? userId : data.assignee_id };
    const { data: inserted, error } = await supabase
      .from("tasks")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    if (inserted) {
      insertLocal(inserted as Task);
      // Tarefa já criada delegada: dispara os avisos externos na hora
      if (inserted.assignee_id && inserted.assignee_id !== inserted.user_id) {
        import("@/lib/notifications.functions")
          .then((m) => m.flushNotificationDelivery())
          .catch(() => {});
      }
      // If it's a recurring parent, materialize future instances
      if (inserted.recurrence !== "none" && !inserted.recurrence_parent_id) {
        ensureRecurring().then(refresh);
      }
    }
    return inserted ?? null;
  };

  const updateTask = async (id: string, patch: Partial<Task>) => {
    rememberOptimisticTask(id, patch);
    // Optimistic update
    const target = findCachedTask(qc, id);
    patchLocal(id, patch);
    const { data: saved, error } = await supabase.from("tasks").update(patch).eq("id", id).select().single();
    if (error) {
      forgetOptimisticTask(id);
      if (target) apply({ eventType: "UPDATE", new: target, old: {} });
      else void refresh();
      throw error;
    }
    if (saved) {
      apply({ eventType: "UPDATE", new: saved as Task, old: target ?? {} });
      globalThis.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT, { detail: { eventType: "UPDATE", new: saved, old: target ?? {} } }));
    }
    // Considera o responsável DEPOIS do patch: uma delegação feita agora também avisa.
    const nextAssignee =
      patch.assignee_id !== undefined ? patch.assignee_id : (saved as Task | null)?.assignee_id ?? target?.assignee_id ?? null;
    const owner = patch.user_id ?? (saved as Task | null)?.user_id ?? target?.user_id ?? null;
    if (nextAssignee && nextAssignee !== owner) {
      import("@/lib/notifications.functions")
        .then((m) => m.flushNotificationDelivery())
        .catch(() => {});
    }
  };

  const deleteTask = async (id: string) => {
    removeLocal(id);
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) throw error;
  };

  const createRecurrenceException = async (parentId: string, date: string) => {
    if (!userId) return;
    const { error } = await supabase.from("task_recurrence_exceptions").upsert(
      {
        user_id: userId,
        parent_task_id: parentId,
        exception_date: date,
        kind: "deleted",
      },
      {
        onConflict: "user_id,parent_task_id,exception_date,kind",
        ignoreDuplicates: true,
      }
    );
    if (error) throw error;
  };

  const buildDetachedRecurringPatch = (task: Task, patch: Partial<Task>): Partial<Task> => {
    const nextDate = patch.scheduled_date ?? task.scheduled_date;
    return {
      ...patch,
      scheduled_date: nextDate,
      original_date: patch.original_date ?? nextDate,
      recurrence: "none",
      recurrence_parent_id: null,
      recurrence_interval: null,
      recurrence_weekdays: null,
      recurrence_week_interval: null,
      recurrence_monthly_pattern: null,
    };
  };

  const findNextOccurrenceDate = (parent: Task, afterDate: string) => {
    for (let i = 1; i <= 730; i++) {
      const candidate = addDays(afterDate, i);
      if (instanceMatchesRecurrence(parent, candidate)) return candidate;
    }
    return null;
  };

  // Scope-aware update/delete for recurring instances.
  // - "this": only the single row
  // - "future": this row and all sibling instances scheduled on/after its date (plus the parent if its original_date >= this date)
  // - "all": this row + all siblings + parent
  // The series (seed + every instance) is read on demand — not from the screen's window.
  const getRecurrenceFamily = async (task: Task) => {
    const parentId = task.recurrence_parent_id ?? task.id;
    const [{ data: parentRow }, instances] = await Promise.all([
      supabase.from("tasks").select("*").eq("id", parentId).maybeSingle(),
      fetchAllRows<Task>(() => supabase.from("tasks").select("*").eq("recurrence_parent_id", parentId).order("id") as never),
    ]);
    return { parent: (parentRow as Task | null) ?? undefined, parentId, instances };
  };

  // Patch keys that should NOT be propagated to siblings (per-instance only).
  const PER_INSTANCE_KEYS = new Set([
    "scheduled_date",
    "completed",
    "completed_at",
    "status",
    "time_spent_seconds",
    "position",
    "original_date",
  ]);

  const RECURRENCE_RULE_KEYS = new Set([
    "recurrence",
    "recurrence_interval",
    "recurrence_weekdays",
    "recurrence_week_interval",
    "recurrence_monthly_pattern",
  ]);

  const stripKeys = (patch: Partial<Task>, keys: Set<string>): Partial<Task> => {
    const out: Partial<Task> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (!keys.has(k)) (out as any)[k] = v;
    }
    return out;
  };

  const updateTaskWithScope = async (
    task: Task,
    patch: Partial<Task>,
    scope: "this" | "future" | "all" = "this"
  ) => {
    // Instances (children) never carry the recurrence rule — it lives on the seed.
    // Without this guard, saving an instance would write recurrence:"none" onto the
    // series and wipe every future occurrence.
    const isChild = !!task.recurrence_parent_id;
    const ownPatch = isChild ? stripKeys(patch, RECURRENCE_RULE_KEYS) : patch;

    if (scope === "this") {
      if (
        isChild &&
        patch.scheduled_date !== undefined &&
        patch.scheduled_date !== task.scheduled_date
      ) {
        await createRecurrenceException(task.recurrence_parent_id!, task.scheduled_date ?? "");
        await updateTask(task.id, buildDetachedRecurringPatch(task, ownPatch));
        return;
      }
      await updateTask(task.id, ownPatch);
      return;
    }
    // Strip per-instance fields from the propagated patch
    const seriesPatch = stripKeys(patch, PER_INSTANCE_KEYS);
    // Children must keep recurrence:"none"; only the seed holds the rule.
    const childPatch = stripKeys(seriesPatch, RECURRENCE_RULE_KEYS);
    // Rule keys reach the seed when editing the seed itself, or when editing an
    // instance with a series-wide scope ("future"/"all") — the rule lives on the seed.
    const rulePatch: Partial<Task> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (RECURRENCE_RULE_KEYS.has(k)) (rulePatch as any)[k] = v;
    }
    const parentPatch = isChild ? { ...childPatch, ...rulePatch } : seriesPatch;
    // Always also apply full patch to the originating row (so its date/etc. update too)
    await updateTask(task.id, ownPatch);


    const { parent, parentId, instances } = await getRecurrenceFamily(task);
    const baseDate = task.scheduled_date ?? todayISO();

    if (Object.keys(seriesPatch).length > 0) {
      const targets: Task[] = [];
      let parentTarget: Task | null = null;
      if (scope === "all") {
        if (parent && parent.id !== task.id) parentTarget = parent;
        for (const t of instances) {
          if (t.id !== task.id) targets.push(t);
        }
      } else {
        // future: open instances on/after baseDate (not completed) + parent if its original_date >= baseDate
        if (parent && parent.id !== task.id && (parent.original_date ?? "") >= baseDate && !parent.completed) {
          parentTarget = parent;
        }
        for (const t of instances) {
          if (t.id === task.id) continue;
          if (t.completed) continue;
          if ((t.scheduled_date ?? "") >= baseDate) targets.push(t);
        }
      }
      if (targets.length > 0 && Object.keys(childPatch).length > 0) {
        for (const t of targets) patchLocal(t.id, childPatch);
        const ids = targets.map((t) => t.id);
        await supabase.from("tasks").update(childPatch).in("id", ids);
      }
      if (parentTarget && Object.keys(parentPatch).length > 0) {
        const pid = parentTarget.id;
        patchLocal(pid, parentPatch);
        await supabase.from("tasks").update(parentPatch).eq("id", pid);
      } else if (isChild && Object.keys(rulePatch).length > 0) {
        // The seed wasn't in the propagation targets (past/completed), but the rule
        // change must still land on it — it's the only row that holds the rule.
        patchLocal(parentId, rulePatch);
        await supabase.from("tasks").update(rulePatch).eq("id", parentId);
      }
    }

    // If recurrence rule changed, prune future open instances that no longer match
    // and let ensureRecurring create any newly-required instances.
    const ruleChanged =
      (!isChild || Object.keys(rulePatch).length > 0) &&
      Object.keys(patch).some((k) => RECURRENCE_RULE_KEYS.has(k));

    if (ruleChanged) {
      const today = todayISO();
      const cutoff = baseDate > today ? baseDate : today;
      // Re-fetch fresh state from DB to get the updated parent
      const { data: freshParent } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", parentId)
        .single();
      if (freshParent) {
        const { data: futureInstances } = await supabase
          .from("tasks")
          .select("*")
          .eq("recurrence_parent_id", parentId)
          .gte("scheduled_date", cutoff)
          .eq("completed", false);
        const idsToDelete: string[] = [];
        for (const inst of futureInstances ?? []) {
          if (!instanceMatchesRecurrence(freshParent as Task, inst.scheduled_date ?? "")) {
            idsToDelete.push(inst.id);
          }
        }
        if (idsToDelete.length > 0) {
          idsToDelete.forEach(removeLocal);
          await supabase.from("tasks").delete().in("id", idsToDelete);
        }
      }
      // Materialize any new instances that should now exist
      await ensureRecurring();
      await refresh();
    }
    void parentId;
  };

  const deleteTaskWithScope = async (task: Task, scope: "this" | "future" | "all" = "this") => {
    if (scope === "this") {
      if (task.recurrence_parent_id) {
        await createRecurrenceException(task.recurrence_parent_id, task.scheduled_date ?? "");
        await deleteTask(task.id);
        return;
      }
      if (task.recurrence !== "none") {
        const nextDate = findNextOccurrenceDate(task, task.scheduled_date ?? "");
        if (!nextDate) {
          await deleteTask(task.id);
          return;
        }
        const { data: nextInstance } = await supabase
          .from("tasks")
          .select("id")
          .eq("recurrence_parent_id", task.id)
          .eq("scheduled_date", nextDate)
          .maybeSingle();
        if (nextInstance) removeLocal(nextInstance.id);
        patchLocal(task.id, { scheduled_date: nextDate, original_date: nextDate });
        if (nextInstance) {
          const { error: deleteNextError } = await supabase.from("tasks").delete().eq("id", nextInstance.id);
          if (deleteNextError) throw deleteNextError;
        }
        const { error: updateParentError } = await supabase
          .from("tasks")
          .update({ scheduled_date: nextDate, original_date: nextDate })
          .eq("id", task.id);
        if (updateParentError) throw updateParentError;
        return;
      }
      await deleteTask(task.id);
      return;
    }
    const { parent, parentId, instances } = await getRecurrenceFamily(task);
    const baseDate = task.scheduled_date ?? todayISO();
    const idsToDelete = new Set<string>([task.id]);
    if (scope === "all") {
      if (parent) idsToDelete.add(parent.id);
      instances.forEach((t) => idsToDelete.add(t.id));
    } else {
      // future
      if (parent && (parent.id === task.id || (!parent.completed && (parent.scheduled_date ?? "") >= baseDate))) {
        // The seed row is itself an occurrence — if it falls on/after the cut date it
        // must go too, otherwise it stays visible after "excluir daqui em diante".
        idsToDelete.add(parent.id);
      }
      for (const t of instances) {
        if (t.completed) continue;
        if ((t.scheduled_date ?? "") >= baseDate) idsToDelete.add(t.id);
      }
    }

    const ids = Array.from(idsToDelete);
    idsToDelete.forEach(removeLocal);
    if (scope === "future") {
      if (parent && !idsToDelete.has(parent.id)) {
        const until = addDays(baseDate, -1);
        patchLocal(parent.id, { recurrence_until: until });
        const { error } = await supabase.from("tasks").update({ recurrence_until: until }).eq("id", parent.id);
        if (error) throw error;
      }
    }
    if (ids.length > 0) {
      const { error } = await supabase.from("tasks").delete().in("id", ids);
      if (error) throw error;
    }
    void parentId;
  };

  const toggleComplete = async (t: Task) => {
    const next = !t.completed;
    await updateTask(t.id, {
      completed: next,
      completed_at: next ? new Date().toISOString() : null,
      status: next ? "done" : "todo",
    });
    // If linked to a Pipedrive activity, mirror the completion state in Pipedrive.
    if (t.origin_source === "pipedrive" && t.origin_source_url) {
      void syncTaskCompletionToPipedrive({ data: { task_id: t.id, done: next } }).catch(
        (e) => console.error("pipedrive sync", e),
      );
    }
  };

  const setStatus = async (id: string, status: TaskStatus) => {
    const patch: Partial<Task> = { status };
    if (status === "done") {
      patch.completed = true;
      patch.completed_at = new Date().toISOString();
    } else {
      patch.completed = false;
      patch.completed_at = null;
    }
    await updateTask(id, patch);
  };

  const reorderInDay = async (date: string, orderedIds: string[]) => {
    const current = new Map((await getTasks(orderedIds)).map((t) => [t.id, t]));
    for (const id of orderedIds) {
      if (current.get(id)?.scheduled_date !== date && !(await confirmDependencyMove(id, date))) return;
    }
    orderedIds.forEach((id, idx) => patchLocal(id, { position: idx, scheduled_date: date }));
    await Promise.all(
      orderedIds.map((id, idx) =>
        supabase.from("tasks").update({ position: idx, scheduled_date: date }).eq("id", id)
      )
    );
  };

  const moveTaskToDay = async (taskId: string, date: string, requestedPosition = 0) => {
    const task = await getTask(taskId);
    if (task?.scheduled_date !== date && !(await confirmDependencyMove(taskId, date))) return;
    const position = (await resolvePosition(date, requestedPosition)) ?? 0;
    if (task?.recurrence_parent_id && task.scheduled_date !== date) {
      await createRecurrenceException(task.recurrence_parent_id, task.scheduled_date ?? "");
      await updateTask(taskId, {
        ...buildDetachedRecurringPatch(task, { scheduled_date: date, position }),
        position,
      });
      return;
    }
    patchLocal(taskId, { scheduled_date: date, position });
    await supabase.from("tasks").update({ scheduled_date: date, position }).eq("id", taskId);
  };

  // Move several tasks to a target date in one batch.
  // Each task gets a unique position so the relative order is preserved.
  const bulkMoveToDay = async (taskIds: string[], date: string) => {
    if (taskIds.length === 0) return;
    const basePos = await topPositionFor(qc, date);
    for (const [idx, id] of taskIds.entries()) {
      await moveTaskToDay(id, date, basePos - idx);
    }
  };

  const bulkDelete = async (taskIds: string[]) => {
    if (taskIds.length === 0) return;
    for (const task of await getTasks(taskIds)) {
      if (task.recurrence_parent_id || task.recurrence !== "none") {
        await deleteTaskWithScope(task, "this");
      } else {
        await deleteTask(task.id);
      }
    }
  };

  const bulkAssignProject = async (taskIds: string[], projectId: string | null) => {
    if (taskIds.length === 0) return;
    taskIds.forEach((id) => patchLocal(id, { project_id: projectId }));
    await supabase.from("tasks").update({ project_id: projectId }).in("id", taskIds);
  };

  const bulkAssignRole = async (taskIds: string[], roleId: string | null) => {
    if (taskIds.length === 0) return;
    taskIds.forEach((id) => patchLocal(id, { role_id: roleId }));
    await supabase.from("tasks").update({ role_id: roleId }).in("id", taskIds);
  };

  const addTimeSpent = async (id: string, secondsToAdd: number) => {
    if (secondsToAdd <= 0) return;
    const current = await getTask(id);
    const next = (current?.time_spent_seconds ?? 0) + secondsToAdd;
    await updateTask(id, { time_spent_seconds: next });
  };

  // Duplicate a task to a target date (creates a fresh row, no recurrence link)
  const duplicateTask = async (task: Task, targetDate: string) => {
    if (!userId) return;
    const payload: TablesInsert<"tasks"> = {
      user_id: userId,
      assignee_id: task.assignee_id ?? null,
      title: task.title,
      description: task.description,
      category: task.category,
      role_id: task.role_id,
      scheduled_date: targetDate,
      original_date: targetDate,
      duration_minutes: task.duration_minutes,
      recurrence: "none",
      position: await topPositionFor(qc, targetDate),
    };
    const { data, error } = await supabase.from("tasks").insert(payload).select().single();
    if (error) throw error;
    if (data) insertLocal(data as Task);
    return data;
  };

  // Create a follow-up: new task linked via followup_chain_id, original is marked done
  const createFollowUp = async (task: Task, targetDate: string) => {
    if (!userId) return;
    const chainId = task.followup_chain_id ?? task.id;
    // Find max followup_count across the chain (including the originating task)
    const { data: chainRows } = await supabase
      .from("tasks")
      .select("id,followup_count")
      .or(`followup_chain_id.eq.${chainId},id.eq.${chainId}`);
    const chainMembers = (chainRows ?? []) as Array<Pick<Task, "id" | "followup_count">>;
    const maxCount = chainMembers.reduce((m, t) => Math.max(m, t.followup_count ?? 0), 0);
    // The original (root) is #1; each follow-up increments
    const originalCount = maxCount === 0 ? 1 : maxCount;
    const nextCount = originalCount + 1;

    // Backfill chain on the original if it wasn't part of one yet
    if (!task.followup_chain_id) {
      await updateTask(task.id, { followup_chain_id: chainId, followup_count: 1 });
    }

    const payload: TablesInsert<"tasks"> = {
      user_id: userId,
      assignee_id: task.assignee_id ?? null,
      title: task.title,
      description: task.description,
      category: task.category,
      role_id: task.role_id,
      scheduled_date: targetDate,
      original_date: targetDate,
      duration_minutes: task.duration_minutes,
      recurrence: "none",
      followup_chain_id: chainId,
      followup_count: nextCount,
      position: await topPositionFor(qc, targetDate),
    };
    const { data, error } = await supabase.from("tasks").insert(payload).select().single();
    if (error) throw error;
    if (data) insertLocal(data as Task);

    // Mark original as completed
    await updateTask(task.id, {
      completed: true,
      completed_at: new Date().toISOString(),
      status: "done",
    });
    return data;
  };

  // Overdue = scheduled_date < today AND not completed
  const todayStr = todayISO();
  // Backlog (no date) and blocked tasks never count as overdue.
  const overdueTasks = useMemo(() => tasks.filter(
    (t) => !t.completed && !!t.scheduled_date && t.scheduled_date < todayStr && t.status !== "blocked",
  ), [tasks, todayStr]);
  const backlogTasks = useMemo(() => tasks.filter((t) => !t.scheduled_date && !t.completed), [tasks]);
  const todayTasks = useMemo(() => tasks.filter((t) => t.scheduled_date === todayStr), [tasks, todayStr]);
  const tomorrowStr = addDays(todayStr, 1);
  const tomorrowTasks = useMemo(() => tasks.filter((t) => t.scheduled_date === tomorrowStr), [tasks, tomorrowStr]);

  const tasksByDay = (date: string) => tasks.filter((t) => t.scheduled_date === date);

  // Position helper to insert a new task at the TOP of a given day
  // Exact when a cached window holds the whole date; otherwise TOP_OF_DAY, resolved on write.
  const topPositionForDay = (date: string | null) => {
    const dayList = cachedTasksForDate(qc, date);
    if (!dayList) return TOP_OF_DAY;
    if (dayList.length === 0) return 0;
    return Math.min(...dayList.map((t) => t.position ?? 0)) - 1;
  };

  const currentApi = {
    tasks,
    loading,
    overdueTasks,
    backlogTasks,
    todayTasks,
    tomorrowTasks,
    tasksByDay,
    topPositionForDay,
    createTask,
    updateTask,
    deleteTask,
    updateTaskWithScope,
    deleteTaskWithScope,
    toggleComplete,
    setStatus,
    reorderInDay,
    moveTaskToDay,
    bulkMoveToDay,
    bulkDelete,
    bulkAssignProject,
    bulkAssignRole,
    addTimeSpent,
    duplicateTask,
    createFollowUp,
    refresh,
  };
  const apiRef = useRef(currentApi);
  apiRef.current = currentApi;
  const actions = useMemo(() => ({
    tasksByDay: (...args: Parameters<typeof tasksByDay>) => apiRef.current.tasksByDay(...args),
    topPositionForDay: (...args: Parameters<typeof topPositionForDay>) => apiRef.current.topPositionForDay(...args),
    createTask: (...args: Parameters<typeof createTask>) => apiRef.current.createTask(...args),
    updateTask: (...args: Parameters<typeof updateTask>) => apiRef.current.updateTask(...args),
    deleteTask: (...args: Parameters<typeof deleteTask>) => apiRef.current.deleteTask(...args),
    updateTaskWithScope: (...args: Parameters<typeof updateTaskWithScope>) => apiRef.current.updateTaskWithScope(...args),
    deleteTaskWithScope: (...args: Parameters<typeof deleteTaskWithScope>) => apiRef.current.deleteTaskWithScope(...args),
    toggleComplete: (...args: Parameters<typeof toggleComplete>) => apiRef.current.toggleComplete(...args),
    setStatus: (...args: Parameters<typeof setStatus>) => apiRef.current.setStatus(...args),
    reorderInDay: (...args: Parameters<typeof reorderInDay>) => apiRef.current.reorderInDay(...args),
    moveTaskToDay: (...args: Parameters<typeof moveTaskToDay>) => apiRef.current.moveTaskToDay(...args),
    bulkMoveToDay: (...args: Parameters<typeof bulkMoveToDay>) => apiRef.current.bulkMoveToDay(...args),
    bulkDelete: (...args: Parameters<typeof bulkDelete>) => apiRef.current.bulkDelete(...args),
    bulkAssignProject: (...args: Parameters<typeof bulkAssignProject>) => apiRef.current.bulkAssignProject(...args),
    bulkAssignRole: (...args: Parameters<typeof bulkAssignRole>) => apiRef.current.bulkAssignRole(...args),
    addTimeSpent: (...args: Parameters<typeof addTimeSpent>) => apiRef.current.addTimeSpent(...args),
    duplicateTask: (...args: Parameters<typeof duplicateTask>) => apiRef.current.duplicateTask(...args),
    createFollowUp: (...args: Parameters<typeof createFollowUp>) => apiRef.current.createFollowUp(...args),
    refresh: (...args: Parameters<typeof refresh>) => apiRef.current.refresh(...args),
  }), []);
  return useMemo(() => ({ tasks, loading, overdueTasks, backlogTasks, todayTasks, tomorrowTasks, ...actions }), [tasks, loading, overdueTasks, backlogTasks, todayTasks, tomorrowTasks, actions]);
}
