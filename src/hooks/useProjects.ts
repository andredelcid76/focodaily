import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { notifyProjectTeamAccess } from "@/lib/team.functions";

export type Project = Tables<"projects">;
export type ProjectStatus = Project["status"];
export type ProjectHistory = Tables<"project_status_history">;

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: "Rascunho",
  active: "Ativo",
  paused: "Em pausa",
  done: "Concluído",
  archived: "Arquivado",
};

export const PROJECT_STATUS_ORDER: ProjectStatus[] = [
  "active",
  "draft",
  "paused",
  "done",
  "archived",
];

export const PROJECT_COLORS = [
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f59e0b", // amber
  "#10b981", // emerald
  "#3b82f6", // blue
  "#ef4444", // red
  "#14b8a6", // teal
  "#a855f7", // purple
];

export function useProjects(userId: string | undefined) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const notifyTeamAccess = useServerFn(notifyProjectTeamAccess);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("name", { ascending: true });
    if (!error && data) setProjects(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    refresh();
    const ch = supabase
      .channel(`projects-rt-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects", filter: `user_id=eq.${userId}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, refresh]);

  const createProject = useCallback(
    async (data: Omit<TablesInsert<"projects">, "user_id">) => {
      if (!userId) return null;
      const { data: inserted, error } = await supabase
        .from("projects")
        .insert({ ...data, user_id: userId })
        .select()
        .single();
      if (error) throw error;
      if (inserted) {
        setProjects((prev) => [inserted, ...prev]);
        if (inserted.team_id && typeof window !== "undefined") {
          await notifyTeamAccess({
            data: { project_id: inserted.id, team_id: inserted.team_id, origin: window.location.origin },
          });
        }
        // initial history
        await supabase.from("project_status_history").insert({
          project_id: inserted.id,
          user_id: userId,
          from_status: null,
          to_status: inserted.status,
          note: "Projeto criado",
        });
      }
      return inserted;
    },
    [userId]
  );

  const updateProject = useCallback(
    async (id: string, patch: Partial<Project>) => {
      if (!userId) return;
      const previous = projects.find((p) => p.id === id);
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      const { error } = await supabase.from("projects").update(patch).eq("id", id);
      if (error) throw error;
      if (patch.team_id && patch.team_id !== previous?.team_id && typeof window !== "undefined") {
        await notifyTeamAccess({
          data: { project_id: id, team_id: patch.team_id, origin: window.location.origin },
        });
      }
      if (patch.status && previous && previous.status !== patch.status) {
        await supabase.from("project_status_history").insert({
          project_id: id,
          user_id: userId,
          from_status: previous.status,
          to_status: patch.status,
        });
      }
    },
    [notifyTeamAccess, projects, userId]
  );

  const deleteProject = useCallback(async (id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) throw error;
  }, []);

  const projectById = useCallback(
    (id: string | null | undefined) => (id ? projects.find((p) => p.id === id) ?? null : null),
    [projects]
  );

  return useMemo(
    () => ({
      projects,
      loading,
      refresh,
      createProject,
      updateProject,
      deleteProject,
      projectById,
    }),
    [projects, loading, refresh, createProject, updateProject, deleteProject, projectById]
  );
}

export function useProjectHistory(projectId: string | undefined) {
  const [history, setHistory] = useState<ProjectHistory[]>([]);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("project_status_history")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (active && data) setHistory(data);
    })();
    const ch = supabase
      .channel(`project-history-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_status_history", filter: `project_id=eq.${projectId}` },
        async () => {
          const { data } = await supabase
            .from("project_status_history")
            .select("*")
            .eq("project_id", projectId)
            .order("created_at", { ascending: false })
            .limit(20);
          if (data) setHistory(data);
        }
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [projectId]);

  return history;
}

// ---- Stats helpers (pure functions, used by routes) ----

export type ProjectStats = {
  total: number;
  done: number;
  open: number;
  overdueTasks: number;
  estimatedMinutes: number;
  spentSeconds: number;
  progress: number; // 0..1
  daysRemaining: number | null; // null if no deadline
  isOverdue: boolean;
  nextTaskDate: string | null; // earliest scheduled_date among open tasks
  nextTaskOverdue: boolean;
};

export function computeProjectStats(
  project: Project,
  tasks: { completed: boolean; duration_minutes: number; time_spent_seconds: number; scheduled_date: string }[],
  todayISO: string
): ProjectStats {
  const total = tasks.length;
  const done = tasks.filter((t) => t.completed).length;
  const open = total - done;
  const overdueTasks = tasks.filter((t) => !t.completed && t.scheduled_date < todayISO).length;
  const estimatedMinutes = tasks
    .filter((t) => !t.completed)
    .reduce((s, t) => s + (t.duration_minutes ?? 0), 0);
  const spentSeconds = tasks.reduce((s, t) => s + (t.time_spent_seconds ?? 0), 0);
  const progress = total > 0 ? done / total : 0;

  let daysRemaining: number | null = null;
  let isOverdue = false;
  if (project.deadline) {
    const [ty, tm, td] = todayISO.split("-").map(Number);
    const [dy, dm, dd] = project.deadline.split("-").map(Number);
    const today = new Date(ty, tm - 1, td);
    const dl = new Date(dy, dm - 1, dd);
    daysRemaining = Math.round((dl.getTime() - today.getTime()) / 86400000);
    isOverdue = daysRemaining < 0 && project.status !== "done" && project.status !== "archived";
  }

  const openDates = tasks
    .filter((t) => !t.completed && !!t.scheduled_date)
    .map((t) => t.scheduled_date)
    .sort();
  const nextTaskDate = openDates.length > 0 ? openDates[0] : null;
  const nextTaskOverdue =
    nextTaskDate !== null &&
    nextTaskDate < todayISO &&
    project.status !== "done" &&
    project.status !== "archived";

  return {
    total,
    done,
    open,
    overdueTasks,
    estimatedMinutes,
    spentSeconds,
    progress,
    daysRemaining,
    isOverdue,
    nextTaskDate,
    nextTaskOverdue,
  };
}
