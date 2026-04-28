import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TENANT = "common";
const SCOPES = "offline_access openid profile User.Read Calendars.ReadWrite";

export const Route = createFileRoute("/api/outlook/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state"); // = userId
        const errorParam = url.searchParams.get("error");

        if (errorParam) {
          return redirectWithMsg(`Erro no Outlook: ${errorParam}`);
        }
        if (!code || !state) {
          return redirectWithMsg("Callback inválido (faltando code/state)");
        }

        const clientId = process.env.MS_CLIENT_ID;
        const clientSecret = process.env.MS_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          return redirectWithMsg("MS_CLIENT_ID/MS_CLIENT_SECRET não configurados");
        }

        const redirectUri = `${url.origin}/api/outlook/callback`;
        const body = new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          scope: SCOPES,
        });

        const tokRes = await fetch(
          `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
          }
        );
        const tok = await tokRes.json();
        if (!tokRes.ok) {
          console.error("Outlook token exchange failed:", tok);
          return redirectWithMsg(
            `Falha ao obter token: ${tok.error_description || tok.error || tokRes.status}`
          );
        }

        // Fetch user profile to store email/name
        const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${tok.access_token}` },
        });
        const me = meRes.ok ? await meRes.json() : {};

        const expiresAt = new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString();

        const { error } = await supabaseAdmin
          .from("outlook_connections")
          .upsert(
            {
              user_id: state,
              ms_user_id: me?.id ?? null,
              email: me?.mail ?? me?.userPrincipalName ?? null,
              display_name: me?.displayName ?? null,
              access_token: tok.access_token,
              refresh_token: tok.refresh_token,
              expires_at: expiresAt,
              scope: tok.scope ?? SCOPES,
            },
            { onConflict: "user_id" }
          );

        if (error) {
          console.error("DB upsert failed:", error);
          return redirectWithMsg(`Erro ao salvar conexão: ${error.message}`);
        }

        return redirectWithMsg("Outlook conectado com sucesso!", "success");
      },
    },
  },
});

function redirectWithMsg(message: string, type: "success" | "error" = "error") {
  const params = new URLSearchParams({ outlook: type, msg: message });
  return new Response(null, {
    status: 302,
    headers: { Location: `/agenda?${params.toString()}` },
  });
}
