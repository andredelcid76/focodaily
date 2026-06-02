import { defineTool } from "mcp-tanstack-start";
import { z } from "zod";
import { db, getUserId } from "../supabase";

const FIREFLIES_URL = "https://api.fireflies.ai/graphql";

export const listRoles = defineTool({
  name: "list_roles",
  description: "Lista os papéis do usuário (CEO, Pessoal, etc) com id, nome e cor.",
  parameters: z.object({}),
  execute: async (_args, ctx) => {
    const userId = getUserId(ctx.auth);
    const { data, error } = await db()
      .from("roles")
      .select("id,name,color,position")
      .eq("user_id", userId)
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return JSON.stringify(data ?? []);
  },
});

export const listTasks = defineTool({
  name: "list_tasks",
  description:
    "Lista tarefas do usuário com filtros opcionais. Útil para perguntar 'o que tenho pra hoje', ver atrasos, próximos dias, ou tarefas de um projeto. Cada tarefa inclui role (papel) e project (projeto) com nome.",
  parameters: z.object({
    from_date: z.string().optional().describe("Data inicial YYYY-MM-DD"),
    to_date: z.string().optional().describe("Data final YYYY-MM-DD"),
    only_open: z.boolean().optional().describe("Se true, retorna só não-concluídas"),
    project_id: z.string().optional(),
    limit: z.number().optional().describe("Padrão 100, máximo 500"),
  }),
  execute: async (args, ctx) => {
    const userId = getUserId(ctx.auth);
    let q = db()
      .from("tasks")
      .select(
        "id,title,description,scheduled_date,duration_minutes,category,status,completed,project_id,role_id,recurrence,non_negotiable,role:roles(id,name,color),project:projects(id,name,color)",
      )
      .eq("user_id", userId)
      .order("scheduled_date", { ascending: true })
      .limit(Math.min(args.limit ?? 100, 500));
    if (args.from_date) q = q.gte("scheduled_date", args.from_date);
    if (args.to_date) q = q.lte("scheduled_date", args.to_date);
    if (args.only_open) q = q.eq("completed", false);
    if (args.project_id) q = q.eq("project_id", args.project_id);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return JSON.stringify(data ?? []);
  },
});

export const createProject = defineTool({
  name: "create_project",
  description:
    "Cria um novo projeto. Use antes de criar tarefas que pertencem a um projeto que ainda não existe. Retorna o projeto criado (com id) para reutilizar em create_task.",
  parameters: z.object({
    name: z.string().min(1).max(200),
    description: z.string().optional(),
    color: z.string().optional().describe("Hex tipo #8b5cf6. Padrão violet."),
    role_id: z.string().optional().describe("ID do papel associado (use list_roles)."),
    status: z.enum(["draft", "active", "paused", "done", "archived"]).optional(),
    starts_on: z.string().optional().describe("YYYY-MM-DD"),
    deadline: z.string().optional().describe("YYYY-MM-DD"),
  }),
  execute: async (args, ctx) => {
    const userId = getUserId(ctx.auth);
    const insert = {
      user_id: userId,
      name: args.name,
      description: args.description ?? null,
      color: args.color ?? "#8b5cf6",
      role_id: args.role_id ?? null,
      status: args.status ?? "active",
      starts_on: args.starts_on ?? null,
      deadline: args.deadline ?? null,
    };
    const { data, error } = await db().from("projects").insert(insert as never).select().single();
    if (error) throw new Error(error.message);
    return JSON.stringify({ ok: true, project: data });
  },
});

export const listProjects = defineTool({
  name: "list_projects",
  description: "Lista projetos do usuário (id, nome, status, prazo, papel associado).",
  parameters: z.object({}),
  execute: async (_args, ctx) => {
    const userId = getUserId(ctx.auth);
    const { data, error } = await db()
      .from("projects")
      .select("id,name,description,status,deadline,starts_on,color,role_id,role:roles(id,name,color)")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return JSON.stringify(data ?? []);
  },
});

