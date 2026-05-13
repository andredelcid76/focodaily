import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TENANT = "common"; // multi-tenant + personal accounts
const SCOPES = "offline_access openid profile User.Read Calendars.ReadWrite Tasks.ReadWrite Group.Read.All";
const LOVABLE_PROJECT_ID = "0f679b02-63a6-46ee-ae66-8b953bfe9f15";

function getRedirectUri(origin: string) {
  try {
    const url = new URL(origin);

    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return `${url.origin}/api/public/outlook/callback`;
    }

    if (url.hostname.endsWith(".lovableproject.com")) {
      return `https://id-preview--${LOVABLE_PROJECT_ID}.lovable.app/api/public/outlook/callback`;
    }

    return `${url.origin}/api/public/outlook/callback`;
  } catch {
    return `https://id-preview--${LOVABLE_PROJECT_ID}.lovable.app/api/public/outlook/callback`;
  }
}

function authBase() {
  return `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`;
}

/** Step 1: returns the URL the browser should navigate to. */
export const getOutlookAuthUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { origin: string }) => data)
  .handler(async ({ data, context }) => {
    const clientId = process.env.MS_CLIENT_ID;
    if (!clientId) throw new Error("MS_CLIENT_ID is not configured");

    const redirectUri = getRedirectUri(data.origin);
    // state = userId so callback (without auth header) can attribute it
    const state = context.userId;

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: SCOPES,
      state,
      prompt: "select_account",
    });

    return { url: `${authBase()}/authorize?${params.toString()}` };
  });

/** Returns connection status for the current user. */
export const getOutlookStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Record<string, never> | undefined) => data ?? {})
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("outlook_connections_safe")
      .select("email, display_name, last_sync_at, expires_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { connected: !!data, connection: data ?? null };
  });

/** Disconnect: drop tokens. */
export const disconnectOutlook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Record<string, never> | undefined) => data ?? {})
  .handler(async ({ context }) => {
    const { error } = await supabaseAdmin
      .from("outlook_connections")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { success: true };
  });

async function refreshAccessToken(refreshToken: string) {
  const clientId = process.env.MS_CLIENT_ID!;
  const clientSecret = process.env.MS_CLIENT_SECRET!;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: SCOPES,
  });
  const res = await fetch(`${authBase()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Refresh token failed [${res.status}]: ${JSON.stringify(json)}`);
  return json as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };
}

/** Sync calendar events from Outlook into meetings table. */
export const syncOutlookCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Record<string, never> | undefined) => data ?? {})
  .handler(async ({ context }) => {
    const { userId } = context;

    const { data: conn, error: connErr } = await supabaseAdmin
      .from("outlook_connections")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (connErr) throw new Error(connErr.message);
    if (!conn) throw new Error("Outlook não está conectado");

    // Refresh access token if expiring in <2min
    let accessToken = conn.access_token as string;
    const expiresAt = new Date(conn.expires_at as string).getTime();
    if (expiresAt - Date.now() < 120_000) {
      const refreshed = await refreshAccessToken(conn.refresh_token as string);
      accessToken = refreshed.access_token;
      const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await supabaseAdmin
        .from("outlook_connections")
        .update({
          access_token: accessToken,
          refresh_token: refreshed.refresh_token ?? conn.refresh_token,
          expires_at: newExpiresAt,
          scope: refreshed.scope ?? conn.scope,
        })
        .eq("user_id", userId);
    }

    // Fetch upcoming events: from 7 days ago to 60 days ahead
    const start = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const end = new Date(Date.now() + 60 * 24 * 3600_000).toISOString();
    const url =
      `https://graph.microsoft.com/v1.0/me/calendarView?` +
      `startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}` +
      `&$select=id,subject,bodyPreview,location,start,end,isAllDay,webLink&$top=200&$orderby=start/dateTime`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.timezone="UTC"',
      },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`Graph API error [${res.status}]: ${JSON.stringify(json)}`);

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
    const events = (json.value ?? []) as GraphEvent[];

    let imported = 0;
    const fetchedIds: string[] = [];
    for (const ev of events) {
      const startsAt = new Date(ev.start.dateTime + "Z").toISOString();
      const endsAt = new Date(ev.end.dateTime + "Z").toISOString();
      const scheduledDate = startsAt.slice(0, 10);
      fetchedIds.push(ev.id);
      const { error } = await supabaseAdmin
        .from("meetings")
        .upsert(
          {
            user_id: userId,
            external_id: ev.id,
            source: "outlook",
            title: ev.subject || "(sem título)",
            description: ev.bodyPreview || null,
            location: ev.location?.displayName || null,
            starts_at: startsAt,
            ends_at: endsAt,
            scheduled_date: scheduledDate,
            is_all_day: !!ev.isAllDay,
            web_link: ev.webLink || null,
            color: "#0078d4",
          },
          { onConflict: "user_id,external_id" }
        );
      if (!error) imported++;
    }

    // Delete meetings (source=outlook) within the synced window that are no
    // longer present in Outlook (i.e. cancelled / removed by the user).
    const startDate = start.slice(0, 10);
    const endDate = end.slice(0, 10);
    let removed = 0;
    {
      const delQuery = supabaseAdmin
        .from("meetings")
        .delete({ count: "exact" })
        .eq("user_id", userId)
        .eq("source", "outlook")
        .gte("scheduled_date", startDate)
        .lte("scheduled_date", endDate);
      const finalQuery = fetchedIds.length
        ? delQuery.not("external_id", "in", `(${fetchedIds.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(",")})`)
        : delQuery;
      const { count, error: delErr } = await finalQuery;
      if (delErr) console.error("[outlook sync] delete stale error", delErr);
      else removed = count ?? 0;
    }

    await supabaseAdmin
      .from("outlook_connections")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("user_id", userId);

    console.log("[outlook sync]", { userId, totalFromGraph: events.length, imported, removed });
    return { imported, removed, total: events.length };
  });
