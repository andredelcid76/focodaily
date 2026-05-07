import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const FIREFLIES_URL = "https://connector-gateway.lovable.dev/fireflies/graphql";

type SourceItem = {
  source: "email" | "meeting" | "pipedrive";
  source_id: string;
  source_label: string;
  source_url?: string | null;
  source_date?: string | null;
  text: string;
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

  const since = new Date(Date.now() - 3 * 24 * 3600_000).toISOString();
  const url = `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=25&$orderby=receivedDateTime desc&$filter=receivedDateTime ge ${since}&$select=id,subject,bodyPreview,from,receivedDateTime,webLink`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) {
    console.error("outlook fetch failed", r.status);
    return [];
  }
  const json = await r.json();
  type Msg = { id: string; subject?: string; bodyPreview?: string; from?: { emailAddress?: { address?: string; name?: string } }; receivedDateTime?: string; webLink?: string };
  const msgs = (json.value ?? []) as Msg[];
  return msgs.map((m) => ({
    source: "email" as const,
    source_id: m.id,
    source_label: `${m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? "Email"}: ${m.subject ?? "(sem assunto)"}`,
    source_url: m.webLink ?? null,
    source_date: m.receivedDateTime ?? null,
    text: `De: ${m.from?.emailAddress?.name ?? ""} <${m.from?.emailAddress?.address ?? ""}>\nAssunto: ${m.subject ?? ""}\n\n${m.bodyPreview ?? ""}`,
  }));
}

async function fetchFireflies(): Promise<SourceItem[]> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const ffKey = process.env.FIREFLIES_API_KEY;
  if (!lovableKey || !ffKey) return [];
  try {
    const r = await fetch(FIREFLIES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": ffKey,
      },
      body: JSON.stringify({
        query: `query { transcripts(limit: 10) { id title date summary { overview action_items } } }`,
      }),
    });
    if (!r.ok) return [];
    const json = await r.json();
    type T = { id: string; title?: string; date?: number; summary?: { overview?: string; action_items?: string } };
    const ts = (json?.data?.transcripts ?? []) as T[];
    return ts.map((t) => ({
      source: "meeting" as const,
      source_id: t.id,
      source_label: `Reunião: ${t.title ?? "(sem título)"}`,
      source_url: null,
      source_date: t.date ? new Date(t.date).toISOString() : null,
      text: `Reunião: ${t.title ?? ""}\n\nResumo: ${t.summary?.overview ?? ""}\n\nAction items: ${t.summary?.action_items ?? ""}`,
    }));
  } catch (e) {
    console.error("fireflies", e);
    return [];
  }
}

async function fetchPipedrive(): Promise<SourceItem[]> {
  const token = process.env.PIPEDRIVE_API_TOKEN;
  const domain = process.env.PIPEDRIVE_DOMAIN;
  if (!token || !domain) return [];
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

    // Activities assigned to that specific user, not done, recent.
    const r = await fetch(
      `${base}/activities?user_id=${pdUserId}&done=0&start=0&limit=50&api_token=${token}`,
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
      org_name?: string | null;
      person_name?: string | null;
      deal_title?: string | null;
      deal_id?: number | null;
      update_time?: string;
      add_time?: string;
    };
    const acts = (json?.data ?? []) as Activity[];
    return acts.slice(0, 20).map((a) => ({
      source: "pipedrive" as const,
      source_id: `activity_${a.id}`,
      source_label: `Pipedrive: ${a.subject ?? a.type ?? "Atividade"}${a.org_name ? ` (${a.org_name})` : a.person_name ? ` (${a.person_name})` : ""}`,
      source_url: `https://${domain}.pipedrive.com/activities/list#dialog/activity/${a.id}`,
      source_date: a.due_date ?? a.update_time ?? a.add_time ?? null,
      text: `Atividade: ${a.subject ?? "—"}\nTipo: ${a.type ?? "—"}\nVencimento: ${a.due_date ?? "—"} ${a.due_time ?? ""}\nDeal: ${a.deal_title ?? "—"}\nOrganização: ${a.org_name ?? "—"}\nPessoa: ${a.person_name ?? "—"}\nNota: ${(a.note ?? a.public_description ?? "").replace(/<[^>]+>/g, "").slice(0, 800)}`,
    }));
  } catch (e) {
    console.error("pipedrive", e);
    return [];
  }
}

