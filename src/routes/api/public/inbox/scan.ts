import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

async function authenticateRequest(request: Request): Promise<string> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response("Unauthorized", { status: 401 });
  }
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Response("Server misconfigured", { status: 500 });
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
  return data.claims.sub as string;
}

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const FIREFLIES_URL = "https://api.fireflies.ai/graphql";

type SourceItem = {
  source: "email" | "meeting" | "pipedrive";
  source_id: string;
  source_label: string;
  source_url?: string | null;
  source_date?: string | null;
  text: string;
  /** When set, overrides the AI-generated title (used for Pipedrive). */
  title_override?: string | null;
};

type AISuggestion = {
  title: string;
  description?: string;
  suggested_category?: "urgent" | "important" | "circumstantial";
  suggested_duration_minutes?: number;
  suggested_date?: string;
  reasoning?: string;
};

async function refreshOutlookToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID!,
    client_secret: process.env.MS_CLIENT_SECRET!,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: "offline_access openid profile User.Read Mail.Read Calendars.ReadWrite Tasks.ReadWrite Group.Read.All",
  });
  const r = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await r.json();
  if (!r.ok) throw new Error(`Outlook refresh failed: ${JSON.stringify(json).slice(0, 300)}`);
  return json as { access_token: string; refresh_token?: string; expires_in: number };
}

