import { defineTool } from "mcp-tanstack-start";
import { z } from "zod";
import { adminDb, db, getUserId } from "../supabase";

const FIREFLIES_URL = "https://api.fireflies.ai/graphql";

// ---------------------------------------------------------------------------
// Autorização do servidor MCP
//
// IMPORTANTE: db() usa a service_role key, que IGNORA (bypassa) toda a RLS.
// Logo, a RLS NÃO protege este cliente — qualquer acesso a dados escopados por
// projeto/papel precisa validar posse EXPLICITAMENTE aqui. Este é o mesmo
// motivo documentado em add_task_dependency, agora aplicado de forma
// consistente em list_tasks, create_task e update_task.
// ---------------------------------------------------------------------------

/** Garante que o usuário é dono OU membro do projeto. Lança se não for. */
async function assertProjectAccess(auth: unknown, projectId: string, userId: string): Promise<void> {
  const client = db(auth);
  const [memberRes, ownerRes] = await Promise.all([
    client.rpc("is_project_member", { _project_id: projectId, _user_id: userId }),
    client.rpc("is_project_owner", { _project_id: projectId, _user_id: userId }),
  ]);
  if (memberRes.error) throw new Error(memberRes.error.message);
  if (ownerRes.error) throw new Error(ownerRes.error.message);
  if (!memberRes.data && !ownerRes.data) {
    throw new Error("Sem acesso a este projeto.");
  }
}

/** Garante que o papel (role) pertence ao usuário. Lança se não pertencer. */
async function assertRoleOwnership(auth: unknown, roleId: string, userId: string): Promise<void> {
  const { data, error } = await db(auth)
    .from("roles")
    .select("id")
    .eq("id", roleId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Papel inexistente ou sem acesso.");
}

/** Garante que assignee_id pode receber a tarefa (dono, membro do projeto ou membro da equipe do projeto). */
async function assertAssigneeAllowed(
  auth: unknown,
  assigneeId: string,
  projectId: string | null | undefined,
  taskOwnerId: string,
): Promise<void> {
  if (assigneeId === taskOwnerId) return;
  if (!projectId) {
    const actorId = getUserId(auth);
    const { data, error } = await db(auth).from("contacts").select("id")
      .or(`and(owner_id.eq.${actorId},contact_id.eq.${assigneeId}),and(owner_id.eq.${assigneeId},contact_id.eq.${actorId})`)
      .limit(1);
    if (error) throw new Error(error.message);
    if (data?.length) return;
    // Existing collaborators are eligible even when the task has no project.
    // Scope candidates to the actor before checking the target; never list all users.
    const client = db(auth);
    const [ownedTeams, memberships, ownedProjects, projectMemberships] = await Promise.all([
      client.from("teams").select("id").eq("owner_id", actorId),
      client.from("team_members").select("team_id").eq("user_id", actorId),
      client.from("projects").select("id").eq("user_id", actorId),
      client.from("project_members").select("project_id").eq("user_id", actorId),
    ]);
    for (const result of [ownedTeams, memberships, ownedProjects, projectMemberships]) {
      if (result.error) throw new Error(result.error.message);
    }
    const teamIds = [...new Set([...(ownedTeams.data ?? []).map(t => t.id), ...(memberships.data ?? []).map(t => t.team_id)])];
    for (const teamId of teamIds) {
      const result = await client.rpc("is_team_member", { _team_id: teamId, _user_id: assigneeId });
      if (result.error) throw new Error(result.error.message);
      if (result.data) return;
    }
    const projectIds = new Set([...(ownedProjects.data ?? []).map(p => p.id), ...(projectMemberships.data ?? []).map(p => p.project_id)]);
    if (teamIds.length) {
      const result = await client.from("projects").select("id").in("team_id", teamIds);
      if (result.error) throw new Error(result.error.message);
      result.data?.forEach(p => projectIds.add(p.id));
    }
    for (const projectId of projectIds) {
      const result = await client.rpc("is_project_member", { _project_id: projectId, _user_id: assigneeId });
      if (result.error) throw new Error(result.error.message);
      if (result.data) return;
    }
    throw new Error("Para delegar sem projeto, escolha um colaborador ou convide a pessoa em Pessoas; não é necessário criar uma equipe.");
  }
  const client = db(auth);
  const [memberRes, ownerRes] = await Promise.all([
    client.rpc("is_project_member", { _project_id: projectId, _user_id: assigneeId }),
    client.rpc("is_project_owner", { _project_id: projectId, _user_id: assigneeId }),
  ]);
  if (!memberRes.data && !ownerRes.data) {
    throw new Error("assignee_id não é membro do projeto nem da equipe do projeto.");
  }
}

/** Respeita members_can_reassign: se false, só dono da tarefa/projeto (ou gestor) atribui. */
async function assertCanAssign(
  auth: unknown,
  userId: string,
  projectId: string | null | undefined,
  taskOwnerId: string,
): Promise<void> {
  if (userId === taskOwnerId) return;
  if (!projectId) throw new Error("Somente o dono da tarefa pode alterar o responsável.");
  const client = db(auth);
  const { data: project } = await client
    .from("projects")
    .select("user_id,members_can_reassign")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) throw new Error("Projeto não encontrado.");
  if (project.user_id === userId) return;
  const admin = await client.rpc("is_project_admin", { _project_id: projectId, _user_id: userId });
  if (admin.data) return;
  if (!project.members_can_reassign) {
    throw new Error("Este projeto só permite que o dono/gestor atribua ou reatribua tarefas.");
  }
}

const taskStatusEnum = z.enum(["todo", "doing", "in_progress", "blocked", "done"]);

/** Escala de prioridade documentada no schema para clientes MCP. */
const PRIORITY_DOC =
  "Prioridade (número inteiro de 1 a 5, quanto MAIOR mais urgente): 5=Crítica, 4=Alta, 3=Média (padrão), 2=Baixa, 1=Muito baixa.";