async function aiExtractTasks(items: SourceItem[]): Promise<Array<{ source_index: number; suggestions: AISuggestion[] }>> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey || items.length === 0) return [];

  const today = new Date().toISOString().slice(0, 10);
  const numbered = items.map((it, i) => `### ITEM ${i} (${it.source})\n${it.text.slice(0, 2000)}`).join("\n\n");

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
- SÓ extraia se há ação CLARA pedida ao usuário (verbo de ação, prazo ou compromisso explícito).
- IGNORE newsletters, notificações automáticas, FYI, e ações de outras pessoas.
- Para cada item de entrada, retorne 0 ou mais sugestões.
- Categoria: "urgent" (prazo <= 2 dias), "important" (sem prazo crítico), "circumstantial" (rotina).
- Duração em minutos: 15, 30, 60, 90 ou 120.
- Data sugerida (YYYY-MM-DD): hoje ou próxima data útil razoável.
- Título curto e acionável (verbo no infinitivo).

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

async function scanForUser(userId: string) {
  // Collect sources
  const [emails, meetings, deals] = await Promise.all([
    fetchOutlookEmails(userId),
    fetchFireflies(),
    fetchPipedrive(),
  ]);
  const all = [...emails, ...meetings, ...deals];
  if (all.length === 0) return { user_id: userId, scanned: 0, created: 0 };

  // Filter out already-processed
  const { data: processed } = await supabaseAdmin
    .from("inbox_processed_sources")
    .select("source,source_id")
    .eq("user_id", userId)
    .in("source", ["email", "meeting", "pipedrive"]);
  const seen = new Set((processed ?? []).map((p) => `${p.source}:${p.source_id}`));
  const fresh = all.filter((it) => !seen.has(`${it.source}:${it.source_id}`));
  if (fresh.length === 0) return { user_id: userId, scanned: 0, created: 0 };

  // AI extract
  const results = await aiExtractTasks(fresh);

  // Persist
  let created = 0;
  for (const r of results) {
    const item = fresh[r.source_index];
    if (!item) continue;
    for (const s of r.suggestions ?? []) {
      const { error } = await supabaseAdmin.from("inbox_suggestions").insert({
        user_id: userId,
        title: s.title,
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
      if (!error) created++;
    }
  }

  // Mark all fresh items as processed (even those that yielded no suggestion)
  await supabaseAdmin.from("inbox_processed_sources").insert(
    fresh.map((it) => ({ user_id: userId, source: it.source, source_id: it.source_id })) as never,
  );

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
        try {
          const url = new URL(request.url);
          const specificUser = url.searchParams.get("user_id");

          let userIds: string[];
          if (specificUser) {
            userIds = [specificUser];
          } else {
            // Scan all users that have an outlook connection
            const { data } = await supabaseAdmin.from("outlook_connections").select("user_id");
            userIds = (data ?? []).map((r) => r.user_id as string);
          }

          const results: unknown[] = [];
          for (const uid of userIds) {
            try {
              results.push(await scanForUser(uid));
            } catch (e) {
              const msg = e instanceof Error ? e.message : "erro";
              console.error("scan user", uid, msg);
              await supabaseAdmin.from("inbox_scan_state").upsert({
                user_id: uid,
                last_scan_at: new Date().toISOString(),
                last_status: "error",
                last_error: msg.slice(0, 500),
                updated_at: new Date().toISOString(),
              } as never);
              results.push({ user_id: uid, error: msg });
            }
          }
          return Response.json({ ok: true, results });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "erro";
          return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
      },
    },
  },
});
