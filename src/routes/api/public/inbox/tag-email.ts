import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

const FOCO_CATEGORY = "Foco App";

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

async function refreshOutlookToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID!,
    client_secret: process.env.MS_CLIENT_SECRET!,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope:
      "offline_access openid profile User.Read Mail.ReadWrite Calendars.ReadWrite Tasks.ReadWrite Group.Read.All",
  });
  const r = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error("Outlook refresh failed");
  return (await r.json()) as { access_token: string; refresh_token?: string; expires_in: number };
}

export const Route = createFileRoute("/api/public/inbox/tag-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let userId: string;
        try {
          userId = await authenticateRequest(request);
        } catch (e) {
          if (e instanceof Response) return e;
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const body = (await request.json()) as { message_id?: string };
          const messageId = body.message_id;
          if (!messageId || typeof messageId !== "string" || messageId.length > 500) {
            return new Response(JSON.stringify({ error: "missing or invalid message_id" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const { data: conn } = await supabaseAdmin
            .from("outlook_connections")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle();
          if (!conn) return Response.json({ ok: false, reason: "no-connection" });

          let accessToken = conn.access_token as string;
          if (new Date(conn.expires_at as string).getTime() - Date.now() < 120_000) {
            try {
              const refreshed = await refreshOutlookToken(conn.refresh_token as string);
              accessToken = refreshed.access_token;
              await supabaseAdmin
                .from("outlook_connections")
                .update({
                  access_token: accessToken,
                  refresh_token: refreshed.refresh_token ?? conn.refresh_token,
                  expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
                })
                .eq("user_id", userId);
            } catch (e) {
              console.error("[tag-email] refresh failed", e);
              return Response.json({ ok: false, reason: "refresh-failed" });
            }
          }

          const getR = await fetch(
            `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}?$select=categories`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          let existing: string[] = [];
          if (getR.ok) {
            const j = (await getR.json()) as { categories?: string[] };
            existing = j.categories ?? [];
          }
          const merged = Array.from(new Set([...existing, FOCO_CATEGORY]));

          const patchR = await fetch(
            `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ categories: merged }),
            },
          );
          if (!patchR.ok) {
            console.error("[tag-email] graph patch failed", patchR.status, await patchR.text());
            return Response.json({ ok: false, status: patchR.status });
          }
          return Response.json({ ok: true });
        } catch (e) {
          console.error("[tag-email] internal error", e);
          return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
