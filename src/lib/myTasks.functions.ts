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
  non_negotiable: boolean | null;
  project: {
    id: string;
    name: string;
    color: string | null;
    icon: string | null;
  } | null;
  delegated_by_name: string | null;
};

// Returns every task across every project where the current user is the assignee
// (delegated to them) OR they own the task and have it inside a project they participate in.
export const listMyAssignedTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    const { data: assigned, error } = await supabaseAdmin
      .from("tasks")
      .select(
        "id,title,description,category,status,completed,scheduled_date,duration_minutes,assignee_id,user_id,project_id,non_negotiable",
      )
      .eq("assignee_id", userId)
      .not("project_id", "is", null)
      .order("scheduled_date", { ascending: true });

    if (error) throw new Error(error.message);

    const projectIds = Array.from(
      new Set((assigned ?? []).map((t) => t.project_id).filter(Boolean) as string[]),
    );

    const ownerIds = Array.from(
      new Set((assigned ?? []).map((t) => t.user_id).filter((id) => id && id !== userId)),
    );

    const [{ data: projects }, { data: owners }] = await Promise.all([
      projectIds.length
        ? supabaseAdmin.from("projects").select("id,name,color,icon").in("id", projectIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string; color: string | null; icon: string | null }> }),
      ownerIds.length
        ? supabaseAdmin.from("profiles").select("user_id,display_name,email").in("user_id", ownerIds)
        : Promise.resolve({ data: [] as Array<{ user_id: string; display_name: string | null; email: string | null }> }),
    ]);

    const projectById = new Map((projects ?? []).map((p) => [p.id, p]));
    const ownerById = new Map((owners ?? []).map((o) => [o.user_id, o]));

    const rows: MyTaskRow[] = (assigned ?? []).map((t) => {
      const owner = t.user_id !== userId ? ownerById.get(t.user_id) : undefined;
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
        non_negotiable: (t as { non_negotiable?: boolean | null }).non_negotiable ?? null,
        project: projectById.get(t.project_id as string)
          ? {
              id: projectById.get(t.project_id as string)!.id,
              name: projectById.get(t.project_id as string)!.name,
              color: projectById.get(t.project_id as string)!.color,
              icon: projectById.get(t.project_id as string)!.icon,
            }
          : null,
        delegated_by_name: owner?.display_name ?? owner?.email ?? null,
      };
    });

    return { tasks: rows };
  });
