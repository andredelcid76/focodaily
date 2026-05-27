import { createFileRoute } from "@tanstack/react-router";
import { CORS_HEADERS, getOrigin } from "@/lib/oauth";

export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = getOrigin(request);
        const body = {
          resource: `${origin}/api/public/mcp`,
          authorization_servers: [origin],
          scopes_supported: ["mcp"],
          bearer_methods_supported: ["header"],
        };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
    },
  },
});
