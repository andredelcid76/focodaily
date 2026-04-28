import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TENANT = "common";
const SCOPES = "offline_access openid profile User.Read Calendars.ReadWrite";
const LOVABLE_PROJECT_ID = "0f679b02-63a6-46ee-ae66-8b953bfe9f15";

function getExpectedRedirectUri(url: URL) {
  const hostname = url.hostname;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${url.origin}/api/public/outlook/callback`;
  }

  if (hostname.endsWith(".lovableproject.com")) {
    return `https://id-preview--${LOVABLE_PROJECT_ID}.lovable.app/api/public/outlook/callback`;
  }

  return `${url.origin}/api/public/outlook/callback`;
}

export const Route = createFileRoute("/api/public/outlook/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errorParam = url.searchParams.get("error");

        if (errorParam) {
          console.error("[outlook callback] provider returned error", errorParam);
          return redirectWithMsg("Falha ao conectar o Outlook. Tente novamente.");
        }
        if (!code || !state) {
          return redirectWithMsg("Callback inválido");
        }

        // Validate the state token (CSRF protection): look up + delete in one step
        const { data: pending, error: pendingErr } = await supabaseAdmin
          .from("oauth_pending_states")
          .select("user_id, expires_at")
          .eq("state_token", state)
          .eq("provider", "outlook")
          .maybeSingle();

        if (pendingErr) {
          console.error("[outlook callback] state lookup failed", pendingErr);
          return redirectWithMsg("Falha ao validar a conexão. Tente novamente.");
        }
        if (!pending) {
          console.warn("[outlook callback] unknown state token");
          return redirectWithMsg("Sessão de conexão inválida ou expirada. Tente novamente.");
        }
        if (new Date(pending.expires_at).getTime() < Date.now()) {
          await supabaseAdmin.from("oauth_pending_states").delete().eq("state_token", state);
          return redirectWithMsg("Sessão de conexão expirada. Tente novamente.");
        }

        const userId = pending.user_id as string;
        // Consume the state token immediately to prevent replay
        await supabaseAdmin.from("oauth_pending_states").delete().eq("state_token", state);

        const clientId = process.env.MS_CLIENT_ID;
        const clientSecret = process.env.MS_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          console.error("[outlook callback] MS credentials not configured");
          return redirectWithMsg("Configuração do servidor incompleta.");
        }

        const redirectUri = getExpectedRedirectUri(url);
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
          console.error("[outlook callback] token exchange failed", tok);
          return redirectWithMsg("Falha ao conectar o Outlook. Tente novamente.");
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
              user_id: userId,
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
          console.error("[outlook callback] DB upsert failed", error);
          return redirectWithMsg("Erro ao salvar conexão. Tente novamente.");
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
