import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueCollaborationEmail } from "@/lib/email/collaborationEmail.server";
import { sendTeamsDirectMessage } from "@/lib/teamsChat.server";

const APP_URL = "https://focodaily.lovable.app";

/**
 * Cron endpoint: entrega as notificações de delegação de tarefa por e-mail e,
 * quando possível, por mensagem direta no Microsoft Teams.
 *
 * O aviso in-app é criado por trigger no banco (notify_task_assignment); aqui
 * apenas complementamos os canais externos. Assim, qualquer origem (interface,
 * MCP, automação) gera notificação nos três canais.
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

        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: pending, error } = await supabaseAdmin
          .from("notifications")
          .select("id,user_id,actor_id,title,body,task_id,link")
          .eq("type", "task_assigned")
          .is("emailed_at", null)
          .gte("created_at", since)
          .order("created_at", { ascending: true })
          .limit(50);
        if (error) return new Response(error.message, { status: 500 });

        const results: Array<{ id: string; email: boolean; teams: boolean; error?: string }> = [];

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
          const link = `${APP_URL}/delegadas`;
          const bodyText = (n.body as string | null) ?? "Uma tarefa foi delegada para você.";

          if (recipientEmail) {
            const res = await enqueueCollaborationEmail({
              to: recipientEmail,
              label: "task-assigned",
              subject: (n.title as string) || "Nova tarefa delegada para você",
              title: (n.title as string) || "Nova tarefa delegada para você",
              body: bodyText,
              ctaLabel: "Ver tarefas delegadas",
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
              html: `<p><strong>${escapeHtml((n.title as string) ?? "Nova tarefa delegada")}</strong></p><p>${escapeHtml(bodyText)}</p><p><a href="${link}">Abrir no Focou</a></p>`,
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

        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
