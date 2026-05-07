import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SubtaskCount = { total: number; completed: number };

export function useSubtaskCounts(userId: string | undefined) {
  const [counts, setCounts] = useState<Record<string, SubtaskCount>>({});

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("task_subtasks")
      .select("task_id, completed")
      .eq("user_id", userId);
    if (!data) return;
    const map: Record<string, SubtaskCount> = {};
    for (const row of data) {
      const k = row.task_id as string;
      if (!map[k]) map[k] = { total: 0, completed: 0 };
      map[k].total += 1;
      if (row.completed) map[k].completed += 1;
    }
    setCounts(map);
  }, [userId]);

  useEffect(() => {
    refresh();
    if (!userId) return;
    const ch = supabase
      .channel(`subtask-counts-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_subtasks", filter: `user_id=eq.${userId}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, refresh]);

  return counts;
}