export const updateProject = defineTool({
  name: "update_project",
  description:
    "Atualiza um projeto existente: renomear, mudar status, prazos, cor, descrição ou papel associado.",
  parameters: z.object({
    id: z.string(),
    name: z.string().min(1).max(200).optional(),
    description: z.string().nullable().optional(),
    color: z.string().optional(),
    role_id: z.string().nullable().optional(),
    status: z.enum(["draft", "active", "paused", "done", "archived"]).optional(),
    starts_on: z.string().nullable().optional().describe("YYYY-MM-DD ou null"),
    deadline: z.string().nullable().optional().describe("YYYY-MM-DD ou null"),
  }),
  execute: async (args, ctx) => {
    const userId = getUserId(ctx.auth);
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.description !== undefined) patch.description = args.description;
    if (args.color !== undefined) patch.color = args.color;
    if (args.role_id !== undefined) patch.role_id = args.role_id;
    if (args.status !== undefined) patch.status = args.status;
    if (args.starts_on !== undefined) patch.starts_on = args.starts_on;
    if (args.deadline !== undefined) patch.deadline = args.deadline;
    const { data, error } = await db()
      .from("projects")
      .update(patch as never)
      .eq("id", args.id)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return JSON.stringify({ ok: true, project: data });
  },
});

export const deleteProject = defineTool({
  name: "delete_project",
  description: "Exclui um projeto do usuário. As tarefas vinculadas ficam sem projeto (project_id = null).",
  parameters: z.object({ id: z.string() }),
  execute: async (args, ctx) => {
    const userId = getUserId(ctx.auth);
    const { error } = await db().from("projects").delete().eq("id", args.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return JSON.stringify({ ok: true });
  },
});

export const listMeetings = defineTool({
  name: "list_meetings",
  description: "Lista reuniões da agenda em um intervalo de datas.",
  parameters: z.object({
    from_date: z.string().optional(),
    to_date: z.string().optional(),
  }),
  execute: async (args, ctx) => {
    const userId = getUserId(ctx.auth);
    let q = db()
      .from("meetings")
      .select("id,title,description,starts_at,ends_at,scheduled_date,project_id,location")
      .eq("user_id", userId)
      .order("starts_at", { ascending: true })
      .limit(200);
    if (args.from_date) q = q.gte("scheduled_date", args.from_date);
    if (args.to_date) q = q.lte("scheduled_date", args.to_date);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return JSON.stringify(data ?? []);
  },
});

export const createTask = defineTool({
  name: "create_task",
  description: "Cria uma nova tarefa para o usuário.",
  parameters: z.object({
    title: z.string().min(1).max(500),
    description: z.string().optional(),
    scheduled_date: z.string().describe("YYYY-MM-DD"),
    duration_minutes: z.number().optional().describe("5, 15, 30, 60, 90 ou 120. Padrão 30."),
    category: z.enum(["urgent", "important", "circumstantial"]).optional(),
    project_id: z.string().optional(),
    role_id: z.string().optional(),
  }),
  execute: async (args, ctx) => {
    const userId = getUserId(ctx.auth);
    const insert = {
      user_id: userId,
      title: args.title,
      description: args.description ?? null,
      scheduled_date: args.scheduled_date,
      original_date: args.scheduled_date,
      duration_minutes: args.duration_minutes ?? 30,
      category: args.category ?? "important",
      project_id: args.project_id ?? null,
      role_id: args.role_id ?? null,
    };
    const { data, error } = await db().from("tasks").insert(insert as never).select().single();
    if (error) throw new Error(error.message);
    return JSON.stringify({ ok: true, task: data });
  },
});

export const updateTask = defineTool({
  name: "update_task",
  description: "Atualiza uma tarefa existente: mover de data, mudar título, concluir, recategorizar etc.",
  parameters: z.object({
    id: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    scheduled_date: z.string().optional(),
    duration_minutes: z.number().optional(),
    category: z.enum(["urgent", "important", "circumstantial"]).optional(),
    completed: z.boolean().optional(),
    project_id: z.string().nullable().optional(),
  }),
  execute: async (args, ctx) => {
    const userId = getUserId(ctx.auth);
    const patch: Record<string, unknown> = {};
    if (args.title !== undefined) patch.title = args.title;
    if (args.description !== undefined) patch.description = args.description;
    if (args.scheduled_date !== undefined) patch.scheduled_date = args.scheduled_date;
    if (args.duration_minutes !== undefined) patch.duration_minutes = args.duration_minutes;
    if (args.category !== undefined) patch.category = args.category;
    if (args.project_id !== undefined) patch.project_id = args.project_id;
    if (args.completed !== undefined) {
      patch.completed = args.completed;
      patch.status = args.completed ? "done" : "todo";
      patch.completed_at = args.completed ? new Date().toISOString() : null;
    }
    const { data, error } = await db()
      .from("tasks")
      .update(patch as never)
      .eq("id", args.id)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return JSON.stringify({ ok: true, task: data });
  },
});

export const deleteTask = defineTool({
  name: "delete_task",
  description: "Exclui uma tarefa do usuário.",
  parameters: z.object({ id: z.string() }),
  execute: async (args, ctx) => {
    const userId = getUserId(ctx.auth);
    const { error } = await db().from("tasks").delete().eq("id", args.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return JSON.stringify({ ok: true });
  },
});

async function fireflies(userId: string, query: string, variables: Record<string, unknown>) {
  const { data: conn } = await db()
    .from("fireflies_connections")
    .select("api_key")
    .eq("user_id", userId)
    .maybeSingle();
  const ffKey = (conn?.api_key as string | undefined) ?? undefined;
  if (!ffKey) throw new Error("Fireflies não conectado — conecte sua chave em Integrações no Foco");
  const r = await fetch(FIREFLIES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ffKey}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Fireflies ${r.status}: ${t.slice(0, 300)}`);
  }
  return r.json();
}

export const listFirefliesMeetings = defineTool({
  name: "list_fireflies_meetings",
  description: "Lista as últimas reuniões transcritas do Fireflies (id, título, data, action items).",
  parameters: z.object({ limit: z.number().optional().describe("Padrão 10") }),
  execute: async (args, _ctx) => {
    const limit = args.limit ?? 10;
    const result = await fireflies(
      `query Last($limit: Int) {
        transcripts(limit: $limit) {
          id title date duration host_email
          summary { keywords action_items overview }
        }
      }`,
      { limit },
    );
    return JSON.stringify(result?.data?.transcripts ?? []);
  },
});

export const getFirefliesTranscript = defineTool({
  name: "get_fireflies_transcript",
  description: "Pega o conteúdo completo de uma reunião do Fireflies (sumário, action items e transcrição).",
  parameters: z.object({ transcript_id: z.string() }),
  execute: async (args, _ctx) => {
    const result = await fireflies(
      `query One($id: String!) {
        transcript(id: $id) {
          id title date duration host_email
          sentences { speaker_name text }
          summary { keywords action_items overview shorthand_bullet }
        }
      }`,
      { id: args.transcript_id },
    );
    const t = result?.data?.transcript;
    if (!t) return JSON.stringify({ error: "Transcript não encontrado" });
    const sentences = (t.sentences ?? [])
      .map((s: { speaker_name?: string; text: string }) => `${s.speaker_name ?? "?"}: ${s.text}`)
      .join("\n");
    return JSON.stringify({
      id: t.id,
      title: t.title,
      date: t.date,
      duration: t.duration,
      summary: t.summary,
      transcript: sentences.slice(0, 12000),
    });
  },
});

export const allTools = [
  listTasks,
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  listRoles,
  listMeetings,
  createTask,
  updateTask,
  deleteTask,
  listFirefliesMeetings,
  getFirefliesTranscript,
];
