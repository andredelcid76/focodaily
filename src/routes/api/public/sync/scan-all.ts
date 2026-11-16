import { createFileRoute } from "@tanstack/react-router";

// Background cron endpoint (every 2h): for each user, syncs Pipedrive activities into tasks
// and syncs the Outlook calendar. The old inbox suggestions scan (e-mail/Teams/Fireflies + AI)
// was retired; nothing here reads or writes inbox_suggestions.
export const Route = createFileRoute("/api/public/sync/scan-all")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateCron } = await import("@/lib/cron-auth.server");
        if (!await authenticateCron(request)) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { syncPipedriveForUser } = await import("@/lib/pipedrive-sync.server");
        const { syncOutlookCalendar } = await import("@/lib/outlook-calendar-sync");

        const [outlook, pipedrive] = await Promise.all([
          supabaseAdmin.from("outlook_connections").select("user_id"),
          supabaseAdmin.from("pipedrive_connections").select("user_id"),
        ]);
        const outlookIds = new Set((outlook.data ?? []).map((r) => r.user_id as string));
        const pipedriveIds = new Set((pipedrive.data ?? []).map((r) => r.user_id as string));
        const userIds = Array.from(new Set([...outlookIds, ...pipedriveIds]));

        let failed = 0;
        // Sequential with per-user, per-source error isolation (safer for rate limits).
        for (const userId of userIds) {
          if (pipedriveIds.has(userId)) {
            try {
              await syncPipedriveForUser(userId);
            } catch (e) {
              failed++;
              console.error("[sync/scan-all] pipedrive failed", userId, e instanceof Error ? e.message : e);
            }
          }
          if (outlookIds.has(userId)) {
            try {
              await syncOutlookCalendar(userId);
            } catch (e) {
              failed++;
              console.error("[sync/scan-all] calendar failed", userId, e instanceof Error ? e.message : e);
            }
          }
        }
        return Response.json({ ok: true, total: userIds.length, failed });
      },
    },
  },
});
