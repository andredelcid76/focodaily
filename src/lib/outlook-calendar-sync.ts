import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getValidOutlookAccessToken } from "@/lib/outlook-token";

type GraphEvent = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  location?: { displayName?: string };
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isAllDay?: boolean;
  webLink?: string;
};

/**
 * Syncs Outlook calendar (7 days back → 60 days ahead) into `meetings`.
 * - Follows @odata.nextLink so no events are lost beyond the first page.
 * - Removes stale meetings (cancelled / series split in Outlook) by comparing
 *   IDs in code and deleting by row id in small chunks — never via a huge
 *   `not in (...)` URL, which silently failed before.
 * - Throws if the stale cleanup fails, instead of only logging.
 */
export async function syncOutlookCalendar(userId: string) {
  const { data: conn, error: connErr } = await supabaseAdmin
    .from("outlook_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (connErr) throw new Error(connErr.message);
  if (!conn) throw new Error("Outlook não está conectado");

  const accessToken = await getValidOutlookAccessToken(userId, conn);

  const start = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const end = new Date(Date.now() + 60 * 24 * 3600_000).toISOString();
  let nextUrl: string | null =
    `https://graph.microsoft.com/v1.0/me/calendarView?` +
    `startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}` +
    `&$select=id,subject,bodyPreview,location,start,end,isAllDay,webLink&$top=200&$orderby=start/dateTime`;

  const events: GraphEvent[] = [];
  let pages = 0;
  while (nextUrl && pages < 50) {
    pages++;
    const res: Response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Graph API error [${res.status}]: ${body}`);
    }
    const page = (await res.json()) as { value?: GraphEvent[]; "@odata.nextLink"?: string };
    events.push(...(page.value ?? []));
    nextUrl = page["@odata.nextLink"] ?? null;
  }
  if (nextUrl) throw new Error("Agenda do Outlook grande demais: sincronização interrompida para não apagar reuniões por engano");

  let imported = 0;
  const errors: string[] = [];
  const fetchedIds = new Set<string>();

  for (const ev of events) {
    const startsAt = new Date(ev.start.dateTime + "Z").toISOString();
    const endsAt = new Date(ev.end.dateTime + "Z").toISOString();
    fetchedIds.add(ev.id);
    const { error } = await supabaseAdmin.from("meetings").upsert(
      {
        user_id: userId,
        external_id: ev.id,
        source: "outlook",
        title: ev.subject || "(sem título)",
        description: ev.bodyPreview || null,
        location: ev.location?.displayName || null,
        starts_at: startsAt,
        ends_at: endsAt,
        scheduled_date: startsAt.slice(0, 10),
        is_all_day: !!ev.isAllDay,
        web_link: ev.webLink || null,
        color: "#0078d4",
      },
      { onConflict: "user_id,external_id" },
    );
    if (error) {
      errors.push(`${ev.subject || ev.id}: ${error.message}`);
      console.error("[outlook sync] upsert failed", ev.id, error);
    } else imported++;
  }

  if (events.length > 0 && imported === 0 && errors.length > 0) {
    throw new Error(`Falha ao salvar reuniões: ${errors[0]}`);
  }

  // Stale cleanup: load all local outlook meetings in window (paginated).
  const startDate = start.slice(0, 10);
  const endDate = end.slice(0, 10);
  const staleIds: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from("meetings")
      .select("id, external_id")
      .eq("user_id", userId)
      .eq("source", "outlook")
      .gte("scheduled_date", startDate)
      .lte("scheduled_date", endDate)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`Falha ao verificar reuniões removidas: ${error.message}`);
    for (const row of data ?? []) {
      if (!row.external_id || !fetchedIds.has(row.external_id)) staleIds.push(row.id);
    }
    if (!data || data.length < 1000) break;
  }

  let removed = 0;
  for (let i = 0; i < staleIds.length; i += 100) {
    const chunk = staleIds.slice(i, i + 100);
    const { count, error } = await supabaseAdmin
      .from("meetings")
      .delete({ count: "exact" })
      .in("id", chunk);
    if (error) throw new Error(`Falha ao remover reuniões canceladas: ${error.message}`);
    removed += count ?? 0;
  }

  const { error: syncError } = await supabaseAdmin
    .from("outlook_connections")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (syncError) throw new Error(syncError.message);

  console.log("[outlook sync]", { userId, total: events.length, pages, imported, removed, errors: errors.length });
  return { imported, removed, total: events.length, errors };
}
