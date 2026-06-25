import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const FIREFLIES_URL = "https://api.fireflies.ai/graphql";

// ---------------- Auth ----------------
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
  return { supabase, userId: data.claims.sub as string };
}

// ---------------- Tool definitions ----------------
const tools = [
  {
    type: "function",
    function: {
      name: "list_tasks",
      description: "Lista tarefas do usuário com filtros opcionais. Use para responder dúvidas sobre carga, atrasos, próximos dias.",
      parameters: {
        type: "object",
        properties: {
          from_date: { type: "string", description: "Data inicial YYYY-MM-DD (opcional)" },
          to_date: { type: "string", description: "Data final YYYY-MM-DD (opcional)" },
          only_open: { type: "boolean", description: "Se true, retorna só não-concluídas" },
          project_id: { type: "string", description: "Filtrar por projeto (opcional)" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_meetings",
      description: "Lista reuniões da agenda em um intervalo de datas.",
      parameters: {
        type: "object",
        properties: {
          from_date: { type: "string" },
          to_date: { type: "string" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_roles",
      description: "Lista os papéis do usuário com id, nome e cor.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "list_projects",
      description: "Lista os projetos do usuário (id, nome, status, prazo e papel associado).",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "create_project",
      description: "Cria um novo projeto e retorna o projeto criado com id.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          color: { type: "string", description: "Hex tipo #8b5cf6" },
          role_id: { type: "string", description: "ID do papel associado (opcional)" },
          status: { type: "string", enum: ["in_progress", "active", "paused", "not_started", "finished"] },
          starts_on: { type: "string", description: "YYYY-MM-DD" },
          deadline: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Cria uma nova tarefa.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          scheduled_date: { type: "string", description: "YYYY-MM-DD" },
          duration_minutes: { type: "number", description: "5,15,30,60,90,120" },
          category: { type: "string", enum: ["urgent", "important", "circumstantial"] },
          project_id: { type: "string", description: "Opcional" },
          role_id: { type: "string", description: "Opcional" },
          recurrence: {
            type: "string",
            enum: ["none", "daily", "weekdays", "weekly", "monthly", "yearly", "custom"],
            description: "Repetição da tarefa. Padrão: none.",
          },
          recurrence_interval: { type: "number", description: "Intervalo p/ custom (ex.: a cada N dias)" },
          recurrence_weekdays: {
            type: "array",
            items: { type: "number" },
            description: "Dias da semana p/ weekly (0=Dom .. 6=Sáb)",
          },
          recurrence_week_interval: { type: "number", description: "A cada N semanas (weekly). Padrão 1." },
          recurrence_until: { type: "string", description: "YYYY-MM-DD. Data final da recorrência (opcional)." },
        },
        required: ["title", "scheduled_date"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description: "Atualiza tarefa existente (mover data, mudar título, marcar concluída, mudar recorrência, etc.).",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          scheduled_date: { type: "string" },
          duration_minutes: { type: "number" },
          category: { type: "string", enum: ["urgent", "important", "circumstantial"] },
          completed: { type: "boolean" },
          project_id: { type: "string" },
          recurrence: {
            type: "string",
            enum: ["none", "daily", "weekdays", "weekly", "monthly", "yearly", "custom"],
          },
          recurrence_interval: { type: "number" },
          recurrence_weekdays: { type: "array", items: { type: "number" } },
          recurrence_week_interval: { type: "number" },
          recurrence_until: { type: "string" },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_fireflies_meetings",
      description: "Lista as últimas atas/transcrições do Fireflies. Use quando o usuário quiser gerar tarefas a partir de uma reunião.",
      parameters: {
        type: "object",
        properties: { limit: { type: "number", description: "Padrão 10" } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_fireflies_transcript",
      description: "Pega o texto completo da ata + sumário + action items de uma reunião do Fireflies.",
      parameters: {
        type: "object",
        properties: { transcript_id: { type: "string" } },
        required: ["transcript_id"],
        additionalProperties: false,
      },
    },
  },
];

// ---------------- Tool implementations ----------------
type AuthedSupabase = Awaited<ReturnType<typeof authenticateRequest>>["supabase"];

async function execTool(
  name: string,
  args: Record<string, unknown>,
  ctx: { supabase: AuthedSupabase; userId: string },
): Promise<unknown> {
  const { supabase, userId } = ctx;

  if (name === "list_roles") {
    const { data, error } = await supabase
      .from("roles")
      .select("id,name,color,position")
      .eq("user_id", userId)
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return data;
  }

  if (name === "list_tasks") {
    let q = supabase
      .from("tasks")
      .select("id,title,description,scheduled_date,duration_minutes,category,status,completed,project_id,role_id,time_spent_seconds")
      .eq("user_id", userId)
      .order("scheduled_date", { ascending: true })
      .limit(200);
    if (args.from_date) q = q.gte("scheduled_date", String(args.from_date));
    if (args.to_date) q = q.lte("scheduled_date", String(args.to_date));
    if (args.only_open) q = q.eq("completed", false);
    if (args.project_id) q = q.eq("project_id", String(args.project_id));
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data;
  }

  if (name === "list_meetings") {
    let q = supabase
      .from("meetings")
      .select("id,title,description,starts_at,ends_at,scheduled_date,project_id,location")
      .eq("user_id", userId)
      .order("starts_at", { ascending: true })
      .limit(100);
    if (args.from_date) q = q.gte("scheduled_date", String(args.from_date));
    if (args.to_date) q = q.lte("scheduled_date", String(args.to_date));
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data;
  }

  if (name === "list_projects") {
    const { data, error } = await supabase
      .from("projects")
      .select("id,name,description,status,deadline,starts_on,color,role_id,role:roles(id,name,color)")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return data;
  }

  if (name === "create_project") {
    const insert = {
      user_id: userId,
      name: String(args.name),
      description: args.description ? String(args.description) : null,
      color: args.color ? String(args.color) : "#8b5cf6",
      role_id: args.role_id ? String(args.role_id) : null,
      status: (args.status as "in_progress" | "active" | "paused" | "not_started" | "finished") ?? "active",
      starts_on: args.starts_on ? String(args.starts_on) : null,
      deadline: args.deadline ? String(args.deadline) : null,
    };
    const { data, error } = await supabase.from("projects").insert(insert as never).select().single();
    if (error) throw new Error(error.message);
    return { ok: true, project: data };
  }

  if (name === "create_task") {
    const insert = {
      user_id: userId,
      title: String(args.title),
      description: args.description ? String(args.description) : null,
      scheduled_date: String(args.scheduled_date),
      original_date: String(args.scheduled_date),
      duration_minutes: Number(args.duration_minutes ?? 30),
      category: (args.category as "urgent" | "important" | "circumstantial") ?? "important",
      project_id: args.project_id ? String(args.project_id) : null,
      role_id: args.role_id ? String(args.role_id) : null,
    };
    const { data, error } = await supabase.from("tasks").insert(insert as never).select().single();
    if (error) throw new Error(error.message);
    return { ok: true, task: data };
  }

  if (name === "update_task") {
    const id = String(args.id);
    const patch: Record<string, unknown> = {};
    if (args.title !== undefined) patch.title = args.title;
    if (args.scheduled_date !== undefined) patch.scheduled_date = args.scheduled_date;
    if (args.duration_minutes !== undefined) patch.duration_minutes = args.duration_minutes;
    if (args.category !== undefined) patch.category = args.category;
    if (args.project_id !== undefined) patch.project_id = args.project_id;
    if (args.completed !== undefined) {
      patch.completed = args.completed;
      patch.status = args.completed ? "done" : "todo";
      patch.completed_at = args.completed ? new Date().toISOString() : null;
    }
    const { data, error } = await supabase.from("tasks").update(patch as never).eq("id", id).eq("user_id", userId).select().single();
    if (error) throw new Error(error.message);
    return { ok: true, task: data };
  }

  if (name === "list_fireflies_meetings") {
    const limit = Number(args.limit ?? 10);
    const result = await fireflies(userId, `
      query Last($limit: Int) {
        transcripts(limit: $limit) {
          id title date duration host_email
          summary { keywords action_items overview }
        }
      }
    `, { limit });
    return result?.data?.transcripts ?? [];
  }

  if (name === "get_fireflies_transcript") {
    const id = String(args.transcript_id);
    const result = await fireflies(userId, `
      query One($id: String!) {
        transcript(id: $id) {
          id title date duration host_email
          sentences { speaker_name text }
          summary { keywords action_items overview shorthand_bullet }
        }
      }
    `, { id });
    const t = result?.data?.transcript;
    if (!t) return { error: "Transcript não encontrado" };
    const sentences = (t.sentences ?? []).map((s: { speaker_name?: string; text: string }) =>
      `${s.speaker_name ?? "?"}: ${s.text}`
    ).join("\n");
    return {
      id: t.id,
      title: t.title,
      date: t.date,
      duration: t.duration,
      summary: t.summary,
      transcript: sentences.slice(0, 12000), // safety
    };
  }

  throw new Error(`Tool desconhecida: ${name}`);
}

async function fireflies(userId: string, query: string, variables: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: conn } = await supabaseAdmin
    .from("fireflies_connections")
    .select("api_key")
    .eq("user_id", userId)
    .maybeSingle();
  const ffKey = conn?.api_key as string | undefined;
  if (!ffKey) throw new Error("Fireflies não conectado — conecte sua chave em Integrações");
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
    throw new Error(`Fireflies error ${r.status}: ${t.slice(0, 500)}`);
  }
  return r.json();
}

// ---------------- System prompt ----------------
function systemPrompt(today: string) {
  return `Você é Maya, assistente pessoal do app Foco — focada em produtividade, GTD e gestão de tempo.

Hoje é ${today}. Sempre responda em português do Brasil.

Suas responsabilidades:
- Ajudar a organizar a semana, distribuir e priorizar tarefas considerando reuniões já marcadas
- Gerar tarefas a partir de atas de reunião (Fireflies) — sempre vincule ao projeto certo quando possível
- Responder dúvidas sobre carga de trabalho, atrasos e prioridades
- Reorganizar a agenda movendo tarefas existentes (use update_task)

Diretrizes:
- Use as ferramentas disponíveis sempre que precisar de dados reais (não invente)
- Antes de criar várias tarefas, mostre uma prévia em lista numerada e confirme com o usuário
- Categorias de tarefa: "urgent" (urgente, fazer hoje), "important" (importante, sem prazo crítico), "circumstantial" (circunstancial)
- Durações típicas em minutos: 5, 15, 30, 60, 90, 120
- Datas sempre no formato YYYY-MM-DD
- Para gerar tarefas de uma ata: 1) liste as reuniões com list_fireflies_meetings, 2) confirme qual, 3) chame get_fireflies_transcript, 4) extraia action items, 5) confirme com usuário, 6) use create_task para cada
- Seja breve, direto e use markdown leve (listas, negrito). Não enrole.`;
}

// ---------------- Main handler ----------------
const chatBody = z.object({
  conversation_id: z.string().uuid().nullable().optional(),
  message: z.string().min(1).max(20000),
});

const briefingBody = z.object({
  scope: z.enum(["day", "week"]).default("day"),
});

export const Route = createFileRoute("/api/public/maya")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { supabase, userId } = await authenticateRequest(request);
          const url = new URL(request.url);
          const action = url.searchParams.get("action") ?? "chat";

          if (action === "briefing") {
            const json = briefingBody.parse(await request.json());
            return await handleBriefing({ supabase, userId, scope: json.scope });
          }

          const json = chatBody.parse(await request.json());
          return await handleChat({ supabase, userId, body: json });
        } catch (err) {
          if (err instanceof Response) return err;
          console.error("maya error:", err);
          return new Response(JSON.stringify({ error: "Erro interno" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});

async function handleChat({
  supabase,
  userId,
  body,
}: {
  supabase: AuthedSupabase;
  userId: string;
  body: z.infer<typeof chatBody>;
}) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY missing");

  // 1. Garantir conversa
  let conversationId = body.conversation_id ?? null;
  if (!conversationId) {
    const { data, error } = await supabase
      .from("chat_conversations")
      .insert({ user_id: userId, title: body.message.slice(0, 60) })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    conversationId = data.id;
  }

  // 2. Inserir mensagem do usuário
  await supabase.from("chat_messages").insert({
    conversation_id: conversationId,
    user_id: userId,
    role: "user",
    content: body.message,
  });

  // 3. Carregar histórico (últimas 30)
  const { data: history } = await supabase
    .from("chat_messages")
    .select("role, content, tool_name, tool_data")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(30);

  const today = new Date().toISOString().slice(0, 10);

  // Build OpenAI-compatible message list. Past tool runs are collapsed to system notes
  // (we don't have stored tool_call_ids), but the CURRENT turn uses proper tool_calls/tool roles.
  type ChatMsg =
    | { role: "system" | "user" | "assistant"; content: string }
    | { role: "assistant"; content: string | null; tool_calls: unknown[] }
    | { role: "tool"; content: string; tool_call_id: string };
  const messages: ChatMsg[] = [
    { role: "system", content: systemPrompt(today) },
    ...((history ?? []).map((m) => {
      if (m.role === "tool") {
        return {
          role: "system" as const,
          content: `[Resultado anterior de ${m.tool_name}]: ${typeof m.tool_data === "string" ? m.tool_data : JSON.stringify(m.tool_data).slice(0, 2000)}`,
        };
      }
      return { role: m.role as "user" | "assistant", content: m.content };
    })),
  ];

  // 4. Loop de tool-calling (máx 5 voltas)
  let finalText = "";
  const toolEvents: Array<{ name: string; args: unknown; result: unknown }> = [];

  for (let i = 0; i < 5; i++) {
    const r = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        tools,
      }),
    });

    if (r.status === 429) {
      return new Response(JSON.stringify({ error: "Limite de IA atingido. Tente novamente em alguns instantes." }), {
        status: 429, headers: { "Content-Type": "application/json" },
      });
    }
    if (r.status === 402) {
      return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos em Configurações > Workspace > Uso." }), {
        status: 402, headers: { "Content-Type": "application/json" },
      });
    }
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`AI gateway ${r.status}: ${t.slice(0, 400)}`);
    }

    const ai = await r.json();
    const choice = ai.choices?.[0];
    const msg = choice?.message;
    if (!msg) throw new Error("Resposta vazia do modelo");

    const toolCalls = msg.tool_calls ?? [];
    if (toolCalls.length === 0) {
      finalText = msg.content ?? "";
      break;
    }

    // Echo assistant tool-call message into history for the next loop turn
    messages.push({
      role: "assistant",
      content: msg.content ?? null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const fnName = call.function?.name;
      const callId = call.id ?? `call_${Math.random().toString(36).slice(2, 10)}`;
      let parsedArgs: Record<string, unknown> = {};
      try { parsedArgs = JSON.parse(call.function?.arguments ?? "{}"); } catch { /* ignore */ }
      let result: unknown;
      try {
        result = await execTool(fnName, parsedArgs, { supabase, userId });
      } catch (e) {
        result = { error: e instanceof Error ? e.message : "Erro" };
      }
      toolEvents.push({ name: fnName, args: parsedArgs, result });
      // Persist tool message for transparency
      await supabase.from("chat_messages").insert({
        conversation_id: conversationId,
        user_id: userId,
        role: "tool",
        content: "",
        tool_name: fnName,
        tool_data: result as never,
      });
      messages.push({
        role: "tool",
        tool_call_id: callId,
        content: JSON.stringify(result).slice(0, 8000),
      });
    }
  }

  if (!finalText) finalText = "(sem resposta do modelo)";

  // 5. Salvar resposta final
  await supabase.from("chat_messages").insert({
    conversation_id: conversationId,
    user_id: userId,
    role: "assistant",
    content: finalText,
  });

  return new Response(
    JSON.stringify({ conversation_id: conversationId, message: finalText, tools_used: toolEvents.map((t) => t.name) }),
    { headers: { "Content-Type": "application/json" } },
  );
}