export const listRoles = defineTool({
  name: "list_roles",
  description: "Lista os papéis do usuário (CEO, Pessoal, etc) com id, nome e cor.",
  parameters: z.object({}),
  execute: async (_args, ctx) => {
    const userId = getUserId(ctx.auth);
    const { data, error } = await db(ctx.auth)
      .from("roles")
      .select("id,name,color,position")
      .eq("user_id", userId)
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return JSON.stringify(data ?? []);
  },
});

export const createRole = defineTool({
  name: "create_role",
  description: "Cria um novo papel para o usuário (ex: CEO, Pessoal, Head de Vendas).",
  parameters: z.object({
    name: z.string().min(1).max(100),
    color: z.string().optional().describe("Hex tipo #8b5cf6. Padrão violet."),
    position: z.coerce.number().int().optional(),
  }),
  execute: async (args, ctx) => {
    const userId = getUserId(ctx.auth);
    const { data, error } = await db(ctx.auth)
      .from("roles")
      .insert({
        user_id: userId,
        name: args.name,
        color: args.color ?? "#8b5cf6",
        position: args.position ?? 0,
      } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return JSON.stringify({ ok: true, role: data });
  },
});

export const updateRole = defineTool({
  name: "update_role",
  description: "Atualiza um papel existente (renomear, mudar cor ou posição).",
  parameters: z.object({
    id: z.string(),
    name: z.string().min(1).max(100).optional(),
    color: z.string().optional(),
    position: z.coerce.number().int().optional(),
  }),
  execute: async (args, ctx) => {
    const userId = getUserId(ctx.auth);
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.color !== undefined) patch.color = args.color;
    if (args.position !== undefined) patch.position = args.position;
    const { data, error } = await db(ctx.auth)
      .from("roles")
      .update(patch as never)
      .eq("id", args.id)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return JSON.stringify({ ok: true, role: data });
  },
});

