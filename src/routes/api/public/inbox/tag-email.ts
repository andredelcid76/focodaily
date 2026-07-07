import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { getValidOutlookAccessToken } from "@/lib/outlook-token";

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

          let accessToken: string;
          try {
            accessToken = await getValidOutlookAccessToken(userId, conn);
          } catch (e) {
            console.error("[tag-email] refresh failed", e);
            return Response.json({ ok: false, reason: "refresh-failed" });
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
