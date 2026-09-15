import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getValidOutlookAccessToken } from "@/lib/outlook-token";

const GRAPH = "https://graph.microsoft.com/v1.0";

/**
 * Envia uma mensagem direta (chat 1:1) no Microsoft Teams usando a conexão
 * Microsoft do REMETENTE (quem delegou a tarefa). Requer que a conexão tenha
 * sido autorizada com os escopos Chat.Create / ChatMessage.Send / User.ReadBasic.All
 * — conexões antigas não têm, então a função apenas devolve o motivo e o
 * chamador segue em frente (o aviso no sistema e o e-mail não dependem disso).
 */
export async function sendTeamsDirectMessage(input: {
  senderUserId: string;
  recipientEmail: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: conn } = await supabaseAdmin
      .from("outlook_connections")
      .select("access_token,refresh_token,expires_at,ms_user_id")
      .eq("user_id", input.senderUserId)
      .maybeSingle();

    if (!conn) return { ok: false, error: "sender_without_microsoft_connection" };

    const token = await getValidOutlookAccessToken(input.senderUserId, {
      access_token: conn.access_token as string,
      refresh_token: conn.refresh_token as string,
      expires_at: conn.expires_at as string,
    });

    const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // Resolve o destinatário no diretório da organização.
    const userRes = await fetch(
      `${GRAPH}/users/${encodeURIComponent(input.recipientEmail)}?$select=id`,
      { headers: authHeaders },
    );
    if (!userRes.ok) {
      return { ok: false, error: `recipient_lookup_${userRes.status}` };
    }
    const recipient = (await userRes.json()) as { id?: string };
    if (!recipient.id) return { ok: false, error: "recipient_not_found" };

    const senderId = (conn.ms_user_id as string | null) ?? null;
    if (!senderId) return { ok: false, error: "sender_id_unknown" };
    if (senderId === recipient.id) return { ok: false, error: "self_assignment" };

    // Cria (ou reaproveita) o chat 1:1 entre remetente e destinatário.
    const chatRes = await fetch(`${GRAPH}/chats`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        chatType: "oneOnOne",
        members: [senderId, recipient.id].map((id) => ({
          "@odata.type": "#microsoft.graph.aadUserConversationMember",
          roles: ["owner"],
          "user@odata.bind": `${GRAPH}/users('${id}')`,
        })),
      }),
    });
    if (!chatRes.ok) {
      const body = await chatRes.text();
      return { ok: false, error: `chat_create_${chatRes.status}:${body.slice(0, 120)}` };
    }
    const chat = (await chatRes.json()) as { id?: string };
    if (!chat.id) return { ok: false, error: "chat_id_missing" };

    const msgRes = await fetch(`${GRAPH}/chats/${chat.id}/messages`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ body: { contentType: "html", content: input.html } }),
    });
    if (!msgRes.ok) {
      const body = await msgRes.text();
      return { ok: false, error: `message_send_${msgRes.status}:${body.slice(0, 120)}` };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message.slice(0, 160) : "error" };
  }
}
