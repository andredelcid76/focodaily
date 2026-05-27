import { createFileRoute } from "@tanstack/react-router";
import { createMcpServer } from "mcp-tanstack-start";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { allTools } from "@/lib/mcp/tools";

type McpAuth = {
  token: string;
  claims: {
    sub: string;
    userId: string;
  };
  scopes?: string[];
};

type CachedSessionAuth = {
  auth: McpAuth;
  expiresAt: number;
};

const SESSION_AUTH_TTL_MS = 60 * 60 * 1000;
const sessionAuthCache = new Map<string, CachedSessionAuth>();

const mcp = createMcpServer({
  name: "foco-mcp",
  version: "1.0.0",
  instructions:
    "Ferramentas do app Foco (produtividade pessoal). Use list_tasks/list_projects/list_meetings para consultar dados antes de criar ou alterar tarefas. Datas no formato YYYY-MM-DD. Categorias: urgent, important, circumstantial. Durações típicas: 5, 15, 30, 60, 90, 120 minutos. Para gerar tarefas a partir de uma reunião, use list_fireflies_meetings e get_fireflies_transcript primeiro.",
  tools: allTools,
  transport: {
    enableJsonResponse: true,
  },
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

function getSessionId(request: Request): string | null {
  return request.headers.get("Mcp-Session-Id") ?? request.headers.get("mcp-session-id");
}

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization") ?? request.headers.get("authorization");
  if (!header) return null;

  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1]?.trim().replace(/^"|"$/g, "");
  return token || null;
}

function getCachedSessionAuth(sessionId: string | null): McpAuth | null {
  if (!sessionId) return null;

  const cached = sessionAuthCache.get(sessionId);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    sessionAuthCache.delete(sessionId);
    return null;
  }

  cached.expiresAt = Date.now() + SESSION_AUTH_TTL_MS;
  return cached.auth;
}

function cacheSessionAuth(sessionId: string | null, auth: McpAuth) {
  if (!sessionId) return;

  sessionAuthCache.set(sessionId, {
    auth,
    expiresAt: Date.now() + SESSION_AUTH_TTL_MS,
  });
}

function pruneSessionAuthCache() {
  const now = Date.now();
  for (const [sessionId, cached] of sessionAuthCache.entries()) {
    if (cached.expiresAt < now) sessionAuthCache.delete(sessionId);
  }
}

async function getMcpAuth(request: Request): Promise<McpAuth | null> {
  pruneSessionAuthCache();

  const sessionId = getSessionId(request);
  const token = getBearerToken(request);
  if (!token) return getCachedSessionAuth(sessionId);

  const hash = hashToken(token);

  const { data: oauthToken, error: oauthError } = await supabaseAdmin
    .from("oauth_access_tokens")
    .select("id, user_id, scope, revoked_at, expires_at")
    .eq("token_hash", hash)
    .maybeSingle();

  if (!oauthError && oauthToken && !oauthToken.revoked_at) {
    if (oauthToken.expires_at && new Date(oauthToken.expires_at).getTime() < Date.now()) return null;

    await supabaseAdmin
      .from("oauth_access_tokens")
      .update({ last_used_at: new Date().toISOString() } as never)
      .eq("id", oauthToken.id);

    return {
      token,
      claims: { sub: oauthToken.user_id, userId: oauthToken.user_id },
      scopes: oauthToken.scope?.split(/\s+/).filter(Boolean),
    };
  }

  const { data, error } = await supabaseAdmin
    .from("mcp_tokens")
    .select("id, user_id, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (error || !data || data.revoked_at) return null;

  await supabaseAdmin
    .from("mcp_tokens")
    .update({ last_used_at: new Date().toISOString() } as never)
    .eq("id", data.id);

  return { token, claims: { sub: data.user_id, userId: data.user_id } };
}

function buildWwwAuthenticate(request: Request): string {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const origin = `${proto}://${host}`;
  return `Bearer realm="foco-mcp", error="invalid_token", scope="mcp", resource_metadata="${origin}/.well-known/oauth-protected-resource"`;
}

function unauthorized(request: Request, description = "Authorization required for MCP tools.") {
  return new Response(
    JSON.stringify({ error: "invalid_token", error_description: description }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        ...corsHeaders,
        "WWW-Authenticate": buildWwwAuthenticate(request),
      },
    },
  );
}

export const Route = createFileRoute("/api/public/mcp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await getMcpAuth(request);
        if (!auth) return unauthorized(request);

        const res = await mcp.handleRequest(request, { auth });
        const headers = new Headers(res.headers);
        const sessionId = headers.get("Mcp-Session-Id") ?? getSessionId(request);
        cacheSessionAuth(sessionId, auth);
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
