import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

type DbTask = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  duration_minutes: number;
  position: number;
  scheduled_date: string;
  planned_date: string;
  completed: boolean;
  non_negotiable: boolean;
  postpone_count: number;
  recurrence: string;
  recurrence_parent_id: string | null;
  origin_source: string | null;
  project_id: string | null;
  role_id: string | null;
};

const CATEGORY_RANK: Record<string, number> = { urgent: 0, important: 1, circumstantial: 2 };

function isInboxOrganizingTask(t: DbTask) {
  const s = `${t.title} ${t.description ?? ""}`.toLowerCase();
  return /(organizar|revisar|processar|limpar|esvaziar).*(caixa de entrada|inbox|e-?mail)|inbox\s*zero/.test(s);
}
function isNextDayPlanningTask(t: DbTask) {
  const s = `${t.title} ${t.description ?? ""}`.toLowerCase();
  return /(planejar|organizar|preparar).*(amanh\u00e3|pr\u00f3ximo dia|dia seguinte)/.test(s);
}

function heuristicOrder(tasks: DbTask[]): DbTask[] {
  const open = tasks.filter((t) => !t.completed);
  const completed = tasks.filter((t) => t.completed);

  const inboxOrg: DbTask[] = [];
  const nextDayPlan: DbTask[] = [];
  const middle: DbTask[] = [];

  for (const t of open) {
    if (isInboxOrganizingTask(t)) inboxOrg.push(t);
    else if (isNextDayPlanningTask(t)) nextDayPlan.push(t);
    else middle.push(t);
  }

  middle.sort((a, b) => {
    // Non-negotiable first
    if (a.non_negotiable !== b.non_negotiable) return a.non_negotiable ? -1 : 1;
    // More postponed = higher priority
    if (b.postpone_count !== a.postpone_count) return b.postpone_count - a.postpone_count;
    // Category rank
    const ca = CATEGORY_RANK[a.category] ?? 1;
    const cb = CATEGORY_RANK[b.category] ?? 1;
    if (ca !== cb) return ca - cb;
    // Preserve position
    return a.position - b.position;
  });

  return [...inboxOrg, ...middle, ...nextDayPlan, ...completed];
}

async function refineWithAI(
  tasks: DbTask[],
  baseOrder: DbTask[],
  capacityMinutes: number,
  apiKey: string,
): Promise<{ orderedIds: string[]; reasoning: string } | null> {
  const open = baseOrder.filter((t) => !t.completed);
  if (open.length <= 1) return null;

  const compact = open.map((t) => ({
    id: t.id,
    title: t.title.slice(0, 120),
    category: t.category,
    duration_min: t.duration_minutes,
    non_negotiable: t.non_negotiable,
    postponed: t.postpone_count,
    recurring: t.recurrence !== "none" || !!t.recurrence_parent_id,
    from: t.origin_source ?? null,
  }));

  const totalMin = open.reduce((s, t) => s + t.duration_minutes, 0);

  const system = `Você é um especialista em GTD e produtividade. Reordene tarefas do dia priorizando energia, contexto e impacto.
Regras inegociáveis:
1) Tarefas de "organizar caixa de entrada / inbox" SEMPRE primeiro.
2) Tarefas de "planejar / organizar amanhã" SEMPRE por último.
3) Tarefas marcadas como non_negotiable vêm logo após inbox.
4) Tarefas muito adiadas (postponed >= 2) sobem.
5) Categoria: urgent > important > circumstantial.
6) Agrupe tarefas do mesmo contexto/projeto quando possível.
Responda APENAS JSON válido: {"ordered_ids": ["id1","id2",...], "reasoning": "1 frase curta"}`;

  const user = `Capacidade do dia: ${capacityMinutes}min. Soma das tarefas abertas: ${totalMin}min.
Tarefas (ordem-base já aplica heurística básica):
${JSON.stringify(compact)}

Devolva todos os ${open.length} ids reordenados.`;

  try {
    const r = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) {
      console.error("AI refine failed", r.status, await r.text());
      return null;
    }
    const json = await r.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    const ids = Array.isArray(parsed?.ordered_ids) ? parsed.ordered_ids.filter((x: unknown) => typeof x === "string") : null;
    if (!ids) return null;
    // Sanity: must contain all open ids
    const openIds = new Set(open.map((t) => t.id));
    const aiIds = new Set(ids);
    if (aiIds.size !== openIds.size || ![...openIds].every((id) => aiIds.has(id))) return null;
    return { orderedIds: ids, reasoning: typeof parsed?.reasoning === "string" ? parsed.reasoning : "" };
  } catch (e) {
    console.error("AI refine error", e);
    return null;
  }
}

const dayInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  use_ai: z.boolean().optional(),
});