async function fetchOutlookEmails(userId: string): Promise<SourceItem[]> {
  const { data: conn } = await supabaseAdmin
    .from("outlook_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!conn) return [];

  let accessToken = conn.access_token as string;
  if (new Date(conn.expires_at as string).getTime() - Date.now() < 120_000) {
    try {
      const refreshed = await refreshOutlookToken(conn.refresh_token as string);
      accessToken = refreshed.access_token;
      await supabaseAdmin.from("outlook_connections").update({
        access_token: accessToken,
        refresh_token: refreshed.refresh_token ?? conn.refresh_token,
        expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      }).eq("user_id", userId);
    } catch (e) {
      console.error("outlook refresh", e);
      return [];
    }
  }

  // Look back 60 days so older unanswered emails (e.g. weeks-old questions) still surface.
  const since = new Date(Date.now() - 60 * 24 * 3600_000).toISOString();
  const userEmail = (conn.email as string | null)?.toLowerCase() ?? null;

  const inboxUrl = `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=100&$orderby=receivedDateTime desc&$filter=receivedDateTime ge ${since}&$select=id,subject,bodyPreview,from,receivedDateTime,webLink,conversationId,isDraft,categories`;
  const inboxR = await fetch(inboxUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!inboxR.ok) {
    console.error("outlook inbox fetch failed", inboxR.status);
    return [];
  }
  const inboxJson = await inboxR.json();
  type Msg = {
    id: string;
    subject?: string;
    bodyPreview?: string;
    from?: { emailAddress?: { address?: string; name?: string } };
    receivedDateTime?: string;
    webLink?: string;
    conversationId?: string;
    isDraft?: boolean;
    categories?: string[];
  };
  const inboxMsgs = (inboxJson.value ?? []) as Msg[];

  // Skip emails the user already tagged with "Foco App" — those are considered already
  // triaged into the app. We scan only emails WITHOUT that category.
  const FOCO_CATEGORY = "foco app";
  const untagged = inboxMsgs.filter((m) =>
    !(m.categories ?? []).some((c) => (c ?? "").trim().toLowerCase() === FOCO_CATEGORY),
  );
  if (untagged.length === 0) return [];

  // Pull sent items in the same window to detect replies by conversation.
  const sentUrl = `https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages?$top=200&$orderby=sentDateTime desc&$filter=sentDateTime ge ${since}&$select=conversationId,sentDateTime`;
  const sentR = await fetch(sentUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  type SentMsg = { conversationId?: string; sentDateTime?: string };
  const sentMsgs = sentR.ok ? (((await sentR.json()).value ?? []) as SentMsg[]) : [];
  const lastSentByConv = new Map<string, number>();
  for (const s of sentMsgs) {
    if (!s.conversationId || !s.sentDateTime) continue;
    const t = new Date(s.sentDateTime).getTime();
    const prev = lastSentByConv.get(s.conversationId) ?? 0;
    if (t > prev) lastSentByConv.set(s.conversationId, t);
  }

  // Keep only "Foco App" emails NOT sent by me and NOT already replied to.
  const pending = untagged.filter((m) => {
    if (m.isDraft) return false;
    const fromAddr = m.from?.emailAddress?.address?.toLowerCase() ?? "";
    if (userEmail && fromAddr === userEmail) return false;
    if (!fromAddr) return false;
    const received = m.receivedDateTime ? new Date(m.receivedDateTime).getTime() : 0;
    const lastSent = m.conversationId ? lastSentByConv.get(m.conversationId) ?? 0 : 0;
    if (lastSent > received) return false;
    return true;
  });

  return pending.map((m) => ({
    source: "email" as const,
    source_id: m.id,
    source_label: `${m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? "Email"}: ${m.subject ?? "(sem assunto)"}`,
    source_url: m.webLink ?? null,
    source_date: m.receivedDateTime ?? null,
    text: `De: ${m.from?.emailAddress?.name ?? ""} <${m.from?.emailAddress?.address ?? ""}>\nAssunto: ${m.subject ?? ""}\nRecebido em: ${m.receivedDateTime ?? ""}\nStatus: pendente de resposta\n\n${m.bodyPreview ?? ""}`,
  }));
}

async function fetchFireflies(userId: string, userEmail: string | null, userName: string | null): Promise<SourceItem[]> {
  const { data: conn } = await supabaseAdmin
    .from("fireflies_connections")
    .select("api_key")
    .eq("user_id", userId)
    .maybeSingle();
  const ffKey = conn?.api_key as string | undefined;
  if (!ffKey) return [];
  try {
    const r = await fetch(FIREFLIES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ffKey}`,
      },
      body: JSON.stringify({
        // Pull more transcripts and the participants list so we can match action
        // items to the actual user (not only meetings they hosted).
        query: `query { transcripts(limit: 30) { id title date host_email participants summary { overview action_items } } }`,
      }),
    });
    if (!r.ok) {
      console.error("fireflies http", r.status, await r.text());
      return [];
    }
    const json = await r.json();
    type T = {
      id: string;
      title?: string;
      date?: number;
      host_email?: string;
      participants?: string[];
      summary?: { overview?: string; action_items?: string };
    };
    const ts = (json?.data?.transcripts ?? []) as T[];

    // Build identity tokens for the user. We match action item headers like
    // "**John Doe (john@acme.com)**" against any of: full email, email local part,
    // display name tokens (>2 chars). This catches meetings the user attended
    // but did NOT host — previously those were silently dropped.
    const emailLower = (userEmail ?? "").toLowerCase();
    const emailLocal = emailLower.split("@")[0] ?? "";
    const nameTokens = (userName ?? "")
      .toLowerCase()
      .split(/[\s._-]+/)
      .filter((t) => t.length > 2);
    const localTokens = emailLocal.split(/[._-]+/).filter((t) => t.length > 2);
    const allTokens = Array.from(new Set([emailLower, emailLocal, ...nameTokens, ...localTokens])).filter(Boolean);

    function actionItemsForUser(actionItems: string, hostEmail?: string): string {
      if (!actionItems) return "";
      const blocks = actionItems.split(/\n(?=\*\*[^*]+\*\*)/g);
      const matches = blocks.filter((b) => {
        const headerMatch = b.match(/^\*\*([^*]+)\*\*/);
        if (!headerMatch) return false;
        const header = headerMatch[1].toLowerCase();
        // Match by user's own identity
        if (allTokens.some((tok) => tok && header.includes(tok))) return true;
        // Fallback: if we have no user identity, match host (legacy behavior)
        if (allTokens.length === 0 && hostEmail && header.includes(hostEmail.toLowerCase())) return true;
        return false;
      });
      return matches.join("\n").trim();
    }

    return ts
      .map((t) => {
        const myItems = actionItemsForUser(t.summary?.action_items ?? "", t.host_email);
        return { t, myItems };
      })
      .filter(({ myItems }) => myItems.length > 0)
      .map(({ t, myItems }) => ({
        source: "meeting" as const,
        source_id: t.id,
        source_label: `Reunião: ${t.title ?? "(sem título)"}`,
        source_url: null,
        source_date: t.date ? new Date(t.date).toISOString() : null,
        text: `Reunião: ${t.title ?? ""}\nHost: ${t.host_email ?? ""}\n\nAction items atribuídos AO USUÁRIO (${userEmail ?? "?"}):\n${myItems}`,
      }));
  } catch (e) {
    console.error("fireflies", e);
    return [];
  }
}

async function getPipedriveCreds(userId: string): Promise<{ token: string; domain: string } | null> {
  const { data } = await supabaseAdmin
    .from("pipedrive_connections")
    .select("api_token,domain")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.api_token && data?.domain) {
    return { token: data.api_token as string, domain: data.domain as string };
  }
  return null;
}

async function fetchPipedrive(userId: string): Promise<SourceItem[]> {
  const creds = await getPipedriveCreds(userId);
  if (!creds) return [];
  const { token, domain } = creds;
  try {
    const base = `https://${domain}.pipedrive.com/api/v1`;

    // Get the authenticated Pipedrive user id (the token's owner).
    const meR = await fetch(`${base}/users/me?api_token=${token}`);
    if (!meR.ok) {
      console.error("pipedrive /users/me failed", meR.status);
      return [];
    }
    const meJson = await meR.json();
    const pdUserId = meJson?.data?.id as number | undefined;
    if (!pdUserId) {
      console.error("pipedrive: no user id from /users/me");
      return [];
    }

    const startDate = new Date(Date.now() - 1 * 86400_000).toISOString().slice(0, 10);
    const endDate = new Date(Date.now() + 21 * 86400_000).toISOString().slice(0, 10);
    const r = await fetch(
      `${base}/activities?user_id=${pdUserId}&done=0&start_date=${startDate}&end_date=${endDate}&start=0&limit=100&api_token=${token}`,
    );
    if (!r.ok) {
      console.error("pipedrive activities failed", r.status);
      return [];
    }
    const json = await r.json();
    type Activity = {
      id: number;
      subject?: string;
      type?: string;
      note?: string | null;
      public_description?: string | null;
      due_date?: string | null;
      due_time?: string | null;
      done?: boolean;
      org_id?: number | null;
      org_name?: string | null;
      person_id?: number | null;
      person_name?: string | null;
      deal_title?: string | null;
      deal_id?: number | null;
      user_id?: number | null;
      assigned_to_user_id?: number | null;
      update_time?: string;
      add_time?: string;
    };
    const allActs = (json?.data ?? []) as Activity[];
    // Filtros: (1) pendente, (2) atribuída ao usuário conectado, (3) vinculada
    // a deal/org/pessoa, (4) tipo diferente de reunião presencial/online.
    const EXCLUDED_TYPES = new Set([
      "meeting",
      "reunio_online",
      "reuniao_online",
      "reunião_online",
      "reuniao_presencial",
      "reunião_presencial",
      "reunio_presencial",
    ]);
    const acts = allActs.filter((a) => {
      if (a.done) return false;
      const owner = a.assigned_to_user_id ?? a.user_id;
      if (owner !== pdUserId) return false;
      if (!(a.deal_id || a.org_id || a.person_id)) return false;
      const t = (a.type ?? "").toLowerCase();
      if (EXCLUDED_TYPES.has(t)) return false;
      return true;
    });
    return acts.slice(0, 60).map((a) => ({
      source: "pipedrive" as const,
      source_id: `activity_${a.id}`,
      source_label: `Pipedrive: ${a.subject ?? a.type ?? "Atividade"}${a.org_name ? ` (${a.org_name})` : a.person_name ? ` (${a.person_name})` : ""}`,
      source_url: `https://${domain}.pipedrive.com/activities/list#dialog/activity/${a.id}`,
      source_date: a.due_date ?? a.update_time ?? a.add_time ?? null,
      text: `Atividade: ${a.subject ?? "—"}\nTipo: ${a.type ?? "—"}\nVencimento: ${a.due_date ?? "—"} ${a.due_time ?? ""}\nDeal: ${a.deal_title ?? "—"}\nOrganização: ${a.org_name ?? "—"}\nPessoa: ${a.person_name ?? "—"}\nNota: ${(a.note ?? a.public_description ?? "").replace(/<[^>]+>/g, "").slice(0, 800)}`,
      title_override: (a.subject ?? "").trim() || null,
    }));
  } catch (e) {
    console.error("pipedrive", e);
    return [];
  }
}


// Poll Pipedrive for activities recently marked as "done" and complete any
// linked task in our DB (Pipedrive → App sync).
async function syncPipedriveCompletionsToApp(userId: string): Promise<void> {
  const creds = await getPipedriveCreds(userId);
  if (!creds) return;
  const { token, domain } = creds;
  try {
    const base = `https://${domain}.pipedrive.com/api/v1`;
    const meR = await fetch(`${base}/users/me?api_token=${token}`);
    if (!meR.ok) return;
    const meJson = await meR.json();
    const pdUserId = meJson?.data?.id as number | undefined;
    if (!pdUserId) return;

    const startDate = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const endDate = new Date(Date.now() + 1 * 86400_000).toISOString().slice(0, 10);
    const r = await fetch(
      `${base}/activities?user_id=${pdUserId}&done=1&start_date=${startDate}&end_date=${endDate}&start=0&limit=200&api_token=${token}`,
    );
    if (!r.ok) return;
    const json = await r.json();
    const acts = (json?.data ?? []) as Array<{ id: number }>;
    if (acts.length === 0) return;

    const candidateUrls = acts.map(
      (a) => `https://${domain}.pipedrive.com/activities/list#dialog/activity/${a.id}`,
    );
    const { data: linkedTasks } = await supabaseAdmin
      .from("tasks")
      .select("id")
      .eq("user_id", userId)
      .eq("origin_source", "pipedrive")
      .eq("completed", false)
      .in("origin_source_url", candidateUrls);

    if (!linkedTasks || linkedTasks.length === 0) return;
    const ids = linkedTasks.map((t) => t.id as string);
    await supabaseAdmin
      .from("tasks")
      .update({
        completed: true,
        completed_at: new Date().toISOString(),
        status: "done",
      } as never)
      .in("id", ids);
  } catch (e) {
    console.error("pipedrive→app sync", e);
  }
}

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function aiExtractTasks(
  items: SourceItem[],
  existingContext: { openTasks: string[]; projects: string[] },
): Promise<Array<{ source_index: number; suggestions: AISuggestion[] }>> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey || items.length === 0) return [];

  const today = new Date().toISOString().slice(0, 10);
  const numbered = items.map((it, i) => `### ITEM ${i} (${it.source})\n${it.text.slice(0, 2000)}`).join("\n\n");

  const existingBlock = [
    existingContext.projects.length > 0
      ? `PROJETOS ATIVOS DO USUÁRIO:\n${existingContext.projects.map((p) => `- ${p}`).join("\n")}`
      : "",
    existingContext.openTasks.length > 0
      ? `TAREFAS JÁ CADASTRADAS (abertas, não concluídas — NÃO duplicar):\n${existingContext.openTasks.slice(0, 200).map((t) => `- ${t}`).join("\n")}`
      : "",
  ].filter(Boolean).join("\n\n");

  const r = await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `Você analisa e-mails, atas de reunião e deals do CRM e extrai tarefas concretas que o USUÁRIO precisa fazer. Hoje é ${today}.

Regras estritas:
- Para E-MAILS marcados como "pendente de resposta": se o e-mail contém uma pergunta direta, um pedido, uma solicitação de retorno, ou claramente espera uma resposta do usuário, gere UMA sugestão "Responder a <Nome>: <assunto curto>" mesmo que não haja prazo explícito. Use a data de recebimento para calibrar urgência (>7 dias atrasada = urgent).
- Para REUNIÕES: o texto já contém apenas action items atribuídos AO USUÁRIO (host). Mesmo assim, só gere sugestão quando houver verbo de ação claro e ação concreta. Se houver dúvida sobre quem é responsável, NÃO crie sugestão.
- Para CRM: SÓ extraia se há ação CLARA pedida ao usuário (verbo de ação, prazo ou compromisso explícito).
- IGNORE newsletters, marketing, notificações automáticas (no-reply, noreply), confirmações, FYI puros, e ações de outras pessoas.
- DEDUPLICAÇÃO CRÍTICA: Se a ação já existe na lista de "TAREFAS JÁ CADASTRADAS" abaixo (mesmo que com palavras ligeiramente diferentes, mesmo assunto/contato/objetivo), NÃO crie sugestão. Prefira pular a duplicar.
- Para cada item de entrada, retorne 0 ou mais sugestões.
- Categoria: "urgent" (prazo <= 2 dias OU e-mail pendente há > 7 dias), "important" (sem prazo crítico), "circumstantial" (rotina).
- Duração em minutos: 15, 30, 60, 90 ou 120 (responder e-mail = 15 ou 30).
- Data sugerida (YYYY-MM-DD): hoje ou próxima data útil razoável.
- Título curto e acionável (verbo no infinitivo). Para e-mails: "Responder <Nome>: <tema>".

${existingBlock}

Retorne JSON válido:
{"results":[{"source_index":0,"suggestions":[{"title":"...","description":"...","suggested_category":"important","suggested_duration_minutes":30,"suggested_date":"${today}","reasoning":"..."}]}]}`,
        },
        { role: "user", content: numbered },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!r.ok) {
    console.error("AI failed", r.status, await r.text());
    return [];
  }
  const json = await r.json();
  const content = json.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(content);
    return (parsed.results ?? []) as Array<{ source_index: number; suggestions: AISuggestion[] }>;
  } catch {
    return [];
  }
}

