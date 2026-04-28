import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { todayISO, addDays } from "@/lib/date";

export type Task = Tables<"tasks">;
export type TaskCategory = Task["category"];
export type TaskRecurrence = Task["recurrence"];

// How many days ahead we materialize recurring task instances
const FUTURE_DAYS = 14;

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
    const today = todayISO();
    const { data: parents } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .neq("recurrence", "none")
      .is("recurrence_parent_id", null);

    if (!parents || parents.length === 0) return;

    // Pre-fetch all already-existing children for these parents in the window
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
        // Skip if same as parent's own date (parent is the seed)
        if (dayISO === p.original_date) continue;
        if (existingSet.has(`${p.id}__${dayISO}`)) continue;

        const [ty, tm, td] = dayISO.split("-").map(Number);
        const dayD = new Date(ty, tm - 1, td);
        if (dayD < startD) continue;
        const diffDays = Math.floor((dayD.getTime() - startD.getTime()) / 86400000);
        if (diffDays === 0) continue;

        let matches = false;
        if (p.recurrence === "daily") matches = true;
        else if (p.recurrence === "weekly") matches = diffDays % 7 === 0;
        else if (p.recurrence === "monthly") matches = startD.getDate() === dayD.getDate();
        else if (p.recurrence === "custom") {
          const interval = p.recurrence_interval ?? 0;
          const weekdays = p.recurrence_weekdays ?? [];
          if (weekdays.length > 0) matches = weekdays.includes(dayD.getDay());
          else if (interval > 0) matches = diffDays % interval === 0;
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
      }
    }

    if (inserts.length > 0) {
      await supabase.from("tasks").insert(inserts);
    }
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

  const toggleComplete = async (t: Task) => {
    await updateTask(t.id, {
      completed: !t.completed,
      completed_at: !t.completed ? new Date().toISOString() : null,
    });
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

  const addTimeSpent = async (id: string, secondsToAdd: number) => {
    if (secondsToAdd <= 0) return;
    const current = tasks.find((t) => t.id === id);
    const next = (current?.time_spent_seconds ?? 0) + secondsToAdd;
    await updateTask(id, { time_spent_seconds: next });
  };

  // Overdue = scheduled_date < today AND not completed
  const todayStr = todayISO();
  const overdueTasks = tasks.filter((t) => !t.completed && t.scheduled_date < todayStr);
  const todayTasks = tasks.filter((t) => t.scheduled_date === todayStr);
  const tomorrowStr = addDays(todayStr, 1);
  const tomorrowTasks = tasks.filter((t) => t.scheduled_date === tomorrowStr);

  const tasksByDay = (date: string) => tasks.filter((t) => t.scheduled_date === date);

  return {
    tasks,
    loading,
    overdueTasks,
    todayTasks,
    tomorrowTasks,
    tasksByDay,
    createTask,
    updateTask,
    deleteTask,
    toggleComplete,
    reorderInDay,
    moveTaskToDay,
    addTimeSpent,
    refresh,
  };
}
