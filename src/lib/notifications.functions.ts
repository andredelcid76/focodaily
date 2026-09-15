import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Dispara a entrega externa (e-mail/Teams) das notificações pendentes.
 * Chamado pelo app depois de alterar uma tarefa ou comentar, para que o aviso
 * chegue na hora sem depender de agendamento.
 */
export const flushNotificationDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { deliverPendingNotifications } = await import("@/lib/notificationsDelivery.server");
    const result = await deliverPendingNotifications();
    return { ok: result.ok };
  });