export const deleteRole = defineTool({
  name: "delete_role",
  description: "Exclui um papel do usuário. As tarefas vinculadas perderão essa associação.",
  parameters: z.object({ id: z.string() }),
  execute: async (args, ctx) => {
    const userId = getUserId(ctx.auth);
    const { error } = await db(ctx.auth)
      .from("roles")
      .delete()
      .eq("id", args.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return JSON.stringify({ ok: true });
  },
});

export const listTasks = defineTool({
  name: "list_tasks",
  description:
    "Lista tarefas visíveis para o usuário: criadas por ele, delegadas a ele (assignee_id) ou de projetos compartilhados dos quais participa. RLS do banco garante o filtro. Cada item inclui role, project (com dono), assignee e creator.",
  parameters: z.object({
    from_date: z.string().optional().describe("Data inicial YYYY-MM-DD"),
    to_date: z.string().optional().describe("Data final YYYY-MM-DD"),
    only_open: z.boolean().optional().describe("Se true, retorna só não-concluídas"),
    project_id: z.string().optional(),
    assigned_to_me: z
      .boolean()
      .optional()
      .describe("Se true, retorna só tarefas onde o usuário é o responsável (assignee_id)."),
    created_by_me: z
      .boolean()
      .optional()
      .describe("Se true, retorna só tarefas criadas pelo usuário (user_id)."),
    assignee_id: z.string().optional().describe("Filtra por responsável específico."),
    delegated_by_me: z
      .boolean()
      .optional()
      .describe("Se true, só tarefas criadas por mim cuja responsabilidade é de outra pessoa."),
    status: z
      .union([taskStatusEnum, z.array(taskStatusEnum)])
      .optional()
      .describe("Filtra por um ou mais status."),
    backlog_only: z.boolean().optional().describe("Se true, só tarefas SEM data (backlog)."),
    include_backlog: z
      .boolean()
      .optional()
      .describe("Se true, inclui tarefas sem data mesmo com filtros de data."),
    compact: z
      .boolean()
      .optional()
      .describe("Resposta enxuta: id, título, data, status, responsável e projeto."),
    priority: z
      .union([z.coerce.number().int().min(1).max(5), z.array(z.coerce.number().int().min(1).max(5))])
      .optional()
      .describe("Filtra por um ou mais níveis de prioridade (1 a 5)."),
    limit: z.coerce.number().optional().describe("Padrão 100, máximo 500"),
    offset: z.coerce.number().optional().describe("Deslocamento para paginação. Padrão 0."),
  }),
  execute: async (args, ctx) => {
    const userId = getUserId(ctx.auth);
    const selectCols =
      "id,title,description,scheduled_date,duration_minutes,category,status,blocked_reason,completed,project_id,role_id,recurrence,non_negotiable,user_id,assignee_id,created_at,updated_at,postpone_count,original_date,backlog_position,priority,role:roles(id,name,color),project:projects(id,name,color,user_id)";
    const limit = Math.min(args.limit ?? 100, 500);
    const offset = Math.max(args.offset ?? 0, 0);
    let q = db(ctx.auth)
      .from("tasks")
      .select(selectCols, { count: "exact" })
      .order("scheduled_date", { ascending: true, nullsFirst: false })
      .range(offset, offset + limit - 1);
    if (args.assigned_to_me) {
      q = q.eq("assignee_id", userId);
    } else if (args.created_by_me) {
      q = q.eq("user_id", userId);
    } else if (args.project_id) {
      // service_role bypassa a RLS, então a posse do projeto precisa ser
      // verificada aqui — sem isso, qualquer project_id vaza as tarefas alheias.
      await assertProjectAccess(ctx.auth, args.project_id, userId);
    } else {
      // Widen beyond owner-only so delegated tasks come through. Shared-project
      // browsing should pass project_id explicitly.
      q = q.or(`user_id.eq.${userId},assignee_id.eq.${userId}`);
    }
    if (args.backlog_only) {
      q = q.is("scheduled_date", null);
    } else if (args.include_backlog && (args.from_date || args.to_date)) {
      const range = [
        args.from_date ? `scheduled_date.gte.${args.from_date}` : null,
        args.to_date ? `scheduled_date.lte.${args.to_date}` : null,
      ].filter(Boolean) as string[];
      q = q.or(`scheduled_date.is.null,and(${range.join(",")})`);
    } else {
      if (args.from_date) q = q.gte("scheduled_date", args.from_date);
      if (args.to_date) q = q.lte("scheduled_date", args.to_date);
    }
    if (args.only_open) q = q.eq("completed", false);
    if (args.project_id) q = q.eq("project_id", args.project_id);
    if (args.assignee_id) q = q.eq("assignee_id", args.assignee_id);
    if (args.delegated_by_me) {
      q = q.eq("user_id", userId).not("assignee_id", "is", null).neq("assignee_id", userId);
    }
    if (args.priority !== undefined) {
      const prios = Array.isArray(args.priority) ? args.priority : [args.priority];
      q = q.in("priority", prios);
    }
    if (args.status) {
      const statuses = Array.isArray(args.status) ? args.status : [args.status];
      q = q.in("status", statuses);
    }
    const { data, error, count } = await q;
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    // Enrich assignee/creator/project-owner with display_name via a batched
    // profiles lookup (FKs go to auth.users, so PostgREST embed isn't available).
    const userIds = new Set<string>();
    for (const r of rows as Array<{ user_id?: string | null; assignee_id?: string | null; project?: { user_id?: string | null } | null }>) {
      if (r.user_id) userIds.add(r.user_id);
      if (r.assignee_id) userIds.add(r.assignee_id);
      if (r.project?.user_id) userIds.add(r.project.user_id);
    }
    let profileMap = new Map<string, { display_name: string | null; email: string | null }>();
    if (userIds.size > 0) {
      const { data: profs } = await db(ctx.auth)
        .from("profiles")
        .select("user_id,display_name,email")
        .in("user_id", Array.from(userIds));
      profileMap = new Map((profs ?? []).map((p) => [p.user_id as string, { display_name: p.display_name, email: p.email }]));
    }
    // Contagem de comentários por tarefa (PostgREST não agrupa: contamos aqui).
    const taskIds = (rows as Array<{ id?: string }>).map((r) => r.id).filter(Boolean) as string[];
    const commentCount = new Map<string, number>();
    if (taskIds.length > 0) {
      const { data: commentRows } = await db(ctx.auth)
        .from("task_comments")
        .select("task_id")
        .in("task_id", taskIds);
      for (const c of commentRows ?? []) {
        const key = c.task_id as string;
        commentCount.set(key, (commentCount.get(key) ?? 0) + 1);
      }
    }
    const enriched = (rows as Array<Record<string, unknown>>).map((r) => {
      const rr = r as {
        id?: string;
        user_id?: string | null;
        assignee_id?: string | null;
        project?: { id?: string; name?: string; user_id?: string | null } | null;
      };
      const assignee = rr.assignee_id ? profileMap.get(rr.assignee_id) ?? null : null;
      const comments_count = rr.id ? commentCount.get(rr.id) ?? 0 : 0;
      if (args.compact) {
        return {
          id: rr.id,
          title: r.title,
          scheduled_date: r.scheduled_date,
          status: r.status ?? (r.completed ? "done" : "todo"),
          completed: r.completed,
          assignee_id: rr.assignee_id ?? null,
          assignee_name: assignee?.display_name ?? assignee?.email ?? null,
          project_id: rr.project?.id ?? null,
          project_name: rr.project?.name ?? null,
          priority: r.priority ?? 3,
          comments_count,
        };
      }
      return {
        ...r,
        assignee,
        creator: rr.user_id ? profileMap.get(rr.user_id) ?? null : null,
        project_owner: rr.project?.user_id ? profileMap.get(rr.project.user_id) ?? null : null,
        comments_count,
      };
    });
    return JSON.stringify({ total: count ?? enriched.length, limit, offset, items: enriched });
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
    status: z.enum(["in_progress", "active", "paused", "not_started", "finished"]).optional(),
    starts_on: z.string().optional().describe("YYYY-MM-DD"),
    deadline: z.string().optional().describe("YYYY-MM-DD"),
  }),
  execute: async (args, ctx) => {
    const userId = getUserId(ctx.auth);
    if (args.role_id) await assertRoleOwnership(ctx.auth, args.role_id, userId);
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
    const { data, error } = await db(ctx.auth).from("projects").insert(insert as never).select().single();
    if (error) throw new Error(error.message);
    return JSON.stringify({ ok: true, project: data });
  },
});

/** Ids de projetos acessíveis ao usuário: dono, membro direto ou via equipe. */
async function accessibleProjectIds(auth: unknown, userId: string): Promise<string[]> {
  const client = db(auth);
  const ids = new Set<string>();

  const { data: owned } = await client.from("projects").select("id").eq("user_id", userId);
  for (const p of owned ?? []) ids.add(p.id as string);

  const { data: memberships } = await client
    .from("project_members")
    .select("project_id")
    .eq("user_id", userId);
  for (const m of memberships ?? []) ids.add(m.project_id as string);

  const { data: teamRows } = await client.from("team_members").select("team_id").eq("user_id", userId);
  const { data: ownedTeams } = await client.from("teams").select("id").eq("owner_id", userId);
  const teamIds = [
    ...(teamRows ?? []).map((t) => t.team_id as string),
    ...(ownedTeams ?? []).map((t) => t.id as string),
  ];
  if (teamIds.length > 0) {
    const { data: teamProjects } = await client.from("projects").select("id").in("team_id", teamIds);
    for (const p of teamProjects ?? []) ids.add(p.id as string);
  }

  return Array.from(ids);
}

