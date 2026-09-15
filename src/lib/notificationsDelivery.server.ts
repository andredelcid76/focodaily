import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueCollaborationEmail } from "@/lib/email/collaborationEmail.server";
import { sendTeamsDirectMessage } from "@/lib/teamsChat.server";

const APP_URL = "https://focodaily.lovable.app";

/** Tipos de notificação que também são entregues por e-mail e Teams. */
export const DELIVERABLE_TYPES = [
  "task_assigned",
  "task_completed",
  "task_updated",
  "task_comment",
] as const;

const FALLBACK_BODY: Record<string, string> = {
  task_assigned: "Uma tarefa foi delegada para você.",
  task_completed: "Uma tarefa que você delegou foi concluída.",
  task_updated: "Uma tarefa que você delegou foi alterada.",
  task_comment: "Há um novo comentário em uma tarefa.",
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type DeliveryResult = { id: string; email: boolean; teams: boolean; error?: string };

/**
 * Entrega as notificações pendentes (sem emailed_at) por e-mail e, quando
 * possível, por mensagem direta no Microsoft Teams. O aviso in-app é criado
 * por triggers no banco; aqui apenas complementamos os canais externos.
 */
export async function deliverPendingNotifications(): Promise<
  { ok: true; processed: number; results: DeliveryResult[] } | { ok: false; error: string }
> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: pending, error } = await supabaseAdmin
    .from("notifications")
    .select("id,user_id,actor_id,type,title,body,task_id,link")
    .in("type", DELIVERABLE_TYPES as unknown as string[])
    .is("emailed_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) return { ok: false, error: error.message };

  const results: DeliveryResult[] = [];

  for (const n of pending ?? []) {
    const errors: string[] = [];
    let emailOk = false;
    let teamsOk = false;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email,display_name")
      .eq("user_id", n.user_id as string)
      .maybeSingle();

    const recipientEmail = (profile?.email as string | null) ?? null;
    const type = (n.type as string) ?? "task_assigned";
    const path = (n.link as string | null) ?? "/delegadas";
    const link = `${APP_URL}${path.startsWith("/") ? path : `/${path}`}`;
    const title = (n.title as string) || "Atualização no Focou";
    const bodyText = (n.body as string | null) ?? FALLBACK_BODY[type] ?? "Atualização no Focou";

    if (recipientEmail) {
      const res = await enqueueCollaborationEmail({
        to: recipientEmail,
        label: type.replace(/_/g, "-"),
        subject: title,
        title,
        body: bodyText,
        ctaLabel: "Abrir no Focou",
        ctaUrl: link,
      });
      emailOk = res.ok;
      if (!res.ok && res.error) errors.push(`email:${res.error}`);
    } else {
      errors.push("email:recipient_without_email");
    }

    if (recipientEmail && n.actor_id) {
      const teams = await sendTeamsDirectMessage({
        senderUserId: n.actor_id as string,
        recipientEmail,
        html: `<p><strong>${escapeHtml(title)}</strong></p><p>${escapeHtml(bodyText)}</p><p><a href="${link}">Abrir no Focou</a></p>`,
      });
      teamsOk = teams.ok;
      if (!teams.ok && teams.error) errors.push(`teams:${teams.error}`);
    }

    await supabaseAdmin
      .from("notifications")
      .update({
        emailed_at: new Date().toISOString(),
        teams_sent_at: teamsOk ? new Date().toISOString() : null,
        delivery_error: errors.length ? errors.join(" | ").slice(0, 500) : null,
      })
      .eq("id", n.id as string);

    results.push({
      id: n.id as string,
      email: emailOk,
      teams: teamsOk,
      ...(errors.length ? { error: errors.join(" | ") } : {}),
    });
  }

  return { ok: true, processed: results.length, results };
}
