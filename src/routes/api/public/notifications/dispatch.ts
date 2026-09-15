import { createFileRoute } from "@tanstack/react-router";
import { deliverPendingNotifications } from "@/lib/notificationsDelivery.server";

/**
 * Endpoint de entrega (chamado por trigger no banco): envia por e-mail e, quando
 * possível, por mensagem direta no Teams as notificações pendentes de delegação,
 * conclusão, alteração e comentário.
 */
export const Route = createFileRoute("/api/public/notifications/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided =
          request.headers.get("apikey") ??
          request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
        const expected = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!provided || !expected || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const result = await deliverPendingNotifications();
        if (!result.ok) return new Response(result.error, { status: 500 });
        return Response.json(result);
      },
    },
  },
});
