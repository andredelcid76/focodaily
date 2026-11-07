import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import {
  applyTaskChange,
  changesTaskScope,
  DEPENDENCIES_CHANGED_EVENT,
  isTaskIdLoaded,
  matchesOptimisticTask,
  PROJECT_ACCESS_CHANGED_EVENT,
  scopeTaskChange,
  TASK_COMMENTS_CHANGED_EVENT,
  TASKS_CHANGED_EVENT,
  TASKS_RESYNC_EVENT,
  taskQueryKeys,
  taskSubscriptionFilters,
  type LiveTaskUpdate,
  type TaskChange,
} from "@/lib/task-live-state";
import type { Task } from "@/hooks/useTasks";
export { TASKS_CHANGED_EVENT } from "@/lib/task-live-state";

type AssignedCache = { tasks: Task[] } | undefined;

/** Task ids also held by React Query lists (Delegadas / Tarefas, project pages). */
function isTaskInQueryCaches(qc: QueryClient, id: string) {
  const assigned = qc.getQueriesData<AssignedCache>({ queryKey: ["my-assigned-tasks"] });
  if (assigned.some(([, data]) => data?.tasks?.some(t => t.id === id))) return true;
  const projects = qc.getQueriesData<Task[]>({ queryKey: ["project-tasks"] });
  return projects.some(([, data]) => Array.isArray(data) && data.some(t => t.id === id));
}

function removeFromQueryCaches(qc: QueryClient, id: string) {
  qc.setQueriesData<AssignedCache>({ queryKey: ["my-assigned-tasks"] }, data =>
    data?.tasks?.some(t => t.id === id) ? { ...data, tasks: data.tasks.filter(t => t.id !== id) } : data);
  qc.setQueriesData<Task[]>({ queryKey: ["project-tasks"] }, data =>
    Array.isArray(data) && data.some(t => t.id === id) ? data.filter(t => t.id !== id) : data);
}

const emit = (detail: LiveTaskUpdate | LiveTaskUpdate[]) =>
  window.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT, { detail }));

/**
 * One filtered task feed for the whole shell. Payloads reconcile local state without
 * downloading the collection; every screen reads either useTasks (via TASKS_CHANGED_EVENT)
 * or the invalidated query families below.
 */
