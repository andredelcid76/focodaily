import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FOCO_CATEGORY = "Foco App";

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
  const json = await r.json();
  if (!r.ok) throw new Error(`Outlook refresh failed: ${JSON.stringify(json).slice(0, 300)}`);
  return json as { access_token: string; refresh_token?: string; expires_in: number };
}

export const Route = createFileRoute("/api/public/inbox/tag-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { user_id?: string; message_id?: string };
          const userId = body.user_id;
          const messageId = body.message_id;
          if (!userId || !messageId) {
            return new Response(JSON.stringify({ error: "missing params" }), { status: 400 });
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
              return Response.json({ ok: false, reason: "refresh-failed", error: String(e) });
            }
          }

          // Fetch existing categories so we don't overwrite user-set ones.
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
            const txt = await patchR.text();
            return Response.json({ ok: false, status: patchR.status, error: txt.slice(0, 300) });
          }
          return Response.json({ ok: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "erro";
          return new Response(JSON.stringify({ error: msg }), { status: 500 });
        }
      },
    },
  },
});
