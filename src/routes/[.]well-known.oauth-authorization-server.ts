import { createFileRoute } from "@tanstack/react-router";
import { CORS_HEADERS, getOrigin } from "@/lib/oauth";

function json(body: unknown, request: Request, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export const Route = createFileRoute("/.well-known/oauth-authorization-server")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = getOrigin(request);
        return json(
          {
            issuer: origin,
            authorization_endpoint: `${origin}/api/public/oauth/authorize`,
            token_endpoint: `${origin}/api/public/oauth/token`,
            registration_endpoint: `${origin}/api/public/oauth/register`,
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code", "refresh_token"],
            code_challenge_methods_supported: ["S256"],
            token_endpoint_auth_methods_supported: ["none"],
            scopes_supported: ["mcp", "offline_access"],
          },
          request,
        );
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
    },
  },
});
