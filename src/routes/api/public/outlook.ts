import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

const TENANT = "common";
const SCOPES = "offline_access openid profile User.Read Calendars.ReadWrite";
const LOVABLE_PROJECT_ID = "0f679b02-63a6-46ee-ae66-8b953bfe9f15";

function getPreferredCallbackOrigin(origin: string) {
  try {
    const url = new URL(origin);

    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return url.origin;
    }

    if (url.hostname.endsWith(".lovableproject.com")) {
      return `https://id-preview--${LOVABLE_PROJECT_ID}.lovable.app`;
    }

    return url.origin;
  } catch {
    return `https://id-preview--${LOVABLE_PROJECT_ID}.lovable.app`;
  }
}

const actionSchema = z.object({
  action: z.enum(["connect", "disconnect", "sync"]),
  origin: z.string().url().optional(),
});

export const Route = createFileRoute("/api/public/outlook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { supabase, userId } = await authenticateRequest(request);
          const { data, error } = await supabase
            .from("outlook_connections")
            .select("email, display_name, last_sync_at, expires_at")
            .eq("user_id", userId)
            .maybeSingle();

          if (error) {
            return json({ error: error.message }, 500);
          }

          return json({ connected: !!data, connection: data ?? null });
        } catch (error) {
          return handleRouteError(error);
        }
      },

      POST: async ({ request }) => {
        try {
          const { userId } = await authenticateRequest(request);
          const payload = actionSchema.parse(await request.json());

          if (payload.action === "connect") {
            const clientId = process.env.MS_CLIENT_ID;
            if (!clientId) {
              return json({ error: "MS_CLIENT_ID is not configured" }, 500);
            }

            if (!payload.origin) {
              return json({ error: "Origin is required" }, 400);
            }

            const redirectOrigin = getPreferredCallbackOrigin(payload.origin);
            const redirectUri = `${redirectOrigin}/api/public/outlook/callback`;
            const params = new URLSearchParams({
              client_id: clientId,
              response_type: "code",
              redirect_uri: redirectUri,
              response_mode: "query",
              scope: SCOPES,
              state: userId,
              prompt: "select_account",
            });

            return json({
              url: `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize?${params.toString()}`,
            });
          }

          if (payload.action === "disconnect") {
            const { error } = await supabaseAdmin
              .from("outlook_connections")
              .delete()
              .eq("user_id", userId);

            if (error) {
              return json({ error: error.message }, 500);
            }

            return json({ success: true });
          }

          const result = await syncOutlookCalendar(userId);
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
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return { supabase, userId: data.claims.sub };
}

async function refreshAccessToken(refreshToken: string) {
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Microsoft credentials are not configured");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: SCOPES,
  });

  const response = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Refresh token failed [${response.status}]: ${JSON.stringify(json)}`);
  }

  return json as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };
}

async function syncOutlookCalendar(userId: string) {
  const { data: conn, error: connErr } = await supabaseAdmin
    .from("outlook_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (connErr) {
    throw new Error(connErr.message);
  }

  if (!conn) {
    throw new Error("Outlook não está conectado");
  }

  let accessToken = conn.access_token as string;
  const expiresAt = new Date(conn.expires_at as string).getTime();

  if (expiresAt - Date.now() < 120_000) {
    const refreshed = await refreshAccessToken(conn.refresh_token as string);
    accessToken = refreshed.access_token;

    const { error } = await supabaseAdmin
      .from("outlook_connections")
      .update({
        access_token: accessToken,
        refresh_token: refreshed.refresh_token ?? conn.refresh_token,
        expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        scope: refreshed.scope ?? conn.scope,
      })
      .eq("user_id", userId);

    if (error) {
      throw new Error(error.message);
    }
  }

  const start = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const end = new Date(Date.now() + 60 * 24 * 3600_000).toISOString();
  const url =
    `https://graph.microsoft.com/v1.0/me/calendarView?` +
    `startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}` +
    `&$select=id,subject,bodyPreview,location,start,end,isAllDay,webLink&$top=200&$orderby=start/dateTime`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'outlook.timezone="UTC"',
    },
  });

  const jsonResponse = await response.json();
  if (!response.ok) {
    throw new Error(`Graph API error [${response.status}]: ${JSON.stringify(jsonResponse)}`);
  }

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

  const events = (jsonResponse.value ?? []) as GraphEvent[];
  let imported = 0;

  for (const ev of events) {
    const startsAt = new Date(ev.start.dateTime + "Z").toISOString();
    const endsAt = new Date(ev.end.dateTime + "Z").toISOString();
    const scheduledDate = startsAt.slice(0, 10);

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

    if (!error) {
      imported += 1;
    }
  }

  const { error: syncError } = await supabaseAdmin
    .from("outlook_connections")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (syncError) {
    throw new Error(syncError.message);
  }

  return { imported, total: events.length };
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function handleRouteError(error: unknown) {
  if (error instanceof Response) {
    return error;
  }

  if (error instanceof z.ZodError) {
    return json({ error: "Requisição inválida" }, 400);
  }

  const message = error instanceof Error ? error.message : "Erro interno";
  return json({ error: message }, 500);
}