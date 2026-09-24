import { createFileRoute } from "@tanstack/react-router";
import { deliverPendingNotifications, sendDailyDigests } from "@/lib/notificationsDelivery.server";

/**
 * Rodada diária (agendada no banco): entrega avisos pendentes (prazos/atrasos)
 * e envia o resumo diário. Sem parâmetros e idempotente: só processa o que já
 * está pendente, e o resumo só sai uma vez por dia (janela das 10h UTC).
 */
export const Route = createFileRoute("/api/public/notifications/tick")({
  server: {
    handlers: {
      POST: async () => {
        const delivered = await deliverPendingNotifications();
        const hour = new Date().getUTCHours();
        const digest = hour === 10 ? await sendDailyDigests() : { sent: 0 };
        return Response.json({ ok: true, delivered: delivered.ok ? delivered.processed : 0, digest: digest.sent });
      },
    },
  },
});
