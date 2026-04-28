import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { todayISO, addDays } from "@/lib/date";

export type Task = Tables<"tasks">;
export type TaskCategory = Task["category"];
export type TaskRecurrence = Task["recurrence"];

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

  // Generate recurring tasks for today if missing
  const ensureRecurring = useCallback(async () => {
    if (!userId) return;
    const today = todayISO();
    const { data: parents } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .neq("recurrence", "none")
      .is("recurrence_parent_id", null);

    if (!parents) return;

    for (const p of parents) {
      // Check if a child for today already exists
      const { data: existing } = await supabase
        .from("tasks")
        .select("id")
        .eq("recurrence_parent_id", p.id)
        .eq("scheduled_date", today)
        .maybeSingle();
      if (existing) continue;

      // Check if today matches recurrence
      const start = p.original_date;
      const [sy, sm, sd] = start.split("-").map(Number);
      const [ty, tm, td] = today.split("-").map(Number);
      const startD = new Date(sy, sm - 1, sd);
      const todayD = new Date(ty, tm - 1, td);
      if (todayD < startD) continue;
      const diffDays = Math.floor((todayD.getTime() - startD.getTime()) / 86400000);

      let matches = false;
      if (p.recurrence === "daily") matches = true;
      else if (p.recurrence === "weekly") matches = diffDays % 7 === 0;
      else if (p.recurrence === "monthly") matches = startD.getDate() === todayD.getDate();
      else if (p.recurrence === "custom") {
        const interval = p.recurrence_interval ?? 0;
        const weekdays = p.recurrence_weekdays ?? [];
        if (weekdays.length > 0) {
          // 0=Sun..6=Sat (JS getDay)
          matches = weekdays.includes(todayD.getDay());
        } else if (interval > 0) {
          matches = diffDays % interval === 0;
        }
      }

      if (!matches || diffDays === 0) continue;

      const insert: TablesInsert<"tasks"> = {
        user_id: userId,
        title: p.title,
        description: p.description,
        category: p.category,
        role_id: p.role_id,
        scheduled_date: today,
        original_date: today,
        duration_minutes: p.duration_minutes,
        recurrence: "none",
        recurrence_parent_id: p.id,
        position: 999,
      };
      await supabase.from("tasks").insert(insert);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      await ensureRecurring();
      await refresh();
    })();

    const channel = supabase
      .channel("tasks-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${userId}` }, () => {
        refresh();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refresh, ensureRecurring]);

  const createTask = async (data: Omit<TablesInsert<"tasks">, "user_id">) => {
    if (!userId) return;
    const { error } = await supabase.from("tasks").insert({ ...data, user_id: userId });
    if (error) throw error;
  };

  const updateTask = async (id: string, patch: Partial<Task>) => {
    const { error } = await supabase.from("tasks").update(patch).eq("id", id);
    if (error) throw error;
  };

  const deleteTask = async (id: string) => {
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
    // Optimistic
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

  // Overdue = scheduled_date < today AND not completed
  const todayStr = todayISO();
  const overdueTasks = tasks.filter((t) => !t.completed && t.scheduled_date < todayStr);
  const todayTasks = tasks.filter((t) => t.scheduled_date === todayStr);
  const tomorrowStr = addDays(todayStr, 1);
  const tomorrowTasks = tasks.filter((t) => t.scheduled_date === tomorrowStr);

  return {
    tasks,
    loading,
    overdueTasks,
    todayTasks,
    tomorrowTasks,
    createTask,
    updateTask,
    deleteTask,
    toggleComplete,
    reorderInDay,
    moveTaskToDay,
    refresh,
  };
}
