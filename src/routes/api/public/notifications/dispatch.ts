import { createFileRoute } from "@tanstack/react-router";
import { deliverPendingNotifications } from "@/lib/notificationsDelivery.server";
import { authenticateCron } from "@/lib/cron-auth.server";

/**
 * Endpoint de entrega (chamado por trigger no banco): envia por e-mail e, quando
 * possível, por mensagem direta no Teams as notificações pendentes de delegação,
 * conclusão, alteração e comentário.
 */
export const Route = createFileRoute("/api/public/notifications/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!await authenticateCron(request)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const result = await deliverPendingNotifications();
        if (!result.ok) return Response.json({ ok: false }, { status: 500 });
        return Response.json({ ok: true, processed: result.processed });
      },
    },
  },
});
