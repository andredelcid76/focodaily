import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getValidOutlookAccessToken } from "@/lib/outlook-token";

async function getAccessToken(userId: string): Promise<string> {
  const { data: conn, error } = await supabaseAdmin
    .from("outlook_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!conn) throw new Error("Microsoft não está conectado. Conecte na Agenda.");

  // Check Tasks scope
  if (!String(conn.scope ?? "").toLowerCase().includes("tasks.readwrite")) {
    throw new Error("PLANNER_REAUTH_REQUIRED");
  }

  const accessToken = await getValidOutlookAccessToken(userId, conn);
  return accessToken;
}

async function graph(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`Graph ${res.status}: ${text}`);
  return json;
}

/** Lista todos os Plans acessíveis ao usuário. */
export const listPlannerPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const token = await getAccessToken(context.userId);
    const allPlans: { id: string; title: string; groupName: string; groupId: string }[] = [];
    const seen = new Set<string>();
    const errors: string[] = [];

    // 1) Plans diretamente acessíveis ao usuário (não precisa de Group.Read.All com consent)
    try {
      const mine = await graph(token, "/me/planner/plans");
      for (const p of mine.value ?? []) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        allPlans.push({
          id: p.id,
          title: p.title ?? "(sem título)",
          groupName: "Meus planos",
          groupId: p.container?.containerId ?? "",
        });
      }
    } catch (e) {
      const msg = (e as Error).message;
      console.error("[planner] /me/planner/plans falhou:", msg);
      errors.push(`me/planner/plans: ${msg}`);
    }

    // 2) Também tenta via grupos (Plans em que o usuário é membro do grupo)
    try {
      const groupsRes = await graph(
        token,
        "/me/memberOf/microsoft.graph.group?$select=id,displayName&$top=100",
      );
      const groups = (groupsRes.value ?? []) as Array<{ id: string; displayName?: string }>;
      for (const g of groups) {
        try {
          const plans = await graph(token, `/groups/${g.id}/planner/plans`);
          for (const p of plans.value ?? []) {
            if (seen.has(p.id)) continue;
            seen.add(p.id);
            allPlans.push({
              id: p.id,
              title: p.title ?? "(sem título)",
              groupName: g.displayName ?? "Grupo",
              groupId: g.id,
            });
          }
        } catch {
          // grupo sem planner ou sem permissão — ignora
        }
      }
    } catch (e) {
      const msg = (e as Error).message;
      console.error("[planner] /me/memberOf falhou:", msg);
      errors.push(`me/memberOf: ${msg}`);
    }

    // Se nada funcionou, propaga o erro pra UI mostrar mensagem útil
    if (allPlans.length === 0 && errors.length > 0) {
      throw new Error(`Não foi possível listar Plans. ${errors.join(" | ")}`);
    }

    return { plans: allPlans };
  });

/** Vincula um Plan ao projeto e marca o sync. */
export const linkPlannerPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { projectId: string; planId: string | null }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("projects")
      .update({ planner_plan_id: data.planId, planner_synced_at: null })
      .eq("id", data.projectId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Importa tarefas do Plan vinculado como subtarefas do projeto. */
export const importPlannerTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { projectId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!project?.planner_plan_id) throw new Error("Projeto não está vinculado a um Plan");

    const token = await getAccessToken(context.userId);
    const tasksRes = await graph(token, `/planner/plans/${project.planner_plan_id}/tasks`);
    const plannerTasks = (tasksRes.value ?? []) as any[];

    const today = new Date().toISOString().slice(0, 10);
    let created = 0, updated = 0;

    for (const pt of plannerTasks) {
      const existing = await supabaseAdmin
        .from("tasks")
        .select("id")
        .eq("user_id", context.userId)
        .eq("planner_task_id", pt.id)
        .maybeSingle();

      const dueDate = pt.dueDateTime ? pt.dueDateTime.slice(0, 10) : today;
      const completed = pt.percentComplete === 100;
      const payload = {
        user_id: context.userId,
        project_id: project.id,
        title: pt.title || "(sem título)",
        completed,
        completed_at: completed ? new Date().toISOString() : null,
        scheduled_date: dueDate,
        category: "important" as const,
        planner_task_id: pt.id,
        planner_etag: pt["@odata.etag"] ?? null,
      };

      if (existing.data) {
        await supabaseAdmin.from("tasks").update(payload).eq("id", existing.data.id);
        updated++;
      } else {
        await supabaseAdmin.from("tasks").insert({ ...payload, original_date: dueDate });
        created++;
      }
    }

    await supabaseAdmin
      .from("projects")
      .update({ planner_synced_at: new Date().toISOString() })
      .eq("id", project.id);

    return { created, updated, total: plannerTasks.length };
  });

/** Marca uma tarefa como concluída no Planner (push). */
export const pushTaskCompletionToPlanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { taskId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: task } = await supabaseAdmin
      .from("tasks")
      .select("*")
      .eq("id", data.taskId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!task?.planner_task_id) return { skipped: true };

    const token = await getAccessToken(context.userId);
    // Precisa do etag mais recente
    const current = await graph(token, `/planner/tasks/${task.planner_task_id}`);
    const etag = current["@odata.etag"];
    await graph(token, `/planner/tasks/${task.planner_task_id}`, {
      method: "PATCH",
      headers: { "If-Match": etag },
      body: JSON.stringify({ percentComplete: task.completed ? 100 : 0 }),
    });
    await supabaseAdmin.from("tasks").update({ planner_etag: etag }).eq("id", task.id);
    return { ok: true };
  });
