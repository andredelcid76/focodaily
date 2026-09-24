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
  "task_mention",
  "task_blocked",
  "task_unblocked",
  "task_due_soon",
  "task_overdue",
] as const;

const FALLBACK_BODY: Record<string, string> = {
  task_assigned: "Uma tarefa foi delegada para você.",
  task_completed: "Uma tarefa que você delegou foi concluída.",
  task_updated: "Uma tarefa que você delegou foi alterada.",
  task_comment: "Há um novo comentário em uma tarefa.",
  task_mention: "Você foi mencionado em um comentário.",
};

type Prefs = { prefs: Record<string, { app?: boolean; email?: boolean; teams?: boolean }>; email_mode: string };

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function absLink(path: string | null | undefined) {
  const p = path ?? "/";
  return `${APP_URL}${p.startsWith("/") ? p : `/${p}`}`;
}

export type DeliveryResult = { id: string; email: boolean; teams: boolean; error?: string };

async function loadPrefs(userIds: string[]) {
  const map = new Map<string, Prefs>();
  if (!userIds.length) return map;
  const { data } = await supabaseAdmin
    .from("notification_preferences")
    .select("user_id,prefs,email_mode")
    .in("user_id", userIds);
  for (const r of data ?? []) {
    map.set(r.user_id as string, {
      prefs: (r.prefs ?? {}) as Prefs["prefs"],
      email_mode: (r.email_mode as string) ?? "instant",
    });
  }
  return map;
}

/**
 * Entrega as notificações pendentes (sem emailed_at) por e-mail e Teams,
 * respeitando as preferências de cada pessoa (desligado, imediato ou resumo diário).
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

  const prefsMap = await loadPrefs(Array.from(new Set((pending ?? []).map((n) => n.user_id as string))));
  const results: DeliveryResult[] = [];

  for (const n of pending ?? []) {
    const errors: string[] = [];
    let emailOk = false;
    let teamsOk = false;
    let digest = false;
    const type = (n.type as string) ?? "task_assigned";
    const p = prefsMap.get(n.user_id as string);
    const typePref = p?.prefs?.[type] ?? {};
    const wantEmail = typePref.email !== false && p?.email_mode !== "off";
    const wantTeams = typePref.teams !== false;

    // Evita enxurrada: alterações seguidas na mesma tarefa só geram um e-mail a cada 10 min.
    let skipBurst = false;
    if (type === "task_updated" && n.task_id) {
      const { count } = await supabaseAdmin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", n.user_id as string)
        .eq("task_id", n.task_id as string)
        .eq("type", "task_updated")
        .neq("id", n.id as string)
        .gte("emailed_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());
      skipBurst = (count ?? 0) > 0;
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email,display_name")
      .eq("user_id", n.user_id as string)
      .maybeSingle();

    const recipientEmail = (profile?.email as string | null) ?? null;
    const link = absLink(n.link as string | null);
    const title = (n.title as string) || "Atualização no Focou";
    const bodyText = (n.body as string | null) ?? FALLBACK_BODY[type] ?? "Atualização no Focou";

    if (skipBurst) {
      errors.push("email:grouped");
    } else if (!wantEmail) {
      errors.push("email:disabled_by_user");
    } else if (p?.email_mode === "digest") {
      digest = true;
    } else if (recipientEmail) {
      const res = await enqueueCollaborationEmail({
        to: recipientEmail,
        label: type.replace(/_/g, "-"),
        subject: title,
        title,
        body: bodyText,
        ctaLabel: n.task_id ? "Abrir a tarefa" : "Abrir no Focou",
        ctaUrl: link,
        idempotencyKey: `notif-${n.id}`,
      });
      emailOk = res.ok;
      if (!res.ok && res.error) errors.push(`email:${res.error}`);
    } else {
      errors.push("email:recipient_without_email");
    }

    if (recipientEmail && n.actor_id && wantTeams && !skipBurst) {
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
        digest_pending: digest,
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

/** Envia um único e-mail por pessoa com tudo que ficou para o resumo diário. */
export async function sendDailyDigests(): Promise<{ sent: number }> {
  const { data } = await supabaseAdmin
    .from("notifications")
    .select("id,user_id,title,body,created_at")
    .eq("digest_pending", true)
    .order("created_at", { ascending: true })
    .limit(1000);
  const byUser = new Map<string, typeof data>();
  for (const n of data ?? []) {
    const list = byUser.get(n.user_id as string) ?? [];
    list.push(n);
    byUser.set(n.user_id as string, list);
  }
  let sent = 0;
  const day = new Date().toISOString().slice(0, 10);
  for (const [uid, items] of byUser) {
    if (!items?.length) continue;
    const { data: profile } = await supabaseAdmin.from("profiles").select("email").eq("user_id", uid).maybeSingle();
    const ids = items.map((i) => i.id as string);
    if (profile?.email) {
      const lines = items.slice(0, 40).map((i) => `• ${i.title}: ${i.body ?? ""}`);
      if (items.length > 40) lines.push(`… e mais ${items.length - 40}.`);
      const res = await enqueueCollaborationEmail({
        to: profile.email as string,
        label: "notifications-digest",
        subject: `Seu resumo do Focou: ${items.length} novidade${items.length > 1 ? "s" : ""}`,
        title: "Resumo do dia",
        body: lines.join("\n"),
        ctaLabel: "Ver notificações",
        ctaUrl: absLink("/notificacoes"),
        idempotencyKey: `digest-${uid}-${day}`,
      });
      if (res.ok) sent++;
    }
    await supabaseAdmin.from("notifications").update({ digest_pending: false }).in("id", ids);
  }
  return { sent };
}
