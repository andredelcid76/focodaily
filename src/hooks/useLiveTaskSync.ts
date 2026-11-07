import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { applyTaskChange, DEPENDENCIES_CHANGED_EVENT, TASKS_CHANGED_EVENT, TASKS_RESYNC_EVENT, matchesOptimisticTask, taskQueryKeys, taskSubscriptionFilters, type TaskChange } from "@/lib/task-live-state";
import type { Task } from "@/hooks/useTasks";
export { TASKS_CHANGED_EVENT } from "@/lib/task-live-state";

/** One filtered task feed; payloads reconcile local state without downloading the collection. */
export function useLiveTaskSync(userId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let connectGeneration = 0;
    const dirtyKeys = new Map<string, unknown[]>();
    const seen = new Set<string>();
    const invalidate = (keys: unknown[][]) => {
      keys.forEach(key => dirtyKeys.set(JSON.stringify(key), key));
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        for (const queryKey of dirtyKeys.values()) void qc.invalidateQueries({ queryKey });
        dirtyKeys.clear();
      }, 700);
    };
    const onTask = (change: TaskChange) => {
      const signature = JSON.stringify(change);
      if (seen.has(signature)) return;
      seen.add(signature);
      if (seen.size > 500) seen.delete(seen.values().next().value ?? "");
      const local = matchesOptimisticTask(change);
      // Always reconcile trigger-produced timestamps/time totals, even for an optimistic write.
      window.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT, { detail: change }));
      if (!local) invalidate(taskQueryKeys(change));
      else {
        // Reconcile existing task query caches without repeating their reads for our write.
        qc.setQueriesData({ queryKey: ["my-assigned-tasks"] }, (data: { tasks: Task[] } | undefined) => data ? { ...data, tasks: applyTaskChange(data.tasks, change) } : data);
        qc.setQueriesData({ queryKey: ["project-tasks"] }, (data: Task[] | undefined) => data?.some(t => t.id === change.new.id) ? applyTaskChange(data, change) : data);
        invalidate([["dependency-status"]]);
        if (change.old.project_id && change.old.project_id !== change.new.project_id) invalidate(taskQueryKeys(change));
      }
    };
    const connect = async () => {
      const generation = ++connectGeneration;
      const projects = await fetchAllRows<{ id: string }>(() => supabase.from("projects").select("id").order("id"));
      if (!alive || generation !== connectGeneration) return;
      const previous = channel;
      channel = undefined;
      if (previous) await supabase.removeChannel(previous);
      if (!alive || generation !== connectGeneration) return;
      channel = supabase.channel(`live-sync-${userId}-${crypto.randomUUID()}`);
      for (const filter of taskSubscriptionFilters(userId, projects.map(p => p.id))) {
        channel.on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter }, payload => onTask(payload as TaskChange));
      }
      channel.on("postgres_changes", { event: "*", schema: "public", table: "task_comments", filter: `user_id=eq.${userId}` }, payload => {
        const row = payload.eventType === "DELETE" ? payload.old : payload.new;
        if ("task_id" in row) invalidate([["task-comments", row.task_id]]);
      });
      channel.on("postgres_changes", { event: "*", schema: "public", table: "task_dependencies" }, () => {
        invalidate([["dependency-status"]]);
        window.dispatchEvent(new CustomEvent(DEPENDENCIES_CHANGED_EVENT));
      });
      channel.subscribe(status => {
        if (status === "SUBSCRIBED") {
          // Recover changes missed between initial read and subscription, and on reconnect.
          window.dispatchEvent(new CustomEvent(TASKS_RESYNC_EVENT));
        }
      });
    };
    void connect().catch(() => {});
    let hiddenAt = 0;
    const recover = () => {
      window.dispatchEvent(new CustomEvent(TASKS_RESYNC_EVENT));
      invalidate([["my-assigned-tasks"], ["project-tasks"], ["dependency-status"]]);
      void connect().catch(() => {});
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 20_000) { hiddenAt = 0; recover(); }
    };
    // Access/assignment changes may stop matching the new-row filter. Bounded reconciliation
    // also rediscovers shared projects, without refetching on every unrelated event.
    const recovery = setInterval(() => { if (document.visibilityState === "visible") recover(); }, 300_000);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      connectGeneration++;
      if (timer) clearTimeout(timer);
      clearInterval(recovery);
      document.removeEventListener("visibilitychange", onVis);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId, qc]);
}