async function handleBriefing({
  supabase,
  userId,
  scope,
}: {
  supabase: AuthedSupabase;
  userId: string;
  scope: "day" | "week";
}) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY missing");

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const end = new Date(today);
  end.setDate(end.getDate() + (scope === "week" ? 7 : 0));
  const endStr = end.toISOString().slice(0, 10);

  // Coletar tarefas e reuniões
  const { data: tasks } = await supabase
    .from("tasks").select("id,title,scheduled_date,duration_minutes,category,completed,status,project_id")
    .eq("user_id", userId).gte("scheduled_date", todayStr).lte("scheduled_date", endStr);

  const { data: overdue } = await supabase
    .from("tasks").select("id,title,scheduled_date,duration_minutes,category")
    .eq("user_id", userId).eq("completed", false).lt("scheduled_date", todayStr).limit(20);

  const { data: meetings } = await supabase
    .from("meetings").select("title,starts_at,ends_at,scheduled_date")
    .eq("user_id", userId).gte("scheduled_date", todayStr).lte("scheduled_date", endStr);

  const { data: projects } = await supabase
    .from("projects").select("id,name,status,deadline").eq("user_id", userId);

  const ctx = {
    today: todayStr,
    scope,
    tasks: tasks ?? [],
    overdue: overdue ?? [],
    meetings: meetings ?? [],
    projects: projects ?? [],
  };

  const prompt = `Gere um briefing ${scope === "day" ? "do dia" : "da semana"} para o usuário em português, em markdown enxuto.

Dados (JSON):
${JSON.stringify(ctx).slice(0, 8000)}

Estrutura:
- Saudação curta + foco principal sugerido
- 🎯 **Prioridades** (top 3 tarefas com motivo)
- 📅 **Agenda** (resumo de reuniões)
- ⚠️ **Atrasos** (se houver)
- 💡 **Sugestão** (uma ação concreta para a semana, ex: "considere mover X para sexta")

Não invente tarefas. Seja direto. Máximo 200 palavras.`;

  const r = await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "Você é Maya, assistente do app Foco. Responda direto, em PT-BR." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (r.status === 429) return new Response(JSON.stringify({ error: "Limite de IA atingido." }), { status: 429, headers: { "Content-Type": "application/json" } });
  if (r.status === 402) return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), { status: 402, headers: { "Content-Type": "application/json" } });
  if (!r.ok) throw new Error(`AI gateway ${r.status}`);
  const ai = await r.json();
  const content = ai.choices?.[0]?.message?.content ?? "(sem resposta)";

  // Upsert
  await supabase.from("daily_briefings").upsert(
    { user_id: userId, reference_date: todayStr, scope, content, metadata: ctx as never },
    { onConflict: "user_id,reference_date,scope" },
  );

  return new Response(JSON.stringify({ content, reference_date: todayStr, scope }), {
    headers: { "Content-Type": "application/json" },
  });
}
