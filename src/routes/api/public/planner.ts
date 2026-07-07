import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { getValidOutlookAccessToken } from "@/lib/outlook-token";

const actionSchema = z.object({
  action: z.enum(["listPlans", "linkPlan", "importTasks"]),
  projectId: z.string().uuid().optional(),
  planId: z.string().nullable().optional(),
});

export const Route = createFileRoute("/api/public/planner")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { userId } = await authenticateRequest(request);
          const payload = actionSchema.parse(await request.json());

          if (payload.action === "listPlans") {
            const token = await getAccessToken(userId);
            return json({ plans: await fetchPlans(token) });
          }

          if (!payload.projectId) {
            return json({ error: "Projeto inválido" }, 400);
          }

          if (payload.action === "linkPlan") {
            const { error } = await supabaseAdmin
              .from("projects")
              .update({ planner_plan_id: payload.planId ?? null, planner_synced_at: null })
              .eq("id", payload.projectId)
              .eq("user_id", userId);

            if (error) {
              console.error("[planner] linkPlan failed", error);
              return json({ error: "Erro interno" }, 500);
            }
            return json({ ok: true });
          }

          const result = await importProjectTasks(userId, payload.projectId);
          return json(result);
        } catch (error) {
          return handleRouteError(error);
        }
      },
    },
  },
});

async function authenticateRequest(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Missing backend environment variables");
  }

  const token = authHeader.slice("Bearer ".length);
  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return { userId: data.claims.sub };
}

async function getAccessToken(userId: string) {
  const { data: conn, error } = await supabaseAdmin
    .from("outlook_connections")
    .select("access_token, refresh_token, expires_at, scope")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!conn) throw new Error("Microsoft não está conectado. Conecte na Agenda.");
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
  const jsonResponse = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`Graph ${res.status}: ${text}`);
  return jsonResponse;
}

async function fetchPlans(token: string) {
  const allPlans: { id: string; title: string; groupName: string; groupId: string }[] = [];
  const seen = new Set<string>();
  const errors: string[] = [];

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
    errors.push((e as Error).message);
  }

  try {
    const groupsRes = await graph(token, "/me/memberOf/microsoft.graph.group?$select=id,displayName&$top=100");
    for (const g of (groupsRes.value ?? []) as Array<{ id: string; displayName?: string }>) {
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
        // ignore group without planner access
      }
    }
  } catch (e) {
    errors.push((e as Error).message);
  }

  if (allPlans.length === 0 && errors.length > 0) {
    throw new Error(`Não foi possível listar Plans. ${errors.join(" | ")}`);
  }

  return allPlans;
}

async function importProjectTasks(userId: string, projectId: string) {
  const { data: project, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("id, planner_plan_id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (projectError) throw new Error(projectError.message);
  if (!project?.planner_plan_id) throw new Error("Projeto não está vinculado a um Plan");

  const token = await getAccessToken(userId);
  const tasksRes = await graph(token, `/planner/plans/${project.planner_plan_id}/tasks`);
  const plannerTasks = (tasksRes.value ?? []) as any[];
  const today = new Date().toISOString().slice(0, 10);
  let created = 0;
  let updated = 0;

  for (const pt of plannerTasks) {
    const existing = await supabaseAdmin
      .from("tasks")
      .select("id")
      .eq("user_id", userId)
      .eq("planner_task_id", pt.id)
      .maybeSingle();

    const dueDate = pt.dueDateTime ? pt.dueDateTime.slice(0, 10) : today;
    const completed = pt.percentComplete === 100;
    const payload = {
      user_id: userId,
      project_id: project.id,
      title: pt.title || "(sem título)",
      completed,
      completed_at: completed ? new Date().toISOString() : null,
      scheduled_date: dueDate,
      category: "important" as const,
      planner_task_id: pt.id,
      planner_etag: pt["@odata.etag"] ?? null,
    };

    if (existing.data?.id) {
      await supabaseAdmin.from("tasks").update(payload).eq("id", existing.data.id);
      updated += 1;
    } else {
      await supabaseAdmin.from("tasks").insert({ ...payload, original_date: dueDate });
      created += 1;
    }
  }

  await supabaseAdmin
    .from("projects")
    .update({ planner_synced_at: new Date().toISOString() })
    .eq("id", project.id)
    .eq("user_id", userId);

  return { created, updated, total: plannerTasks.length };
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function handleRouteError(error: unknown) {
  if (error instanceof Response) return error;
  if (error instanceof z.ZodError) return json({ error: "Requisição inválida" }, 400);
  console.error("[planner route] internal error", error);
  return json({ error: "Erro interno" }, 500);
}