export const autoOrganizeDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => dayInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Load preferences
    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    const capacity = prefs?.daily_capacity_minutes ?? 480;
    const useAi = data.use_ai ?? prefs?.auto_organize_use_ai ?? true;

    const { data: tasks, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .eq("scheduled_date", data.date)
      .order("position", { ascending: true });
    if (error) {
      console.error("[autoOrganizeDay] load tasks error", error);
      throw new Error(error.message);
    }
    const list = (tasks ?? []) as DbTask[];
    console.log("[autoOrganizeDay]", { userId, date: data.date, taskCount: list.length, useAi });
    if (list.length === 0) {
      return { ok: true, ordered_ids: [], reasoning: "Nenhuma tarefa no dia.", capacity_minutes: capacity, total_minutes: 0, overflow: false };
    }

    const heuristic = heuristicOrder(list);
    let finalOrder = heuristic;
    let reasoning = "Aplicada heurística (inbox → inegociáveis → adiadas → urgentes → importantes → circunstanciais → planejar amanhã).";

    if (useAi) {
      const apiKey = process.env.LOVABLE_API_KEY;
      if (apiKey) {
        const refined = await refineWithAI(list, heuristic, capacity, apiKey);
        if (refined) {
          const byId = new Map(list.map((t) => [t.id, t]));
          const completed = list.filter((t) => t.completed);
          finalOrder = [...refined.orderedIds.map((id) => byId.get(id)!).filter(Boolean), ...completed];
          reasoning = refined.reasoning || reasoning;
        }
      }
    }

    // Persist new positions sequentially to stay within Worker subrequest limits.
    let updateErrors = 0;
    for (let idx = 0; idx < finalOrder.length; idx++) {
      const t = finalOrder[idx];
      const { error: upErr } = await supabase
        .from("tasks")
        .update({ position: idx })
        .eq("id", t.id)
        .eq("user_id", userId);
      if (upErr) {
        updateErrors++;
        console.error("[autoOrganizeDay] update position error", t.id, upErr);
      }
    }

    // Log
    await supabase.from("task_reorder_logs").insert({
      user_id: userId,
      reference_date: data.date,
      source: "auto",
      ordered_task_ids: finalOrder.map((t) => t.id),
      reasoning,
      metadata: { capacity_minutes: capacity, used_ai: useAi, update_errors: updateErrors },
    } as never);

    const openMinutes = finalOrder.filter((t) => !t.completed).reduce((s, t) => s + t.duration_minutes, 0);
    console.log("[autoOrganizeDay] done", { date: data.date, count: finalOrder.length, updateErrors, openMinutes });
    return {
      ok: true,
      ordered_ids: finalOrder.map((t) => t.id),
      reasoning,
      capacity_minutes: capacity,
      total_minutes: openMinutes,
      overflow: openMinutes > capacity,
    };
  });

const weekInput = z.object({
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  use_ai: z.boolean().optional(),
});

export const autoOrganizeWeek = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => weekInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    const capacity = prefs?.daily_capacity_minutes ?? 480;
    const useAi = data.use_ai ?? prefs?.auto_organize_use_ai ?? true;
    const apiKey = process.env.LOVABLE_API_KEY;

    // Build the 7 dates
    const days: string[] = [];
    {
      const [y, m, d] = data.week_start.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      for (let i = 0; i < 7; i++) {
        const c = new Date(dt);
        c.setDate(dt.getDate() + i);
        const yy = c.getFullYear();
        const mm = String(c.getMonth() + 1).padStart(2, "0");
        const dd = String(c.getDate()).padStart(2, "0");
        days.push(`${yy}-${mm}-${dd}`);
      }
    }

    const { data: tasks, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .in("scheduled_date", days)
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    const allTasks = (tasks ?? []) as DbTask[];

    const summary: Array<{ date: string; total_minutes: number; capacity_minutes: number; overflow: boolean; count: number }> = [];

    for (const date of days) {
      const dayTasks = allTasks.filter((t) => t.scheduled_date === date);
      if (dayTasks.length === 0) {
        summary.push({ date, total_minutes: 0, capacity_minutes: capacity, overflow: false, count: 0 });
        continue;
      }
      const heuristic = heuristicOrder(dayTasks);
      let finalOrder = heuristic;
      if (useAi && apiKey) {
        const refined = await refineWithAI(dayTasks, heuristic, capacity, apiKey);
        if (refined) {
          const byId = new Map(dayTasks.map((t) => [t.id, t]));
          const completed = dayTasks.filter((t) => t.completed);
          finalOrder = [...refined.orderedIds.map((id) => byId.get(id)!).filter(Boolean), ...completed];
        }
      }
      await Promise.resolve();
      for (let idx = 0; idx < finalOrder.length; idx++) {
        const t = finalOrder[idx];
        const { error: upErr } = await supabase
          .from("tasks")
          .update({ position: idx })
          .eq("id", t.id)
          .eq("user_id", userId);
        if (upErr) console.error("[autoOrganizeWeek] update error", t.id, upErr);
      }
      const openMinutes = finalOrder.filter((t) => !t.completed).reduce((s, t) => s + t.duration_minutes, 0);
      summary.push({
        date,
        total_minutes: openMinutes,
        capacity_minutes: capacity,
        overflow: openMinutes > capacity,
        count: finalOrder.filter((t) => !t.completed).length,
      });
    }

    await supabase.from("task_reorder_logs").insert({
      user_id: userId,
      reference_date: days[0],
      source: "auto",
      ordered_task_ids: [],
      reasoning: "Auto-organização semanal",
      metadata: { week: summary, used_ai: useAi },
    } as never);

    return { ok: true, week_start: data.week_start, days: summary };
  });

export const getUserPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    return {
      daily_capacity_minutes: data?.daily_capacity_minutes ?? 480,
      auto_organize_use_ai: data?.auto_organize_use_ai ?? true,
    };
  });

const prefsInput = z.object({
  daily_capacity_minutes: z.number().int().min(60).max(960).optional(),
  auto_organize_use_ai: z.boolean().optional(),
});

export const updateUserPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => prefsInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = {
      user_id: userId,
      ...(data.daily_capacity_minutes !== undefined ? { daily_capacity_minutes: data.daily_capacity_minutes } : {}),
      ...(data.auto_organize_use_ai !== undefined ? { auto_organize_use_ai: data.auto_organize_use_ai } : {}),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("user_preferences")
      .upsert(payload as never, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
