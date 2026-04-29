import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type ProjectComment = Tables<"project_comments">;
export type ProjectLink = Tables<"project_links">;
export type ProjectMilestone = Tables<"project_milestones">;
export type MilestoneStatus = ProjectMilestone["status"];

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  pending: "A fazer",
  in_progress: "Em andamento",
  done: "Concluído",
};

// ---------------- Comments ----------------
export function useProjectComments(projectId: string | undefined, userId: string | undefined) {
  const [comments, setComments] = useState<ProjectComment[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from("project_comments")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    if (data) setComments(data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    refresh();
    const ch = supabase
      .channel(`pc-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_comments", filter: `project_id=eq.${projectId}` },
        () => refresh()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [projectId, refresh]);

  const add = useCallback(async (content: string) => {
    if (!projectId || !userId || !content.trim()) return;
    await supabase.from("project_comments").insert({ project_id: projectId, user_id: userId, content: content.trim() });
  }, [projectId, userId]);

  const update = useCallback(async (id: string, content: string) => {
    await supabase.from("project_comments").update({ content: content.trim(), edited_at: new Date().toISOString() }).eq("id", id);
  }, []);

  const remove = useCallback(async (id: string) => {
    await supabase.from("project_comments").delete().eq("id", id);
  }, []);

  return { comments, loading, add, update, remove };
}

// ---------------- Links ----------------
const LINK_KIND_HINTS: { match: RegExp; kind: string; label: string }[] = [
  { match: /loop\.microsoft|loop\.cloud\.microsoft/i, kind: "loop", label: "Loop" },
  { match: /sharepoint\.com/i, kind: "sharepoint", label: "SharePoint" },
  { match: /onedrive\.live|1drv\.ms/i, kind: "onedrive", label: "OneDrive" },
  { match: /docs\.google\.com|drive\.google\.com/i, kind: "google", label: "Google" },
  { match: /figma\.com/i, kind: "figma", label: "Figma" },
  { match: /notion\.so/i, kind: "notion", label: "Notion" },
  { match: /github\.com/i, kind: "github", label: "GitHub" },
  { match: /miro\.com/i, kind: "miro", label: "Miro" },
  { match: /tasks\.office\.com|planner/i, kind: "planner", label: "Planner" },
];

export function detectLinkKind(url: string): { kind: string; suggestedLabel: string } {
  for (const h of LINK_KIND_HINTS) if (h.match.test(url)) return { kind: h.kind, suggestedLabel: h.label };
  try {
    const u = new URL(url);
    return { kind: "link", suggestedLabel: u.hostname.replace(/^www\./, "") };
  } catch {
    return { kind: "link", suggestedLabel: "Link" };
  }
}

export function useProjectLinks(projectId: string | undefined, userId: string | undefined) {
  const [links, setLinks] = useState<ProjectLink[]>([]);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from("project_links")
      .select("*")
      .eq("project_id", projectId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (data) setLinks(data);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    refresh();
    const ch = supabase
      .channel(`pl-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_links", filter: `project_id=eq.${projectId}` },
        () => refresh()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [projectId, refresh]);

  const add = useCallback(async (input: { url: string; label?: string; kind?: string }) => {
    if (!projectId || !userId || !input.url.trim()) return;
    const detected = detectLinkKind(input.url.trim());
    await supabase.from("project_links").insert({
      project_id: projectId,
      user_id: userId,
      url: input.url.trim(),
      label: (input.label?.trim() || detected.suggestedLabel),
      kind: input.kind || detected.kind,
      position: links.length,
    });
  }, [projectId, userId, links.length]);

  const update = useCallback(async (id: string, patch: Partial<ProjectLink>) => {
    await supabase.from("project_links").update(patch).eq("id", id);
  }, []);

  const remove = useCallback(async (id: string) => {
    await supabase.from("project_links").delete().eq("id", id);
  }, []);

  return { links, add, update, remove };
}

// ---------------- Milestones ----------------
export function useProjectMilestones(projectId: string | undefined, userId: string | undefined) {
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from("project_milestones")
      .select("*")
      .eq("project_id", projectId)
      .order("position", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false });
    if (data) setMilestones(data);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    refresh();
    const ch = supabase
      .channel(`pm-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_milestones", filter: `project_id=eq.${projectId}` },
        () => refresh()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [projectId, refresh]);

  const add = useCallback(async (input: Omit<TablesInsert<"project_milestones">, "user_id" | "project_id">) => {
    if (!projectId || !userId) return;
    await supabase.from("project_milestones").insert({
      ...input,
      project_id: projectId,
      user_id: userId,
      position: input.position ?? milestones.length,
    });
  }, [projectId, userId, milestones.length]);

  const update = useCallback(async (id: string, patch: Partial<ProjectMilestone>) => {
    if (patch.status === "done" && !patch.completed_at) patch.completed_at = new Date().toISOString();
    if (patch.status && patch.status !== "done") patch.completed_at = null;
    await supabase.from("project_milestones").update(patch).eq("id", id);
  }, []);

  const remove = useCallback(async (id: string) => {
    await supabase.from("project_milestones").delete().eq("id", id);
  }, []);

  return useMemo(() => ({ milestones, add, update, remove }), [milestones, add, update, remove]);
}
