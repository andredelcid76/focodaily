import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CORS_HEADERS, randomToken, sha256Base64Url, sha256Hex } from "@/lib/oauth";

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_DAYS = 90;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      ...CORS_HEADERS,
    },
  });
}

async function parseBody(request: Request): Promise<Record<string, string>> {
  const ct = request.headers.get("content-type") ?? "";
  if (ct.includes("application/x-www-form-urlencoded")) {
    const text = await request.text();
    const params = new URLSearchParams(text);
    return Object.fromEntries(params.entries());
  }
  if (ct.includes("application/json")) {
    const j = (await request.json()) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(j)) if (v != null) out[k] = String(v);
    return out;
  }
  // try form-data fallback
  try {
    const fd = await request.formData();
    const out: Record<string, string> = {};
    fd.forEach((v, k) => {
      out[k] = String(v);
    });
    return out;
  } catch {
    return {};
  }
}

export const Route = createFileRoute("/api/public/oauth/token")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        const admin = supabaseAdmin as any;
        const body = await parseBody(request);
        const grantType = body.grant_type;
        if (grantType !== "authorization_code" && grantType !== "refresh_token") {
          return json({ error: "unsupported_grant_type" }, 400);
        }

        if (grantType === "refresh_token") {
          const refreshToken = body.refresh_token;
          const clientId = body.client_id;
          if (!refreshToken || !clientId) {
            return json({ error: "invalid_request", error_description: "Missing required parameter" }, 400);
          }

          const refreshHash = sha256Hex(refreshToken);
          const { data: stored, error } = await admin
            .from("oauth_access_tokens")
            .select("id, user_id, client_id, scope, revoked_at, refresh_expires_at")
            .eq("refresh_token_hash", refreshHash)
            .maybeSingle();
          if (error || !stored || stored.revoked_at) {
            return json({ error: "invalid_grant", error_description: "Unknown refresh token" }, 400);
          }
          if (stored.client_id !== clientId) {
            return json({ error: "invalid_grant", error_description: "client_id mismatch" }, 400);
          }
          if (stored.refresh_expires_at && new Date(stored.refresh_expires_at).getTime() < Date.now()) {
            return json({ error: "invalid_grant", error_description: "Refresh token expired" }, 400);
          }

          const nextAccess = `foco_oauth_${randomToken(32)}`;
          const nextRefresh = `foco_refresh_${randomToken(32)}`;
          const nextExpiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString();
          const nextRefreshExpiresAt = new Date(
            Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
          ).toISOString();

          const { error: updErr } = await admin
            .from("oauth_access_tokens")
            .update({
              token_hash: sha256Hex(nextAccess),
              refresh_token_hash: sha256Hex(nextRefresh),
              expires_at: nextExpiresAt,
              refresh_expires_at: nextRefreshExpiresAt,
              last_used_at: new Date().toISOString(),
            } as never)
            .eq("id", stored.id);
          if (updErr) return json({ error: "server_error", error_description: updErr.message }, 500);

          return json({
            access_token: nextAccess,
            token_type: "Bearer",
            expires_in: ACCESS_TOKEN_TTL_SECONDS,
            refresh_token: nextRefresh,
            scope: stored.scope ?? "mcp",
          });
        }

        const code = body.code;
        const redirectUri = body.redirect_uri;
        const clientId = body.client_id;
        const codeVerifier = body.code_verifier;

        if (!code || !redirectUri || !clientId || !codeVerifier) {
          return json({ error: "invalid_request", error_description: "Missing required parameter" }, 400);
        }

        const { data: ac, error } = await supabaseAdmin
          .from("oauth_auth_codes")
          .select("code, client_id, user_id, redirect_uri, code_challenge, code_challenge_method, scope, used_at, expires_at")
          .eq("code", code)
          .maybeSingle();
        if (error || !ac) return json({ error: "invalid_grant", error_description: "Unknown code" }, 400);
        if (ac.used_at) return json({ error: "invalid_grant", error_description: "Code already used" }, 400);
        if (new Date(ac.expires_at).getTime() < Date.now())
          return json({ error: "invalid_grant", error_description: "Code expired" }, 400);
        if (ac.client_id !== clientId)
          return json({ error: "invalid_grant", error_description: "client_id mismatch" }, 400);
        if (ac.redirect_uri !== redirectUri)
          return json({ error: "invalid_grant", error_description: "redirect_uri mismatch" }, 400);

        const verifierHash = sha256Base64Url(codeVerifier);
        if (verifierHash !== ac.code_challenge)
          return json({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);

        // Mark code used
        await supabaseAdmin
          .from("oauth_auth_codes")
          .update({ used_at: new Date().toISOString() } as never)
          .eq("code", code);

        // Issue access + refresh token
        const access = `foco_oauth_${randomToken(32)}`;
        const refresh = `foco_refresh_${randomToken(32)}`;
        const tokenHash = sha256Hex(access);
        const refreshTokenHash = sha256Hex(refresh);
        const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString();
        const refreshExpiresAt = new Date(
          Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString();
        const { error: insErr } = await admin.from("oauth_access_tokens").insert({
          token_hash: tokenHash,
          refresh_token_hash: refreshTokenHash,
          client_id: ac.client_id,
          user_id: ac.user_id,
          scope: ac.scope ?? "mcp",
          expires_at: expiresAt,
          refresh_expires_at: refreshExpiresAt,
        } as never);
        if (insErr) return json({ error: "server_error", error_description: insErr.message }, 500);

        return json({
          access_token: access,
          token_type: "Bearer",
          expires_in: ACCESS_TOKEN_TTL_SECONDS,
          refresh_token: refresh,
          scope: ac.scope ?? "mcp",
        });
      },
    },
  },
});
