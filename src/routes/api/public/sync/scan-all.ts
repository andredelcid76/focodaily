import { createFileRoute } from "@tanstack/react-router";

// Background cron endpoint (every 2h): for each user, syncs the Outlook calendar.
// The old inbox suggestions scan (e-mail/Teams/Fireflies + AI) was retired; nothing here
// reads or writes inbox_suggestions.
// Pipedrive → tarefas: desativado em 18/11/2026 a pedido do usuário; tarefas do Pipedrive
// entram pelo rito diário. syncPipedriveForUser (src/lib/pipedrive-sync.server.ts) segue no
// código, mas não é mais chamado.
export const Route = createFileRoute("/api/public/sync/scan-all")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateCron } = await import("@/lib/cron-auth.server");
        if (!await authenticateCron(request)) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { syncOutlookCalendar } = await import("@/lib/outlook-calendar-sync");

        const outlook = await supabaseAdmin.from("outlook_connections").select("user_id");
        const userIds = Array.from(new Set((outlook.data ?? []).map((r) => r.user_id as string)));

        let failed = 0;
        // Sequential with per-user error isolation (safer for rate limits).
        for (const userId of userIds) {
          try {
            await syncOutlookCalendar(userId);
          } catch (e) {
            failed++;
            console.error("[sync/scan-all] calendar failed", userId, e instanceof Error ? e.message : e);
          }
        }
        return Response.json({ ok: true, total: userIds.length, failed });
      },
    },
  },
});
