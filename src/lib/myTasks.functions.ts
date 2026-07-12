import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type MyTaskRow = {
  id: string;
  title: string;
  description: string | null;
  category: "urgent" | "important" | "circumstantial";
  status: "todo" | "doing" | "done";
  completed: boolean;
  scheduled_date: string;
  duration_minutes: number;
  assignee_id: string | null;
  user_id: string;
  project_id: string | null;
  role_id: string | null;
  non_negotiable: boolean | null;
  /**
   * own      = criada por mim (sou user_id)
   * delegated= delegada para mim (sou assignee_id, mas não user_id)
   * shared   = está em projeto compartilhado comigo (não sou owner nem assignee)
   */
  kind: "own" | "delegated" | "shared";
  project: {
    id: string;
    name: string;
    color: string | null;
    icon: string | null;
    status: string | null;
  } | null;

  role: {
    id: string;
    name: string;
    color: string;
  } | null;
  delegated_by_name: string | null;
};

// Returns ALL tasks relevant to the user:
// - personal tasks they own
// - tasks (in any project) where they are the assignee
// - tasks from shared projects (membership or team) where they're neither owner nor assignee
export const listMyAssignedTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    // ---- 1. My own + delegated tasks ----
    const { data: mineRows, error: mineErr } = await supabaseAdmin
      .from("tasks")
      .select(
        "id,title,description,category,status,completed,scheduled_date,duration_minutes,assignee_id,user_id,project_id,role_id,non_negotiable",
      )
      .or(`user_id.eq.${userId},assignee_id.eq.${userId}`)
      .order("scheduled_date", { ascending: true });
    if (mineErr) throw new Error(mineErr.message);

    // ---- 2. Shared projects (project_members + team membership) ----
    const [{ data: pmRows }, { data: tmRows }, { data: tOwnedRows }] = await Promise.all([
      supabaseAdmin.from("project_members").select("project_id").eq("user_id", userId),
      supabaseAdmin.from("team_members").select("team_id").eq("user_id", userId),
      supabaseAdmin.from("teams").select("id").eq("owner_id", userId),
    ]);

    const teamIds = Array.from(
      new Set([...(tmRows ?? []).map((r) => r.team_id), ...(tOwnedRows ?? []).map((r) => r.id)]),
    );
    let teamProjectIds: string[] = [];
    if (teamIds.length) {
      const { data } = await supabaseAdmin
        .from("projects")
        .select("id")
        .in("team_id", teamIds);
      teamProjectIds = (data ?? []).map((r) => r.id);
    }
    const sharedProjectIds = Array.from(
      new Set([...(pmRows ?? []).map((r) => r.project_id), ...teamProjectIds]),
    );

    let sharedRows: typeof mineRows = [];
    if (sharedProjectIds.length) {
      const { data, error } = await supabaseAdmin
        .from("tasks")
        .select(
          "id,title,description,category,status,completed,scheduled_date,duration_minutes,assignee_id,user_id,project_id,role_id,non_negotiable",
        )
        .in("project_id", sharedProjectIds)
        .neq("user_id", userId)
        .order("scheduled_date", { ascending: true });
      if (error) throw new Error(error.message);
      sharedRows = (data ?? []).filter((t) => t.assignee_id !== userId);
    }

    // Merge (avoid duplicates) and mark kind
    const seen = new Set<string>();
    const merged: Array<{ row: NonNullable<typeof mineRows>[number]; kind: MyTaskRow["kind"] }> = [];
    for (const t of mineRows ?? []) {
      seen.add(t.id);
      merged.push({ row: t, kind: t.user_id === userId ? "own" : "delegated" });
    }
    for (const t of sharedRows ?? []) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      merged.push({ row: t, kind: "shared" });
    }

    // ---- 3. Hydrate projects / roles / owner names ----
    const projectIds = Array.from(
      new Set(merged.map((m) => m.row.project_id).filter(Boolean) as string[]),
    );
    const roleIds = Array.from(
      new Set(merged.map((m) => m.row.role_id).filter(Boolean) as string[]),
    );
    const ownerIds = Array.from(
      new Set(merged.map((m) => m.row.user_id).filter((id) => id && id !== userId)),
    );

    const [{ data: projects }, { data: roles }, { data: owners }] = await Promise.all([
      projectIds.length
        ? supabaseAdmin.from("projects").select("id,name,color,icon,status").in("id", projectIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string; color: string | null; icon: string | null; status: string | null }> }),
      roleIds.length
        ? supabaseAdmin.from("roles").select("id,name,color").in("id", roleIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string; color: string }> }),
      ownerIds.length
        ? supabaseAdmin.from("profiles").select("user_id,display_name,email").in("user_id", ownerIds)
        : Promise.resolve({ data: [] as Array<{ user_id: string; display_name: string | null; email: string | null }> }),
    ]);

    const projectById = new Map((projects ?? []).map((p) => [p.id, p]));
    const roleById = new Map((roles ?? []).map((r) => [r.id, r]));
    const ownerById = new Map((owners ?? []).map((o) => [o.user_id, o]));

    const tasks: MyTaskRow[] = merged.map(({ row: t, kind }) => {
      const owner = t.user_id !== userId ? ownerById.get(t.user_id) : undefined;
      const p = t.project_id ? projectById.get(t.project_id) : null;
      const r = t.role_id ? roleById.get(t.role_id) : null;
      return {
        id: t.id,
        title: t.title,
        description: t.description,
        category: t.category as MyTaskRow["category"],
        status: (t.status ?? (t.completed ? "done" : "todo")) as MyTaskRow["status"],
        completed: !!t.completed,
        scheduled_date: t.scheduled_date,
        duration_minutes: t.duration_minutes ?? 0,
        assignee_id: t.assignee_id,
        user_id: t.user_id,
        project_id: t.project_id,
        role_id: t.role_id,
        non_negotiable: (t as { non_negotiable?: boolean | null }).non_negotiable ?? null,
        kind,
        project: p ? { id: p.id, name: p.name, color: p.color, icon: p.icon, status: (p as { status?: string | null }).status ?? null } : null,
        role: r ? { id: r.id, name: r.name, color: r.color } : null,
        delegated_by_name: owner?.display_name ?? owner?.email ?? null,
      };
    });

    return { tasks };
  });
