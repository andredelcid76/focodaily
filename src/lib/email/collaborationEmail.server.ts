import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";

const SITE_NAME = "Foco";
const TEMPLATE_NAME = "collaboration-notice";

async function logSend(input: {
  label: string;
  to: string;
  status: "sent" | "suppressed" | "failed";
  errorMessage?: string;
}) {
  const { error } = await supabaseAdmin.from("email_send_log").insert({
    message_id: null,
    template_name: input.label,
    recipient_email: input.to,
    status: input.status,
    ...(input.errorMessage ? { error_message: input.errorMessage.slice(0, 1000) } : {}),
  });
  if (error) {
    console.error("Failed to write email_send_log", { code: error.code, message: error.message });
  }
}

/**
 * Envia um e-mail de colaboração (convites, delegação de tarefa, etc.)
 * pela entrega de e-mail gerenciada pela Lovable.
 */
export async function enqueueCollaborationEmail(input: {
  to: string;
  label: string;
  subject: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  idempotencyKey?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const result = await sendTemplateEmail(TEMPLATE_NAME, input.to, {
      idempotencyKey: input.idempotencyKey,
      templateData: {
        siteName: SITE_NAME,
        subject: input.subject,
        title: input.title,
        body: input.body,
        ctaLabel: input.ctaLabel,
        ctaUrl: input.ctaUrl,
      },
    });

    if (!result.sent) {
      await logSend({ label: input.label, to: input.to, status: "suppressed" });
      return { ok: false, error: result.reason };
    }

    await logSend({ label: input.label, to: input.to, status: "sent" });
    return { ok: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "error";
    console.error("Failed to send collaboration email", { label: input.label, error: msg });
    await logSend({ label: input.label, to: input.to, status: "failed", errorMessage: msg });
    return { ok: false, error: msg };
  }
}
