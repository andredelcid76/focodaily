import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Subtask = Tables<"task_subtasks">;

export function useSubtasks(taskId: string | undefined, userId: string | undefined) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!taskId) {
      setSubtasks([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("task_subtasks")
      .select("*")
      .eq("task_id", taskId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (data) setSubtasks(data);
    setLoading(false);
  }, [taskId]);

  useEffect(() => {
    refresh();
    if (!taskId) return;
    const ch = supabase
      .channel(`subtasks-rt-${taskId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_subtasks", filter: `task_id=eq.${taskId}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [taskId, refresh]);

  const create = async (title: string) => {
    if (!taskId || !userId || !title.trim()) return;
    const nextPos = subtasks.length > 0 ? Math.max(...subtasks.map((s) => s.position)) + 1 : 0;
    const { error } = await supabase.from("task_subtasks").insert({
      task_id: taskId,
      user_id: userId,
      title: title.trim(),
      position: nextPos,
    });
    if (error) throw error;
  };

  const toggle = async (id: string, completed: boolean) => {
    setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, completed } : s)));
    const { error } = await supabase.from("task_subtasks").update({ completed }).eq("id", id);
    if (error) throw error;
  };

  const rename = async (id: string, title: string) => {
    const { error } = await supabase.from("task_subtasks").update({ title }).eq("id", id);
    if (error) throw error;
  };

  const remove = async (id: string) => {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
    const { error } = await supabase.from("task_subtasks").delete().eq("id", id);
    if (error) throw error;
  };

  const reorder = async (orderedIds: string[]) => {
    const map = new Map(orderedIds.map((id, i) => [id, i]));
    setSubtasks((prev) =>
      [...prev].sort((a, b) => (map.get(a.id) ?? 0) - (map.get(b.id) ?? 0)).map((s, i) => ({ ...s, position: i }))
    );
    await Promise.all(
      orderedIds.map((id, i) =>
        supabase.from("task_subtasks").update({ position: i }).eq("id", id)
      )
    );
  };

  return { subtasks, loading, create, toggle, rename, remove, reorder, refresh };
}