const PROJECT_SELECT =
  "id,name,description,status,deadline,starts_on,color,role_id,user_id,team_id,members_can_reassign," +
  "role:roles(id,name,color),team:teams(id,name,color,owner_id)";

async function decorateProjects(auth: unknown, rows: any[]): Promise<any[]> {
  if (rows.length === 0) return [];
  const client = db(auth);
  const projectIds = rows.map((r) => r.id as string);

  const { data: members } = await client
    .from("project_members")
    .select("project_id,user_id,role")
    .in("project_id", projectIds);

  const userIds = new Set<string>();
  for (const r of rows) {
    userIds.add(r.user_id as string);
    if (r.team?.owner_id) userIds.add(r.team.owner_id as string);
  }
  for (const m of members ?? []) userIds.add(m.user_id as string);

  const { data: profiles } = await client
    .from("profiles")
    .select("user_id,display_name,email")
    .in("user_id", Array.from(userIds));
  const profileById = new Map((profiles ?? []).map((p) => [p.user_id as string, p]));
  const person = (uid: string | null | undefined) => {
    if (!uid) return null;
    const p = profileById.get(uid);
    return { user_id: uid, display_name: p?.display_name ?? null, email: p?.email ?? null };
  };

  return rows.map((r) => ({
    ...r,
    leader: person(r.user_id as string),
    team: r.team
      ? { id: r.team.id, name: r.team.name, color: r.team.color, owner: person(r.team.owner_id) }
      : null,
    members: (members ?? [])
      .filter((m) => m.project_id === r.id)
      .map((m) => ({ ...person(m.user_id as string), role: m.role })),
  }));
}

export const listProjects = defineTool({
  name: "list_projects",
  description:
    "Lista os projetos acessíveis ao usuário (dono, membro ou via equipe), incluindo líder (dono), equipe, papel associado e a lista de participantes com seus papéis.",
  parameters: z.object({
    status: z
      .union([
        z.enum(["in_progress", "active", "paused", "not_started", "finished"]),
        z.array(z.enum(["in_progress", "active", "paused", "not_started", "finished"])),
      ])
      .optional()
      .describe("Filtra por um ou mais status."),
    name: z.string().optional().describe("Filtro por parte do nome (case-insensitive)."),
    compact: z.boolean().optional().describe("Resposta enxuta: id, nome, status, deadline e líder."),
    limit: z.coerce.number().optional().describe("Padrão 200, máximo 500."),
    offset: z.coerce.number().optional().describe("Deslocamento para paginação. Padrão 0."),
  }),
  execute: async (args, ctx) => {
    const userId = getUserId(ctx.auth);
    const limit = Math.min(args.limit ?? 200, 500);
    const offset = Math.max(args.offset ?? 0, 0);
    const ids = await accessibleProjectIds(ctx.auth, userId);
    if (ids.length === 0) return JSON.stringify({ total: 0, limit, offset, items: [] });
    let q = db(ctx.auth)
      .from("projects")
      .select(PROJECT_SELECT, { count: "exact" })
      .in("id", ids)
      .order("name", { ascending: true })
      .range(offset, offset + limit - 1);
    if (args.status) {
      const statuses = Array.isArray(args.status) ? args.status : [args.status];
      q = q.in("status", statuses);
    }
    if (args.name) q = q.ilike("name", `%${args.name}%`);
    const { data, error, count } = await q;
    if (error) throw new Error(error.message);
    const decorated = await decorateProjects(ctx.auth, (data ?? []) as any[]);
    const items = args.compact
      ? decorated.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          deadline: p.deadline,
          leader: p.leader,
        }))
      : decorated;
    return JSON.stringify({ total: count ?? items.length, limit, offset, items });
  },
});

