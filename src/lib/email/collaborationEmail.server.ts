import * as React from "react";
import { render } from "@react-email/components";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CollaborationNoticeEmail } from "@/lib/email-templates/collaboration-notice";
import { getOrCreateUnsubscribeToken } from "@/lib/email/unsubscribeToken.server";

const SITE_NAME = "Focou";
const FROM_DOMAIN = "anpla.com.br";
const SENDER_DOMAIN = "notify.anpla.com.br";

/**
 * Enfileira um e-mail de colaboração (convites, delegação de tarefa, etc.).
 * Mesmo payload usado pelos convites de equipe/projeto.
 */
export async function enqueueCollaborationEmail(input: {
  to: string;
  label: string;
  subject: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  const messageId = crypto.randomUUID();

  try {
    const element = React.createElement(CollaborationNoticeEmail, {
      siteName: SITE_NAME,
      title: input.title,
      body: input.body,
      ctaLabel: input.ctaLabel,
      ctaUrl: input.ctaUrl,
    });

    const html = await render(element);
    const text = await render(element, { plainText: true });

    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: input.label,
      recipient_email: input.to,
      status: "pending",
    });

    const unsubscribeToken = await getOrCreateUnsubscribeToken(input.to);
    if (!unsubscribeToken) {
      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: input.label,
        recipient_email: input.to,
        status: "failed",
        error_message: "Failed to prepare unsubscribe token",
      });
      return { ok: false, error: "unsubscribe_token" };
    }

    const { error } = await supabaseAdmin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to: input.to,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: input.subject,
        html,
        text,
        purpose: "transactional",
        label: input.label,
        idempotency_key: messageId,
        unsubscribe_token: unsubscribeToken,
        queued_at: new Date().toISOString(),
      },
    });

    if (error) {
      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: input.label,
        recipient_email: input.to,
        status: "failed",
        error_message: error.message,
      });
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "error";
    console.error("Failed to enqueue collaboration email", { label: input.label, error: msg });
    return { ok: false, error: msg };
  }
}