export async function scanForUser(userId: string) {
  // Bidirectional sync: pull Pipedrive completions into the app first
  await syncPipedriveCompletionsToApp(userId);
  // Look up the user's email/name (used to attribute Fireflies action items).
  const { data: oconn } = await supabaseAdmin
    .from("outlook_connections")
    .select("email,display_name")
    .eq("user_id", userId)
    .maybeSingle();
  const userEmail = (oconn?.email as string | null) ?? null;
  const userName = (oconn?.display_name as string | null) ?? null;

  // Collect sources
  const [emails, meetings, deals] = await Promise.all([
    fetchOutlookEmails(userId),
    fetchFireflies(userId, userEmail, userName),
    fetchPipedrive(userId),
  ]);
  const all = [...emails, ...meetings, ...deals];
  if (all.length === 0) return { user_id: userId, scanned: 0, created: 0 };

  // Filter out items that already have a suggestion (any status) or an existing task linked to them.
  const { data: existingSugs } = await supabaseAdmin
    .from("inbox_suggestions")
    .select("source,source_id")
    .eq("user_id", userId);
  const seenSug = new Set((existingSugs ?? []).map((p) => `${p.source}:${p.source_id}`));

  const sourceUrls = all.map((it) => it.source_url).filter(Boolean) as string[];
  const linkedUrls = new Set<string>();
  if (sourceUrls.length > 0) {
    const { data: linkedTasks } = await supabaseAdmin
      .from("tasks")
      .select("origin_source_url")
      .eq("user_id", userId)
      .in("origin_source_url", sourceUrls);
    for (const t of linkedTasks ?? []) {
      if (t.origin_source_url) linkedUrls.add(t.origin_source_url as string);
    }
  }

  const fresh = all.filter((it) => {
    if (seenSug.has(`${it.source}:${it.source_id}`)) return false;
    if (it.source_url && linkedUrls.has(it.source_url)) return false;
    return true;
  });
  if (fresh.length === 0) {
    await supabaseAdmin.from("inbox_scan_state").upsert({
      user_id: userId,
      last_scan_at: new Date().toISOString(),
      last_status: "ok",
      last_error: null,
      updated_at: new Date().toISOString(),
    } as never);
    return { user_id: userId, scanned: 0, created: 0 };
  }

  // Fetch existing open tasks + active projects so the AI (and a post-filter)
  // can avoid duplicating things the user already has on their plate.
  const [{ data: openTasks }, { data: activeProjects }] = await Promise.all([
    supabaseAdmin
      .from("tasks")
      .select("title")
      .eq("user_id", userId)
      .eq("completed", false)
      .order("scheduled_date", { ascending: false })
      .limit(300),
    supabaseAdmin
      .from("projects")
      .select("name")
      .eq("user_id", userId)
      .in("status", ["active", "paused"])
      .limit(100),
  ]);
  const openTitles = (openTasks ?? []).map((t) => (t.title as string) ?? "").filter(Boolean);
  const projectNames = (activeProjects ?? []).map((p) => (p.name as string) ?? "").filter(Boolean);
  const openTitleSet = new Set(openTitles.map(normalizeTitle));

  // AI extract
  const results = await aiExtractTasks(fresh, { openTasks: openTitles, projects: projectNames });

  // Persist
  let created = 0;
  for (const r of results) {
    const item = fresh[r.source_index];
    if (!item) continue;
    for (const s of r.suggestions ?? []) {
      // Post-filter: drop suggestions whose title matches an existing open task.
      const norm = normalizeTitle(s.title ?? "");
      if (!norm) continue;
      if (openTitleSet.has(norm)) continue;
      // Also drop near-duplicates (one contains the other, both reasonably long).
      let duplicate = false;
      for (const existing of openTitleSet) {
        if (norm.length >= 8 && existing.length >= 8 && (existing.includes(norm) || norm.includes(existing))) {
          duplicate = true;
          break;
        }
      }
      if (duplicate) continue;

      const finalTitle = item.title_override?.trim() || s.title;
      const { error } = await supabaseAdmin.from("inbox_suggestions").insert({
        user_id: userId,
        title: finalTitle,
        description: s.description ?? null,
        source: item.source,
        source_id: item.source_id,
        source_label: item.source_label,
        source_url: item.source_url,
        source_date: item.source_date,
        suggested_category: s.suggested_category ?? "important",
        suggested_duration_minutes: s.suggested_duration_minutes ?? 30,
        suggested_date: s.suggested_date ?? new Date().toISOString().slice(0, 10),
        reasoning: s.reasoning ?? null,
      } as never);
      if (!error) {
        created++;
        openTitleSet.add(norm); // prevent dup within the same batch
      }
    }
  }

  await supabaseAdmin.from("inbox_scan_state").upsert({
    user_id: userId,
    last_scan_at: new Date().toISOString(),
    last_status: "ok",
    last_error: null,
    updated_at: new Date().toISOString(),
  } as never);

  return { user_id: userId, scanned: fresh.length, created };
}

export const Route = createFileRoute("/api/public/inbox/scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let authedUserId: string;
        try {
          authedUserId = await authenticateRequest(request);
        } catch (e) {
          if (e instanceof Response) return e;
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          // Always scan only the authenticated user. Ignore any user_id query param.
          const results: unknown[] = [];
          try {
            results.push(await scanForUser(authedUserId));
          } catch (e) {
            const msg = e instanceof Error ? e.message : "erro";
            console.error("scan user", authedUserId, msg);
            await supabaseAdmin.from("inbox_scan_state").upsert({
              user_id: authedUserId,
              last_scan_at: new Date().toISOString(),
              last_status: "error",
              last_error: msg.slice(0, 500),
              updated_at: new Date().toISOString(),
            } as never);
            results.push({ user_id: authedUserId, error: "scan failed" });
          }
          return Response.json({ ok: true, results });
        } catch (e) {
          console.error("[inbox/scan] internal error", e);
          return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