export const getProject = defineTool({
  name: "get_project",
  description:
    "Detalhes de um projeto específico: líder (dono), equipe, papel, prazos, configuração de reatribuição e participantes com seus papéis.",
  parameters: z.object({ id: z.string() }),
  execute: async (args, ctx) => {
    const userId = getUserId(ctx.auth);
    await assertProjectAccess(ctx.auth, args.id, userId);
    const { data, error } = await db(ctx.auth)
      .from("projects")
      .select(PROJECT_SELECT)
      .eq("id", args.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Projeto não encontrado.");
    const [decorated] = await decorateProjects(ctx.auth, [data as any]);
    return JSON.stringify(decorated);
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
    status: z.enum(["in_progress", "active", "paused", "not_started", "finished"]).optional(),
    starts_on: z.string().nullable().optional().describe("YYYY-MM-DD ou null"),
    deadline: z.string().nullable().optional().describe("YYYY-MM-DD ou null"),
  }),
  execute: async (args, ctx) => {
    const userId = getUserId(ctx.auth);
    if (args.role_id) await assertRoleOwnership(ctx.auth, args.role_id, userId);
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.description !== undefined) patch.description = args.description;
    if (args.color !== undefined) patch.color = args.color;
    if (args.role_id !== undefined) patch.role_id = args.role_id;
    if (args.status !== undefined) patch.status = args.status;
    if (args.starts_on !== undefined) patch.starts_on = args.starts_on;
    if (args.deadline !== undefined) patch.deadline = args.deadline;
    const { data, error } = await db(ctx.auth)
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
    const { error } = await db(ctx.auth).from("projects").delete().eq("id", args.id).eq("user_id", userId);
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
    let q = db(ctx.auth)
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

const recurrenceEnum = z.enum([
  "none",
  "daily",
  "weekdays",
  "weekly",
  "monthly",
  "yearly",
  "custom",
]);

export const createTask = defineTool({
  name: "create_task",
  description:
    "Cria uma nova tarefa para o usuário. Suporta recorrência (daily, weekdays, weekly, monthly, yearly, custom).",
  parameters: z.object({
    title: z.string().min(1).max(500),
    description: z.string().optional(),
    scheduled_date: z
      .string()
      .nullable()
      .optional()
      .describe("YYYY-MM-DD. Omita (ou null) para criar no BACKLOG, sem data marcada."),
    assignee_id: z
      .string()
      .optional()
      .describe("Responsável pela tarefa: contato para tarefas sem projeto, ou membro do projeto/equipe quando vinculada. Campo opcional."),
    duration_minutes: z.coerce.number().optional().describe("5, 15, 30, 60, 90 ou 120. Padrão 30."),
    category: z.enum(["urgent", "important", "circumstantial"]).optional(),
    priority: z.coerce.number().int().min(1).max(5).optional().describe(PRIORITY_DOC),
    status: taskStatusEnum
      .optional()
      .describe("todo (padrão), in_progress, blocked ou done. Com blocked, informe blocked_reason."),
    blocked_reason: z
      .string()
      .nullable()
      .optional()
      .describe("Motivo curto do bloqueio. Obrigatório quando status = blocked."),
    backlog_position: z.coerce
      .number()
      .int()
      .nullable()
      .optional()
      .describe("Ordem manual dentro do backlog (menor = mais no topo). Só se aplica a tarefas sem data."),
    project_id: z.string().optional(),
    role_id: z.string().optional(),
    recurrence: recurrenceEnum.optional().describe("Padrão: none"),
    recurrence_interval: z.coerce.number().int().positive().optional().describe("Para custom (a cada N dias)"),
    recurrence_weekdays: z.array(z.coerce.number().int().min(0).max(6)).optional().describe("Para weekly: 0=Dom..6=Sáb"),
    recurrence_week_interval: z.coerce.number().int().positive().optional().describe("A cada N semanas (weekly)"),
    recurrence_until: z.string().optional().describe("YYYY-MM-DD final (opcional)"),
  }),
  execute: async (args, ctx) => {
    const userId = getUserId(ctx.auth);
    // service_role bypassa a RLS: validar posse de projeto/papel antes de gravar,
    // senão é possível injetar tarefas em projetos de outros tenants.
    if (args.project_id) await assertProjectAccess(ctx.auth, args.project_id, userId);
    if (args.role_id) await assertRoleOwnership(ctx.auth, args.role_id, userId);
    const insert: Record<string, unknown> = {
      user_id: userId,
      title: args.title,
      description: args.description ?? null,
      scheduled_date: args.scheduled_date ?? null,
      original_date: args.scheduled_date ?? null,
      duration_minutes: args.duration_minutes ?? 30,
      category: args.category ?? "important",
      priority: args.priority ?? 3,
      project_id: args.project_id ?? null,
      role_id: args.role_id ?? null,
      recurrence: args.recurrence ?? "none",
    };
    if (args.status !== undefined) {
      insert.status = args.status;
      insert.completed = args.status === "done";
      insert.completed_at = args.status === "done" ? new Date().toISOString() : null;
      if (args.status === "blocked") {
        if (!args.blocked_reason || !args.blocked_reason.trim()) {
          throw new Error("Informe blocked_reason (motivo curto) ao criar a tarefa como blocked.");
        }
        insert.blocked_reason = args.blocked_reason.trim();
      }
    } else if (args.blocked_reason) {
      insert.blocked_reason = args.blocked_reason.trim();
    }
    if (args.backlog_position !== undefined) insert.backlog_position = args.backlog_position;
    if (args.assignee_id) {
      await assertCanAssign(ctx.auth, userId, args.project_id ?? null, userId);
      await assertAssigneeAllowed(ctx.auth, args.assignee_id, args.project_id ?? null, userId);
      insert.assignee_id = args.assignee_id;
    }
    if (args.recurrence_interval !== undefined) insert.recurrence_interval = args.recurrence_interval;
    if (args.recurrence_weekdays !== undefined) insert.recurrence_weekdays = args.recurrence_weekdays;
    if (args.recurrence_week_interval !== undefined) insert.recurrence_week_interval = args.recurrence_week_interval;
    if (args.recurrence_until !== undefined) insert.recurrence_until = args.recurrence_until;
    const { data, error } = await db(ctx.auth).from("tasks").insert(insert as never).select().single();
    if (error) throw new Error(error.message);
    return JSON.stringify({ ok: true, task: data });
  },
});

/**
 * Registra a exceção de recorrência para (pai, data) — o mesmo que a UI faz em
 * `createRecurrenceException` (useTasks.ts).
 *
 * POR QUE ISSO É OBRIGATÓRIO: `ensureRecurring()` materializa ocorrências
 * comparando os pares (recurrence_parent_id, scheduled_date) que já existem
 * contra a tabela `task_recurrence_exceptions`. Se uma instância é apagada ou
 * movida SEM registrar a exceção, o par deixa de existir, não há exceção que o
 * cubra, e o gerador **recria a ocorrência** no próximo carregamento do app
 * (até 1x a cada 5 min). Era o bug: a UI registrava a exceção, o MCP não.
 */
const recordRecurrenceException = async (
  auth: unknown,
  userId: string,
  parentTaskId: string,
  exceptionDate: string,
) => {
  const { error } = await db(auth)
    .from("task_recurrence_exceptions")
    .upsert(
      {
        user_id: userId,
        parent_task_id: parentTaskId,
        exception_date: exceptionDate,
        kind: "deleted",
      } as never,
      {
        onConflict: "user_id,parent_task_id,exception_date,kind",
        ignoreDuplicates: true,
      },
    );
  if (error) throw new Error(error.message);
};

/** Lê os campos de recorrência de uma tarefa que o usuário pode ver. */
const readRecurrenceRef = async (auth: unknown, userId: string, id: string) => {
  const { data } = await db(auth)
    .from("tasks")
    .select("scheduled_date, recurrence_parent_id")
    .eq("id", id)
    .or(`user_id.eq.${userId},assignee_id.eq.${userId}`)
    .maybeSingle();
  return {
    parentId: (data?.recurrence_parent_id as string | null) ?? null,
    date: (data?.scheduled_date as string | undefined) ?? undefined,
  };
};

export const updateTask = defineTool({
  name: "update_task",
  description: "Atualiza uma tarefa existente: mover de data, mudar título, concluir, recategorizar, alterar recorrência etc.",
  parameters: z.object({
    id: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    scheduled_date: z
      .string()
      .nullable()
      .optional()
      .describe("YYYY-MM-DD, ou null para devolver a tarefa ao BACKLOG (sem data)."),
    duration_minutes: z.coerce.number().optional(),
    assignee_id: z
      .string()
      .nullable()
      .optional()
      .describe("Novo responsável: contato para tarefas sem projeto, membro do projeto/equipe quando vinculada, ou null para remover."),
    status: taskStatusEnum.optional().describe("todo, in_progress, blocked ou done."),
    blocked_reason: z
      .string()
      .nullable()
      .optional()
      .describe("Motivo curto do bloqueio. Obrigatório ao mudar status para blocked."),
    category: z.enum(["urgent", "important", "circumstantial"]).optional(),
    priority: z.coerce.number().int().min(1).max(5).optional().describe(PRIORITY_DOC),
    backlog_position: z.coerce
      .number()
      .int()
      .nullable()
      .optional()
      .describe("Ordem manual dentro do backlog (menor = mais no topo). Só se aplica a tarefas sem data."),
    completed: z.boolean().optional(),
    project_id: z.string().nullable().optional(),
    recurrence: recurrenceEnum.optional(),
    recurrence_interval: z.coerce.number().int().positive().nullable().optional(),
    recurrence_weekdays: z.array(z.coerce.number().int().min(0).max(6)).nullable().optional(),
    recurrence_week_interval: z.coerce.number().int().positive().nullable().optional(),
    recurrence_until: z.string().nullable().optional(),
    role_id: z
      .string()
      .nullable()
      .optional()
      .describe("Papel (role) do usuário ao qual a tarefa pertence, ou null para remover. Use list_roles para obter os ids."),
    non_negotiable: z.boolean().optional().describe("Marca a tarefa como não negociável no dia."),
    planned_date: z.string().nullable().optional().describe("YYYY-MM-DD: data originalmente planejada."),
    original_date: z.string().nullable().optional().describe("YYYY-MM-DD: primeira data em que a tarefa foi agendada."),
    position: z.coerce.number().int().optional().describe("Ordem manual dentro do dia (menor = mais no topo)."),
    time_spent_seconds: z.coerce.number().int().min(0).optional().describe("Tempo total registrado na tarefa, em segundos."),
    recurrence_monthly_pattern: z
      .record(z.string(), z.unknown())
      .nullable()
      .optional()
      .describe("Regra mensal em JSON (ex: {\"day\":15} ou {\"weekday\":1,\"nth\":2})."),
    origin_source: z.string().nullable().optional().describe("Origem da tarefa (ex: fireflies, outlook, manual)."),
    origin_source_label: z.string().nullable().optional().describe("Rótulo legível da origem."),
    origin_source_url: z.string().nullable().optional().describe("URL da origem da tarefa."),
  }),
  execute: async (args, ctx) => {
    const userId = getUserId(ctx.auth);
    const patch: Record<string, unknown> = {};
    if (args.title !== undefined) patch.title = args.title;
    if (args.description !== undefined) patch.description = args.description;
    if (args.scheduled_date !== undefined) patch.scheduled_date = args.scheduled_date;
    if (args.duration_minutes !== undefined) patch.duration_minutes = args.duration_minutes;
    if (args.category !== undefined) patch.category = args.category;
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.backlog_position !== undefined) patch.backlog_position = args.backlog_position;
    if (args.project_id !== undefined) patch.project_id = args.project_id;
    if (args.recurrence !== undefined) patch.recurrence = args.recurrence;
    if (args.recurrence_interval !== undefined) patch.recurrence_interval = args.recurrence_interval;
    if (args.recurrence_weekdays !== undefined) patch.recurrence_weekdays = args.recurrence_weekdays;
    if (args.recurrence_week_interval !== undefined) patch.recurrence_week_interval = args.recurrence_week_interval;
    if (args.recurrence_until !== undefined) patch.recurrence_until = args.recurrence_until;
    if (args.recurrence_monthly_pattern !== undefined) patch.recurrence_monthly_pattern = args.recurrence_monthly_pattern;
    if (args.non_negotiable !== undefined) patch.non_negotiable = args.non_negotiable;
    if (args.planned_date !== undefined) patch.planned_date = args.planned_date;
    if (args.original_date !== undefined) patch.original_date = args.original_date;
    if (args.position !== undefined) patch.position = args.position;
    if (args.time_spent_seconds !== undefined) patch.time_spent_seconds = args.time_spent_seconds;
    if (args.origin_source !== undefined) patch.origin_source = args.origin_source;
    if (args.origin_source_label !== undefined) patch.origin_source_label = args.origin_source_label;
    if (args.origin_source_url !== undefined) patch.origin_source_url = args.origin_source_url;
    // service_role bypassa a RLS: validar posse do papel antes de gravar.
    if (args.role_id !== undefined) {
      if (args.role_id) await assertRoleOwnership(ctx.auth, args.role_id, userId);
      patch.role_id = args.role_id;
    }
    if (args.completed !== undefined) {
      patch.completed = args.completed;
      patch.status = args.completed ? "done" : "todo";
      patch.completed_at = args.completed ? new Date().toISOString() : null;
    }
    if (args.status !== undefined) {
      patch.status = args.status;
      patch.completed = args.status === "done";
      patch.completed_at = args.status === "done" ? new Date().toISOString() : null;
      if (args.status === "blocked") {
        if (!args.blocked_reason || !args.blocked_reason.trim()) {
          throw new Error("Informe blocked_reason (motivo curto) ao marcar a tarefa como blocked.");
        }
        patch.blocked_reason = args.blocked_reason.trim();
      } else {
        patch.blocked_reason = null;
      }
    } else if (args.blocked_reason !== undefined) {
      patch.blocked_reason = args.blocked_reason;
    }
    if (args.assignee_id !== undefined) {
      const { data: current, error: curErr } = await db(ctx.auth)
        .from("tasks")
        .select("user_id,project_id,assignee_id")
        .eq("id", args.id)
        .maybeSingle();
      if (curErr) throw new Error(curErr.message);
      if (!current) throw new Error("Tarefa não encontrada.");
      const projectId = args.project_id !== undefined ? args.project_id : (current.project_id as string | null);
      await assertCanAssign(ctx.auth, userId, projectId, current.user_id as string);
      if (args.assignee_id) {
        await assertAssigneeAllowed(ctx.auth, args.assignee_id, projectId, current.user_id as string);
      }
      patch.assignee_id = args.assignee_id;
    }
    // Mover uma tarefa para dentro de um projeto exige acesso a esse projeto
    // (service_role bypassa a RLS). Definir project_id = null é permitido.
    if (args.project_id) await assertProjectAccess(ctx.auth, args.project_id, userId);

    // ── Recorrência: mover INSTÂNCIA de série tem de seguir o mesmo contrato da
    // UI (`updateTaskWithScope`, escopo "this"): registrar a exceção na data
    // ANTIGA e DESTACAR a instância da série. Sem isso o gerador recria a
    // ocorrência na data antiga e o usuário vê a tarefa "voltar".
    if (args.scheduled_date) {
      const { parentId, date: oldDate } = await readRecurrenceRef(ctx.auth, userId, args.id);
      if (parentId && oldDate && oldDate !== args.scheduled_date) {
        await recordRecurrenceException(ctx.auth, userId, parentId, oldDate);
        // Instância movida vira tarefa avulsa — instância nunca carrega a regra,
        // que vive só na semente (mesma razão do stripKeys da UI).
        patch.recurrence_parent_id = null;
        patch.recurrence = "none";
        patch.original_date = args.scheduled_date;
        patch.recurrence_interval = null;
        patch.recurrence_weekdays = null;
        patch.recurrence_week_interval = null;
        patch.recurrence_monthly_pattern = null;
      }
    }

    const { data, error } = await db(ctx.auth)
      .from("tasks")
      .update(patch as never)
      .eq("id", args.id)
      .or(`user_id.eq.${userId},assignee_id.eq.${userId}`)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return JSON.stringify({ ok: true, task: data });
  },
});

export const deleteTask = defineTool({
  name: "delete_task",
  description:
    "Exclui uma tarefa do usuário (criador ou responsável). Se for uma INSTÂNCIA de série recorrente, registra a exceção da data antes de apagar — assim a ocorrência não é recriada pelo gerador. Apagar a SEMENTE (a tarefa que carrega a regra) encerra a série: as instâncias futuras órfãs são varridas pela limpeza do ensureRecurring.",
  parameters: z.object({ id: z.string() }),
  execute: async (args, ctx) => {
    const userId = getUserId(ctx.auth);

    // ── Recorrência: registrar a exceção ANTES de apagar, igual à UI
    // (`deleteTaskWithScope`, escopo "this"). Sem a exceção, `ensureRecurring()`
    // recria a ocorrência no próximo carregamento do app.
    const { parentId, date } = await readRecurrenceRef(ctx.auth, userId, args.id);
    if (parentId && date) {
      await recordRecurrenceException(ctx.auth, userId, parentId, date);
    }

    const { error } = await db(ctx.auth)
      .from("tasks")
      .delete()
      .eq("id", args.id)
      .or(`user_id.eq.${userId},assignee_id.eq.${userId}`);
    if (error) throw new Error(error.message);
    return JSON.stringify({ ok: true, recurrence_exception: parentId ? { parent_task_id: parentId, date } : null });
  },
});

export const listTaskDependencies = defineTool({
  name: "list_task_dependencies",
  description:
    "Lista as dependências entre tarefas do usuário (predecessoras → sucessoras). Use task_id para filtrar uma tarefa específica e ver suas antecessoras e sucessoras. Dependências são em cadeia: mudar a data da predecessora propaga para todas sucessoras.",
  parameters: z.object({
    task_id: z.string().uuid().optional().describe("Se informado, retorna só dependências em que essa tarefa participa."),
  }),
  execute: async (args, ctx) => {
    const userId = getUserId(ctx.auth);
    let q = db(ctx.auth)
      .from("task_dependencies")
      .select("id,predecessor_id,successor_id,lag_days,dep_type,predecessor:tasks!task_dependencies_predecessor_id_fkey(id,title,scheduled_date,completed),successor:tasks!task_dependencies_successor_id_fkey(id,title,scheduled_date,completed)")
      .eq("user_id", userId);
    if (args.task_id) {
      q = q.or(`predecessor_id.eq.${args.task_id},successor_id.eq.${args.task_id}`);
    }
    const { data, error } = await q;
    if (error) {
      // Fallback without joins if FK alias not present
      const plain = await db(ctx.auth)
        .from("task_dependencies")
        .select("id,predecessor_id,successor_id,lag_days,dep_type")
        .eq("user_id", userId);
      if (plain.error) throw new Error(plain.error.message);
      return JSON.stringify(plain.data ?? []);
    }
    return JSON.stringify(data ?? []);
  },
});

export const addTaskDependency = defineTool({
  name: "add_task_dependency",
  description:
    "Vincula uma tarefa antecessora a uma sucessora (tipo Finish-to-Start). A sucessora só deve começar após a antecessora terminar. Mudanças de data da antecessora propagam automaticamente em cadeia.",
  parameters: z.object({
    predecessor_id: z.string().describe("Tarefa que precisa terminar primeiro."),
    successor_id: z.string().describe("Tarefa que depende da antecessora."),
    lag_days: z.coerce.number().int().min(0).max(365).optional().describe("Dias de folga entre término da antecessora e início da sucessora. Padrão 0."),
  }),
  execute: async (args, ctx) => {
    const userId = getUserId(ctx.auth);
    // Verify ownership of BOTH tasks before creating the dependency.
    // Since MCP uses a service-role client (RLS bypassed), this check is the
    // sole defense against cross-tenant dependency creation.
    const { data: ownedTasks, error: ownErr } = await db(ctx.auth)
      .from("tasks")
      .select("id")
      .in("id", [args.predecessor_id, args.successor_id])
      .or(`user_id.eq.${userId},assignee_id.eq.${userId}`);
    if (ownErr) throw new Error(ownErr.message);
    const ownedIds = new Set((ownedTasks ?? []).map((t) => t.id as string));
    if (!ownedIds.has(args.predecessor_id) || !ownedIds.has(args.successor_id)) {
      throw new Error("Você só pode criar dependências entre tarefas das quais é dono ou responsável.");
    }
    const { data, error } = await db(ctx.auth)
      .from("task_dependencies")
      .insert({
        user_id: userId,
        predecessor_id: args.predecessor_id,
        successor_id: args.successor_id,
        lag_days: args.lag_days ?? 0,
        dep_type: "FS",
      } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return JSON.stringify({ ok: true, dependency: data });
  },
});

export const removeTaskDependency = defineTool({
  name: "remove_task_dependency",
  description: "Remove uma dependência entre duas tarefas (informe predecessor_id e successor_id, ou o id da dependência).",
  parameters: z.object({
    id: z.string().optional(),
    predecessor_id: z.string().optional(),
    successor_id: z.string().optional(),
  }),
  execute: async (args, ctx) => {
    const userId = getUserId(ctx.auth);
    let q = db(ctx.auth).from("task_dependencies").delete().eq("user_id", userId);
    if (args.id) q = q.eq("id", args.id);
    else if (args.predecessor_id && args.successor_id) {
      q = q.eq("predecessor_id", args.predecessor_id).eq("successor_id", args.successor_id);
    } else {
      throw new Error("Informe id ou (predecessor_id + successor_id).");
    }
    const { error } = await q;
    if (error) throw new Error(error.message);
    return JSON.stringify({ ok: true });
  },
});

async function fireflies(userId: string, query: string, variables: Record<string, unknown>) {
  const { data: conn } = await adminDb()
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
  parameters: z.object({ limit: z.coerce.number().optional().describe("Padrão 10") }),
  execute: async (args, ctx) => {
    const userId = getUserId(ctx.auth);
    const limit = args.limit ?? 10;
    const result = await fireflies(
      userId,
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
  execute: async (args, ctx) => {
    const userId = getUserId(ctx.auth);
    const result = await fireflies(
      userId,
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

export const addTaskComment = defineTool({
  name: "add_task_comment",
  description:
    "Adiciona um comentário a uma tarefa. Permitido para o criador, o responsável, o dono do projeto e os membros do projeto. Notifica os demais envolvidos.",
  parameters: z.object({
    task_id: z.string(),
    text: z.string().min(1).max(5000),
  }),
  execute: async (args, ctx) => {
    const userId = getUserId(ctx.auth);
    const client = db(ctx.auth);
    // service_role bypassa a RLS: checar acesso explicitamente.
    const access = await client.rpc("can_access_task", { _task_id: args.task_id, _user_id: userId });
    if (access.error) throw new Error(access.error.message);
    if (!access.data) throw new Error("Sem acesso a esta tarefa.");
    const { data, error } = await client
      .from("task_comments")
      .insert({ task_id: args.task_id, user_id: userId, content: args.text.trim() } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return JSON.stringify({ ok: true, comment: data });
  },
});

export const listTaskComments = defineTool({
  name: "list_task_comments",
  description: "Lista os comentários de uma tarefa em ordem cronológica, com autor e data.",
  parameters: z.object({ task_id: z.string() }),
  execute: async (args, ctx) => {
    const userId = getUserId(ctx.auth);
    const client = db(ctx.auth);
    const access = await client.rpc("can_access_task", { _task_id: args.task_id, _user_id: userId });
    if (access.error) throw new Error(access.error.message);
    if (!access.data) throw new Error("Sem acesso a esta tarefa.");
    const { data, error } = await client
      .from("task_comments")
      .select("id,task_id,user_id,content,created_at,updated_at")
      .eq("task_id", args.task_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const authorIds = Array.from(new Set(rows.map((r) => r.user_id as string)));
    let profileMap = new Map<string, { display_name: string | null; email: string | null }>();
    if (authorIds.length > 0) {
      const { data: profs } = await client
        .from("profiles")
        .select("user_id,display_name,email")
        .in("user_id", authorIds);
      profileMap = new Map(
        (profs ?? []).map((p) => [p.user_id as string, { display_name: p.display_name, email: p.email }]),
      );
    }
    return JSON.stringify(
      rows.map((r) => ({
        ...r,
        author: profileMap.get(r.user_id as string) ?? null,
        is_mine: r.user_id === userId,
      })),
    );
  },
});

export const allTools = [
  listTasks,
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  listMeetings,
  createTask,
  updateTask,
  deleteTask,
  addTaskComment,
  listTaskComments,
  listTaskDependencies,
  addTaskDependency,
  removeTaskDependency,
  listFirefliesMeetings,
  getFirefliesTranscript,
];