export function useLiveTaskSync(userId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let doorbell: ReturnType<typeof supabase.channel> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let connectGeneration = 0;
    let projectIds = new Set<string>();
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
    const isLoaded = (id: string | null | undefined) => !!id && (isTaskIdLoaded(id) || isTaskInQueryCaches(qc, id));

    const removeTask = (id: string) => {
      emit({ eventType: "DELETE", new: {}, old: { id } });
      removeFromQueryCaches(qc, id);
      invalidate([["my-assigned-tasks"], ["dependency-status"]]);
    };

    const onTask = (raw: TaskChange) => {
      const signature = JSON.stringify(raw);
      if (seen.has(signature)) return;
      seen.add(signature);
      if (seen.size > 500) seen.delete(seen.values().next().value ?? "");
      // An update that no longer belongs to me (reassigned / moved project) becomes a removal.
      const change = scopeTaskChange(raw, userId, projectIds);
      if (change.eventType === "DELETE") {
        const id = change.old.id;
        if (isLoaded(id)) removeTask(id as string);
        return;
      }
      const local = matchesOptimisticTask(change);
      // Always reconcile trigger-produced timestamps/time totals, even for an optimistic write.
      emit(change);
      if (!local || changesTaskScope(change)) invalidate(taskQueryKeys(change));
      else {
        // Our own write: patch list caches in place instead of repeating their reads.
        qc.setQueriesData<AssignedCache>({ queryKey: ["my-assigned-tasks"] }, data => data ? { ...data, tasks: applyTaskChange(data.tasks, change) } : data);
        qc.setQueriesData<Task[]>({ queryKey: ["project-tasks"] }, data => Array.isArray(data) && data.some(t => t.id === change.new.id) ? applyTaskChange(data, change) : data);
        invalidate([["dependency-status"]]);
      }
    };

    /** Re-read one task after a doorbell: still readable → update, otherwise remove. */
    const recheckTask = async (id: string) => {
      if (!isLoaded(id)) return;
      const { data, error } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
      if (!alive || error) return;
      if (!data) removeTask(id);
      else {
        emit({ eventType: "UPDATE", new: data as Task, old: { id } });
        invalidate(taskQueryKeys({ eventType: "UPDATE", new: data as Task, old: {} }));
      }
    };

    /** Reload only one project's tasks after my membership changed, then resubscribe. */
    const reloadProject = async (projectId: string) => {
      const rows = await fetchAllRows<Task>(() => supabase.from("tasks").select("*").eq("project_id", projectId).order("id"));
      if (!alive) return;
      emit({ eventType: "PROJECT_SNAPSHOT", projectId, rows });
      window.dispatchEvent(new CustomEvent(PROJECT_ACCESS_CHANGED_EVENT, { detail: { projectId } }));
      invalidate([["my-assigned-tasks"], ["project-tasks", projectId], ["my-project-roles"], ["dependency-status"]]);
    };

    const connect = async () => {
      const generation = ++connectGeneration;
      const projects = await fetchAllRows<{ id: string }>(() => supabase.from("projects").select("id").order("id"));
      if (!alive || generation !== connectGeneration) return;
      projectIds = new Set(projects.map(p => p.id));
      const previous = channel;
      channel = undefined;
      if (previous) await supabase.removeChannel(previous);
      if (!alive || generation !== connectGeneration) return;
      const next = supabase.channel(`live-sync-${userId}-${crypto.randomUUID()}`);
      channel = next;
      // Filters only apply to INSERT/UPDATE; DELETE is subscribed once, unfiltered, below.
      for (const filter of taskSubscriptionFilters(userId, Array.from(projectIds))) {
        for (const event of ["INSERT", "UPDATE"] as const) {
          next.on("postgres_changes", { event, schema: "public", table: "tasks", filter }, payload => onTask(payload as unknown as TaskChange));
        }
      }
      // Realtime cannot filter DELETE and, under RLS, only sends the primary key.
      next.on("postgres_changes", { event: "DELETE", schema: "public", table: "tasks" }, payload => {
        const id = (payload.old as Partial<Task>)?.id;
        if (isLoaded(id)) removeTask(id as string);
      });
      // Comments by anyone on tasks I can see (RLS-filtered); act only on loaded tasks.
      next.on("postgres_changes", { event: "INSERT", schema: "public", table: "task_comments" }, payload => {
        const taskId = (payload.new as { task_id?: string })?.task_id;
        if (!isLoaded(taskId)) return;
        invalidate([["task-comments", taskId], ["my-assigned-tasks"]]);
        window.dispatchEvent(new CustomEvent(TASK_COMMENTS_CHANGED_EVENT, { detail: { taskId } }));
      });
      next.on("postgres_changes", { event: "*", schema: "public", table: "task_dependencies" }, () => {
        invalidate([["dependency-status"]]);
        window.dispatchEvent(new CustomEvent(DEPENDENCIES_CHANGED_EVENT));
      });
      next.subscribe(status => {
        if (status === "SUBSCRIBED") {
          // Recover changes missed between initial read and subscription, and on reconnect.
          window.dispatchEvent(new CustomEvent(TASKS_RESYNC_EVENT));
        }
      });
    };

    // Private per-user doorbell: access changes Postgres Changes cannot deliver under RLS.
    const connectDoorbell = async () => {
      await supabase.realtime.setAuth();
      if (!alive) return;
      doorbell = supabase
        .channel(`user:${userId}`, { config: { private: true } })
        .on("broadcast", { event: "task-access" }, ({ payload }) => {
          const id = (payload as { task_id?: string })?.task_id;
          if (id) void recheckTask(id).catch(() => {});
        })
        .on("broadcast", { event: "project-access" }, ({ payload }) => {
          const projectId = (payload as { project_id?: string })?.project_id;
          if (!projectId) return;
          void connect().catch(() => {});
          void reloadProject(projectId).catch(() => {});
        })
        .subscribe();
    };

    void connect().catch(() => {});
    void connectDoorbell().catch(() => {});
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
    // Safety net for access paths without a doorbell (e.g. team membership changes).
    const recovery = setInterval(() => { if (document.visibilityState === "visible") recover(); }, 300_000);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      connectGeneration++;
      if (timer) clearTimeout(timer);
      clearInterval(recovery);
      document.removeEventListener("visibilitychange", onVis);
      if (channel) void supabase.removeChannel(channel);
      if (doorbell) void supabase.removeChannel(doorbell);
    };
  }, [userId, qc]);
}
