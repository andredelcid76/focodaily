import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { scanForUser } from "./scan";
import { syncOutlookCalendar } from "../outlook";

// Public cron endpoint: iterates every user with at least one active source
// (Outlook / Pipedrive / Fireflies) and runs inbox scan + Outlook calendar sync.
// Auth: requires the Supabase anon key in the `apikey` header (handled by /api/public/* bypass + manual check here).
export const Route = createFileRoute("/api/public/inbox/scan-all")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Authenticate cron callers with the service role key (server-only,
        // never bundled to client JS). The previous anon-key check was
        // ineffective because the anon key is public.
        const provided = request.headers.get("apikey") ?? request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
        const expected = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!provided || !expected || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        // Union of users with any active connection.
        const [outlook, pipedrive, fireflies] = await Promise.all([
          supabaseAdmin.from("outlook_connections").select("user_id"),
          supabaseAdmin.from("pipedrive_connections").select("user_id"),
          supabaseAdmin.from("fireflies_connections").select("user_id"),
        ]);
        const ids = new Set<string>();
        for (const row of outlook.data ?? []) ids.add(row.user_id as string);
        for (const row of pipedrive.data ?? []) ids.add(row.user_id as string);
        for (const row of fireflies.data ?? []) ids.add(row.user_id as string);

        const userIds = Array.from(ids);
        const results: Array<{ user_id: string; ok: boolean; error?: string; scan?: unknown; calendar?: unknown }> = [];

        // Run users sequentially with per-user error isolation (safer for rate limits).
        for (const userId of userIds) {
          try {
            const scan = await scanForUser(userId);
            let calendar: unknown = null;
            // Only sync calendar if Outlook is connected for this user.
            if ((outlook.data ?? []).some((r) => r.user_id === userId)) {
              try {
                calendar = await syncOutlookCalendar(userId);
              } catch (e) {
                console.error("[scan-all] calendar failed", userId, e);
                calendar = { error: e instanceof Error ? e.message : "error" };
              }
            }
            results.push({ user_id: userId, ok: true, scan, calendar });
          } catch (e) {
            const msg = e instanceof Error ? e.message : "error";
            console.error("[scan-all] failed", userId, msg);
            results.push({ user_id: userId, ok: false, error: msg.slice(0, 200) });
          }
        }

        return Response.json({ ok: true, total: userIds.length, results });
      },
    },
  },
});
