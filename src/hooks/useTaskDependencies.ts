import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type TaskDependency = Tables<"task_dependencies">;

export function useTaskDependencies(userId: string | undefined) {
  const [deps, setDeps] = useState<TaskDependency[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("task_dependencies")
      .select("*")
      .eq("user_id", userId);
    if (error) {
      console.error("[useTaskDependencies]", error);
      return;
    }
    setDeps(data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Predecessor ids that block a given task. */
  const predecessorsOf = useCallback(
    (taskId: string) => deps.filter((d) => d.successor_id === taskId).map((d) => d.predecessor_id),
    [deps],
  );

  /** Successor ids that depend on a given task. */
  const successorsOf = useCallback(
    (taskId: string) => deps.filter((d) => d.predecessor_id === taskId).map((d) => d.successor_id),
    [deps],
  );

  /** Replace the predecessors of `taskId` with the given list. */
  const setPredecessors = useCallback(
    async (taskId: string, predecessorIds: string[], lagDays = 0) => {
      if (!userId) return;
      const current = deps.filter((d) => d.successor_id === taskId);
      const currentIds = new Set(current.map((d) => d.predecessor_id));
      const nextIds = new Set(predecessorIds);

      const toRemove = current.filter((d) => !nextIds.has(d.predecessor_id)).map((d) => d.id);
      const toAdd = predecessorIds.filter((id) => !currentIds.has(id));

      if (toRemove.length > 0) {
        const { error } = await supabase.from("task_dependencies").delete().in("id", toRemove);
        if (error) throw error;
      }
      if (toAdd.length > 0) {
        const rows = toAdd.map((pid) => ({
          user_id: userId,
          predecessor_id: pid,
          successor_id: taskId,
          lag_days: lagDays,
          dep_type: "FS" as const,
        }));
        const { error } = await supabase.from("task_dependencies").insert(rows);
        if (error) throw error;
      }
      await refresh();
    },
    [deps, refresh, userId],
  );

  return {
    deps,
    loading,
    refresh,
    predecessorsOf,
    successorsOf,
    setPredecessors,
  };
}

/**
 * Given a task id, the dep list, and the full task map, returns the titles
 * of predecessors that are still open (i.e. currently blocking this task).
 */
export function blockingPredecessorTitles(
  taskId: string,
  deps: TaskDependency[],
  taskMap: Map<string, { title: string; completed: boolean }>,
): string[] {
  return deps
    .filter((d) => d.successor_id === taskId)
    .map((d) => taskMap.get(d.predecessor_id))
    .filter((t): t is { title: string; completed: boolean } => !!t && !t.completed)
    .map((t) => t.title);
}
