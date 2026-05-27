import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CORS_HEADERS } from "@/lib/oauth";

function errorRedirect(redirectUri: string | null, error: string, description: string, state?: string | null) {
  if (!redirectUri) {
    return new Response(JSON.stringify({ error, error_description: description }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

export const Route = createFileRoute("/api/public/oauth/authorize")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const params = url.searchParams;
        const clientId = params.get("client_id");
        const redirectUri = params.get("redirect_uri");
        const responseType = params.get("response_type");
        const codeChallenge = params.get("code_challenge");
        const codeChallengeMethod = params.get("code_challenge_method") ?? "S256";
        const state = params.get("state");
        const scope = params.get("scope") ?? "mcp";

        if (!clientId) return errorRedirect(null, "invalid_request", "Missing client_id");
        if (!redirectUri) return errorRedirect(null, "invalid_request", "Missing redirect_uri");
        if (responseType !== "code")
          return errorRedirect(redirectUri, "unsupported_response_type", "Only 'code' supported", state);
        if (!codeChallenge)
          return errorRedirect(redirectUri, "invalid_request", "PKCE required (code_challenge)", state);
        if (codeChallengeMethod !== "S256")
          return errorRedirect(redirectUri, "invalid_request", "code_challenge_method must be S256", state);

        const { data: client, error } = await supabaseAdmin
          .from("oauth_clients")
          .select("id, redirect_uris, client_name")
          .eq("id", clientId)
          .maybeSingle();
        if (error || !client) return errorRedirect(null, "invalid_client", "Unknown client_id");
        const uris = (client.redirect_uris as string[]) ?? [];
        if (!uris.includes(redirectUri))
          return errorRedirect(null, "invalid_request", "redirect_uri not registered for this client");

        // Forward to consent page (in-app route). User must be signed in there.
        const consent = new URL("/oauth/consent", url.origin);
        consent.searchParams.set("client_id", clientId);
        consent.searchParams.set("redirect_uri", redirectUri);
        consent.searchParams.set("code_challenge", codeChallenge);
        consent.searchParams.set("code_challenge_method", codeChallengeMethod);
        consent.searchParams.set("scope", scope);
        if (state) consent.searchParams.set("state", state);
        throw redirect({ href: consent.pathname + consent.search });
      },
    },
  },
});
