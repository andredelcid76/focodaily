import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CORS_HEADERS, randomId } from "@/lib/oauth";

const RegisterBody = z.object({
  client_name: z.string().min(1).max(200).optional(),
  redirect_uris: z.array(z.string().url()).min(1).max(10),
  token_endpoint_auth_method: z.literal("none").optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  software_id: z.string().max(200).optional(),
  software_version: z.string().max(50).optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export const Route = createFileRoute("/api/public/oauth/register")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid_client_metadata", error_description: "Invalid JSON" }, 400);
        }
        const parsed = RegisterBody.safeParse(body);
        if (!parsed.success) {
          return json(
            { error: "invalid_client_metadata", error_description: parsed.error.message },
            400,
          );
        }
        const data = parsed.data;
        const clientId = randomId("foco-client", 18);
        const { error } = await supabaseAdmin.from("oauth_clients").insert({
          id: clientId,
          client_name: data.client_name ?? "MCP Client",
          redirect_uris: data.redirect_uris,
          token_endpoint_auth_method: "none",
          grant_types: data.grant_types ?? ["authorization_code"],
          response_types: data.response_types ?? ["code"],
          software_id: data.software_id ?? null,
          software_version: data.software_version ?? null,
        } as never);
        if (error) {
          console.error("[oauth/register] insert failed", error);
          return json({ error: "server_error", error_description: "Internal server error" }, 500);
        }
        return json(
          {
            client_id: clientId,
            client_name: data.client_name ?? "MCP Client",
            redirect_uris: data.redirect_uris,
            token_endpoint_auth_method: "none",
            grant_types: data.grant_types ?? ["authorization_code"],
            response_types: data.response_types ?? ["code"],
          },
          201,
        );
      },
    },
  },
});
