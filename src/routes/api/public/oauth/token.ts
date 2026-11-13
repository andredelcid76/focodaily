import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CORS_HEADERS, getOrigin, randomToken, sha256Base64Url, sha256Hex } from "@/lib/oauth";
import { verifyIdJag } from "@/lib/idjag.server";

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_DAYS = 90;
const JWT_BEARER_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";

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
        if (
          grantType !== "authorization_code" &&
          grantType !== "refresh_token" &&
          grantType !== JWT_BEARER_GRANT
        ) {
          return json({ error: "unsupported_grant_type" }, 400);
        }

        if (grantType === JWT_BEARER_GRANT) {
          const assertion = body.assertion;
          const clientId = body.client_id;
          if (!assertion || !clientId) {
            return json({ error: "invalid_request", error_description: "Missing required parameter" }, 400);
          }

          const { data: client, error: clientErr } = await admin
            .from("oauth_clients")
            .select("id")
            .eq("id", clientId)
            .maybeSingle();
          if (clientErr || !client) {
            return json({ error: "invalid_client", error_description: "Unknown client" }, 400);
          }

          const expectedAudience = getOrigin(request);
          let payload: Awaited<ReturnType<typeof verifyIdJag>>;
          try {
            payload = await verifyIdJag(assertion, expectedAudience, clientId);
          } catch (e) {
            const reason = e instanceof Error ? `${e.name}: ${e.message}` : "unknown error";
            console.warn("[oauth/token] ID-JAG verification failed", reason);
            return json({ error: "invalid_grant", error_description: "Invalid assertion" }, 400);
          }

          // Replay protection: each jti may be redeemed once.
          await admin
            .from("oauth_idjag_used_jti")
            .delete()
            .lt("expires_at", new Date().toISOString());
          const { error: jtiErr } = await admin.from("oauth_idjag_used_jti").insert({
            jti: payload.jti,
            issuer: payload.iss,
            expires_at: new Date(payload.exp * 1000).toISOString(),
          } as never);
          if (jtiErr) {
            if (jtiErr.code === "23505") {
              return json({ error: "invalid_grant", error_description: "Assertion already used" }, 400);
            }
            console.error("[oauth/token] jti insert failed", jtiErr);
            return json({ error: "server_error", error_description: "Internal server error" }, 500);
          }

          const email = String(payload.email).trim();
          const emailPattern = email.replace(/[\\%_]/g, (c) => `\\${c}`);
          const { data: profiles, error: profErr } = await admin
            .from("profiles")
            .select("user_id, email")
            .ilike("email", emailPattern)
            .limit(10);
          if (profErr) {
            console.error("[oauth/token] profile lookup failed", profErr);
            return json({ error: "server_error", error_description: "Internal server error" }, 500);
          }
          const matches = ((profiles ?? []) as Array<{ user_id: string; email: string }>).filter(
            (p) => p.email.toLowerCase() === email.toLowerCase(),
          );
          // Profiles can be orphaned (user_id no longer in auth.users); confirm each
          // candidate against Auth and keep only live users with the same email.
          const emailLower = email.toLowerCase();
          const liveUserIds = new Set<string>();
          for (const p of matches) {
            if (liveUserIds.has(p.user_id)) continue;
            const { data: authData, error: authErr } = await admin.auth.admin.getUserById(p.user_id);
            const user = authData?.user;
            if (authErr || !user) continue;
            if (user.deleted_at) continue;
            if (user.banned_until && new Date(user.banned_until).getTime() > Date.now()) continue;
            if ((user.email ?? "").toLowerCase() !== emailLower) continue;
            liveUserIds.add(user.id);
          }
          if (liveUserIds.size !== 1) {
            return json({ error: "invalid_grant", error_description: "No Foco user for this identity" }, 400);
          }
          const [userId] = [...liveUserIds];

          const nowIso = new Date().toISOString();
          const { error: idErr } = await admin.from("oauth_external_identities").upsert(
            {
              issuer: payload.iss,
              subject: payload.sub,
              user_id: userId,
              email,
              last_seen_at: nowIso,
            } as never,
            { onConflict: "issuer,subject" },
          );
          if (idErr) {
            console.error("[oauth/token] external identity upsert failed", idErr);
            return json({ error: "server_error", error_description: "Internal server error" }, 500);
          }

          const access = `foco_oauth_${randomToken(32)}`;
          const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString();
          const { error: insErr } = await admin.from("oauth_access_tokens").insert({
            token_hash: sha256Hex(access),
            refresh_token_hash: null,
            client_id: clientId,
            user_id: userId,
            scope: "mcp",
            expires_at: expiresAt,
            refresh_expires_at: null,
          } as never);
          if (insErr) {
            console.error("[oauth/token] token insert failed", insErr);
            return json({ error: "server_error", error_description: "Internal server error" }, 500);
          }

          return json({
            access_token: access,
            token_type: "Bearer",
            expires_in: ACCESS_TOKEN_TTL_SECONDS,
            scope: "mcp",
            issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
          });
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
          if (updErr) {
            console.error("[oauth/token] refresh update failed", updErr);
            return json({ error: "server_error", error_description: "Internal server error" }, 500);
          }

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
        if (insErr) {
          console.error("[oauth/token] token insert failed", insErr);
          return json({ error: "server_error", error_description: "Internal server error" }, 500);
        }

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
