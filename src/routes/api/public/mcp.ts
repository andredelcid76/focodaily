import { createFileRoute } from "@tanstack/react-router";
import { createMcpServer, withMcpAuth } from "mcp-tanstack-start";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { allTools } from "@/lib/mcp/tools";

const mcp = createMcpServer({
  name: "foco-mcp",
  version: "1.0.0",
  instructions:
    "Ferramentas do app Foco (produtividade pessoal). Use list_tasks/list_projects/list_meetings para consultar dados antes de criar ou alterar tarefas. Datas no formato YYYY-MM-DD. Categorias: urgent, important, circumstantial. Durações típicas: 5, 15, 30, 60, 90, 120 minutos. Para gerar tarefas a partir de uma reunião, use list_fireflies_meetings e get_fireflies_transcript primeiro.",
  tools: allTools,
});

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const methodNotAllowed = () =>
  new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    }),
    {
      status: 405,
      headers: { "Content-Type": "application/json", Allow: "POST, OPTIONS" },
    },
  );

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

const authenticatedHandler = withMcpAuth(
  async (request, auth) => mcp.handleRequest(request, { auth }),
  async (request) => {
    const header = request.headers.get("Authorization") ?? request.headers.get("authorization");
    if (!header?.startsWith("Bearer ")) return null;
    const token = header.slice("Bearer ".length).trim();
    if (!token) return null;
    const hash = hashToken(token);

    // OAuth access tokens (issued via DCR flow) take priority
    if (token.startsWith("foco_oauth_")) {
      const { data, error } = await supabaseAdmin
        .from("oauth_access_tokens")
        .select("id, user_id, revoked_at, expires_at")
        .eq("token_hash", hash)
        .maybeSingle();
      if (error || !data || data.revoked_at) return null;
      if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;
      void supabaseAdmin
        .from("oauth_access_tokens")
        .update({ last_used_at: new Date().toISOString() } as never)
        .eq("id", data.id);
      return { token, claims: { sub: data.user_id, userId: data.user_id } };
    }

    // Legacy: manual MCP tokens
    const { data, error } = await supabaseAdmin
      .from("mcp_tokens")
      .select("id, user_id, revoked_at")
      .eq("token_hash", hash)
      .maybeSingle();
    if (error || !data || data.revoked_at) return null;
    void supabaseAdmin
      .from("mcp_tokens")
      .update({ last_used_at: new Date().toISOString() } as never)
      .eq("id", data.id);
    return { token, claims: { sub: data.user_id, userId: data.user_id } };
  },
);

function buildWwwAuthenticate(request: Request): string {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const origin = `${proto}://${host}`;
  return `Bearer realm="foco-mcp", resource_metadata="${origin}/.well-known/oauth-protected-resource"`;
}

export const Route = createFileRoute("/api/public/mcp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const res = await authenticatedHandler(request);
        const headers = new Headers(res.headers);
        for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
        if (res.status === 401) {
          headers.set("WWW-Authenticate", buildWwwAuthenticate(request));
        }
        return new Response(res.body, { status: res.status, headers });
      },
      GET: async ({ request }) => {
        const headers = new Headers({
          "Content-Type": "application/json",
          Allow: "POST, OPTIONS",
          "WWW-Authenticate": buildWwwAuthenticate(request),
        });
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Method not allowed." },
            id: null,
          }),
          { status: 405, headers },
        );
      },
      DELETE: async () => methodNotAllowed(),
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
    },
  },
});
