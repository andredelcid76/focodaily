import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { todayISO, addDays } from "@/lib/date";

export type Task = Tables<"tasks">;
export type TaskCategory = Task["category"];
export type TaskRecurrence = Task["recurrence"];
export type TaskStatus = Task["status"];

// How many days ahead we materialize recurring task instances
const FUTURE_DAYS = 14;

// Module-level guard prevents concurrent ensureRecurring runs (StrictMode, multi-mount, multi-tab races)
const ensureLocks = new Map<string, Promise<void>>();

// Decide whether a recurring parent should have an instance on a given date.
// Returns false for the parent's own original_date (parent occupies that slot itself).
function instanceMatchesRecurrence(parent: Task, dayISO: string): boolean {
  if (dayISO === parent.original_date) return false;
  const [sy, sm, sd] = parent.original_date.split("-").map(Number);
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

export function useTasks(userId: string | undefined) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .order("scheduled_date", { ascending: true })
      .order("position", { ascending: true });
    if (!error && data) setTasks(data);
    setLoading(false);
  }, [userId]);

  // Generate recurring task instances from today through FUTURE_DAYS ahead
  const ensureRecurring = useCallback(async () => {
    if (!userId) return;
    // Reuse in-flight promise if any (prevents duplicate inserts from StrictMode/multi-mount)
    const existingLock = ensureLocks.get(userId);
    if (existingLock) return existingLock;

    const run = (async () => {
      const today = todayISO();
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
      const existingSet = new Set(
        (existing ?? []).map((e) => `${e.recurrence_parent_id}__${e.scheduled_date}`)
      );

      const inserts: TablesInsert<"tasks">[] = [];

      for (const p of parents) {
        const [sy, sm, sd] = p.original_date.split("-").map(Number);
        const startD = new Date(sy, sm - 1, sd);

        for (let i = 0; i <= FUTURE_DAYS; i++) {
          const dayISO = addDays(today, i);
          if (dayISO === p.original_date) continue;
          if (existingSet.has(`${p.id}__${dayISO}`)) continue;

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
    (async () => {
      await ensureRecurring();
      await refresh();
    })();

    const channel = supabase
      .channel(`tasks-rt-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${userId}` },
        (payload) => {
          setTasks((prev) => {
            if (payload.eventType === "INSERT") {
              const row = payload.new as Task;
              if (prev.some((t) => t.id === row.id)) return prev;
              return [...prev, row];
            }
            if (payload.eventType === "UPDATE") {
              const row = payload.new as Task;
              return prev.map((t) => (t.id === row.id ? row : t));
            }
            if (payload.eventType === "DELETE") {
              const row = payload.old as Task;
              return prev.filter((t) => t.id !== row.id);
            }
            return prev;
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refresh, ensureRecurring]);

  const createTask = async (data: Omit<TablesInsert<"tasks">, "user_id">) => {
    if (!userId) return;
    const { data: inserted, error } = await supabase
      .from("tasks")
      .insert({ ...data, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    if (inserted) {
      setTasks((prev) => (prev.some((t) => t.id === inserted.id) ? prev : [...prev, inserted]));
      // If it's a recurring parent, materialize future instances
      if (inserted.recurrence !== "none" && !inserted.recurrence_parent_id) {
        ensureRecurring().then(refresh);
      }
    }
  };

  const updateTask = async (id: string, patch: Partial<Task>) => {
    // Optimistic update
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const { error } = await supabase.from("tasks").update(patch).eq("id", id);
    if (error) throw error;
  };

  const deleteTask = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) throw error;
  };

  // Scope-aware update/delete for recurring instances.
  // - "this": only the single row
  // - "future": this row and all sibling instances scheduled on/after its date (plus the parent if its original_date >= this date)
  // - "all": this row + all siblings + parent
  const getRecurrenceFamily = (task: Task) => {
    const parentId = task.recurrence_parent_id ?? task.id;
    const parent = tasks.find((t) => t.id === parentId);
    const instances = tasks.filter((t) => t.recurrence_parent_id === parentId);
    return { parent, parentId, instances };
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

  const updateTaskWithScope = async (
    task: Task,
    patch: Partial<Task>,
    scope: "this" | "future" | "all" = "this"
  ) => {
    if (scope === "this") {
      await updateTask(task.id, patch);
      return;
    }
    // Strip per-instance fields from the propagated patch
    const seriesPatch: Partial<Task> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (!PER_INSTANCE_KEYS.has(k)) (seriesPatch as any)[k] = v;
    }
    // Always also apply full patch to the originating row (so its date/etc. update too)
    await updateTask(task.id, patch);

    const { parent, parentId, instances } = getRecurrenceFamily(task);
    const baseDate = task.scheduled_date;

    if (Object.keys(seriesPatch).length > 0) {
      const targets: Task[] = [];
      if (scope === "all") {
        if (parent && parent.id !== task.id) targets.push(parent);
        for (const t of instances) {
          if (t.id !== task.id) targets.push(t);
        }
      } else {
        // future: open instances on/after baseDate (not completed) + parent if its original_date >= baseDate
        if (parent && parent.id !== task.id && parent.original_date >= baseDate && !parent.completed) {
          targets.push(parent);
        }
        for (const t of instances) {
          if (t.id === task.id) continue;
          if (t.completed) continue;
          if (t.scheduled_date >= baseDate) targets.push(t);
        }
      }
      if (targets.length > 0) {
        setTasks((prev) => prev.map((t) => (targets.find((x) => x.id === t.id) ? { ...t, ...seriesPatch } : t)));
        const ids = targets.map((t) => t.id);
        await supabase.from("tasks").update(seriesPatch).in("id", ids);
      }
    }

    // If recurrence rule changed, prune future open instances that no longer match
    // and let ensureRecurring create any newly-required instances.
    const ruleChanged = Object.keys(patch).some((k) => RECURRENCE_RULE_KEYS.has(k));
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
          if (!instanceMatchesRecurrence(freshParent as Task, inst.scheduled_date)) {
            idsToDelete.push(inst.id);
          }
        }
        if (idsToDelete.length > 0) {
          setTasks((prev) => prev.filter((t) => !idsToDelete.includes(t.id)));
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
      await deleteTask(task.id);
      return;
    }
    const { parent, parentId, instances } = getRecurrenceFamily(task);
    const baseDate = task.scheduled_date;
    const idsToDelete = new Set<string>([task.id]);
    if (scope === "all") {
      if (parent) idsToDelete.add(parent.id);
      instances.forEach((t) => idsToDelete.add(t.id));
    } else {
      // future
      if (parent && parent.id !== task.id && parent.original_date >= baseDate && !parent.completed) {
        idsToDelete.add(parent.id);
      }
      for (const t of instances) {
        if (t.completed) continue;
        if (t.scheduled_date >= baseDate) idsToDelete.add(t.id);
      }
    }
    const ids = Array.from(idsToDelete);
    setTasks((prev) => prev.filter((t) => !idsToDelete.has(t.id)));
    await supabase.from("tasks").delete().in("id", ids);
    void parentId;
  };

  const toggleComplete = async (t: Task) => {
    const next = !t.completed;
    await updateTask(t.id, {
      completed: next,
      completed_at: next ? new Date().toISOString() : null,
      status: next ? "done" : "todo",
    });
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
    setTasks((prev) => {
      const map = new Map(prev.map((t) => [t.id, t]));
      orderedIds.forEach((id, idx) => {
        const t = map.get(id);
        if (t) map.set(id, { ...t, position: idx, scheduled_date: date });
      });
      return Array.from(map.values());
    });
    await Promise.all(
      orderedIds.map((id, idx) =>
        supabase.from("tasks").update({ position: idx, scheduled_date: date }).eq("id", id)
      )
    );
  };

  const moveTaskToDay = async (taskId: string, date: string, position = 0) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, scheduled_date: date, position } : t)));
    await supabase.from("tasks").update({ scheduled_date: date, position }).eq("id", taskId);
  };

  // Move several tasks to a target date in one batch.
  // Each task gets a unique position so the relative order is preserved.
  const bulkMoveToDay = async (taskIds: string[], date: string) => {
    if (taskIds.length === 0) return;
    const basePos = topPositionForDay(date);
    // Assign descending positions starting from basePos so the first selected ends up on top
    const updates = taskIds.map((id, idx) => ({ id, position: basePos - idx }));
    setTasks((prev) =>
      prev.map((t) => {
        const u = updates.find((x) => x.id === t.id);
        return u ? { ...t, scheduled_date: date, position: u.position } : t;
      })
    );
    await Promise.all(
      updates.map((u) =>
        supabase.from("tasks").update({ scheduled_date: date, position: u.position }).eq("id", u.id)
      )
    );
  };

  const bulkDelete = async (taskIds: string[]) => {
    if (taskIds.length === 0) return;
    setTasks((prev) => prev.filter((t) => !taskIds.includes(t.id)));
    await supabase.from("tasks").delete().in("id", taskIds);
  };

  const addTimeSpent = async (id: string, secondsToAdd: number) => {
    if (secondsToAdd <= 0) return;
    const current = tasks.find((t) => t.id === id);
    const next = (current?.time_spent_seconds ?? 0) + secondsToAdd;
    await updateTask(id, { time_spent_seconds: next });
  };

  // Duplicate a task to a target date (creates a fresh row, no recurrence link)
  const duplicateTask = async (task: Task, targetDate: string) => {
    if (!userId) return;
    const payload: TablesInsert<"tasks"> = {
      user_id: userId,
      title: task.title,
      description: task.description,
      category: task.category,
      role_id: task.role_id,
      scheduled_date: targetDate,
      original_date: targetDate,
      duration_minutes: task.duration_minutes,
      recurrence: "none",
      position: (() => {
        const dayList = tasks.filter((t) => t.scheduled_date === targetDate);
        if (dayList.length === 0) return 0;
        return Math.min(...dayList.map((t) => t.position ?? 0)) - 1;
      })(),
    };
    const { data, error } = await supabase.from("tasks").insert(payload).select().single();
    if (error) throw error;
    if (data) setTasks((prev) => (prev.some((t) => t.id === data.id) ? prev : [...prev, data]));
    return data;
  };

  // Create a follow-up: new task linked via followup_chain_id, original is marked done
  const createFollowUp = async (task: Task, targetDate: string) => {
    if (!userId) return;
    const chainId = task.followup_chain_id ?? task.id;
    // Find max followup_count across the chain (including the originating task)
    const chainMembers = tasks.filter(
      (t) => t.followup_chain_id === chainId || t.id === chainId
    );
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
      position: (() => {
        const dayList = tasks.filter((t) => t.scheduled_date === targetDate);
        if (dayList.length === 0) return 0;
        return Math.min(...dayList.map((t) => t.position ?? 0)) - 1;
      })(),
    };
    const { data, error } = await supabase.from("tasks").insert(payload).select().single();
    if (error) throw error;
    if (data) setTasks((prev) => (prev.some((t) => t.id === data.id) ? prev : [...prev, data]));

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
  const overdueTasks = tasks.filter((t) => !t.completed && t.scheduled_date < todayStr);
  const todayTasks = tasks.filter((t) => t.scheduled_date === todayStr);
  const tomorrowStr = addDays(todayStr, 1);
  const tomorrowTasks = tasks.filter((t) => t.scheduled_date === tomorrowStr);

  const tasksByDay = (date: string) => tasks.filter((t) => t.scheduled_date === date);

  // Position helper to insert a new task at the TOP of a given day
  const topPositionForDay = (date: string) => {
    const dayList = tasks.filter((t) => t.scheduled_date === date);
    if (dayList.length === 0) return 0;
    const min = Math.min(...dayList.map((t) => t.position ?? 0));
    return min - 1;
  };

  return {
    tasks,
    loading,
    overdueTasks,
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
    addTimeSpent,
    duplicateTask,
    createFollowUp,
    refresh,
  };
}
