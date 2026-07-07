import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Fonte única de verdade para obter um access token válido do Outlook.
 *
 * Antes, a lógica de refresh estava duplicada em 7 lugares (outlook.ts,
 * outlook.functions.ts, planner.ts, planner.functions.ts, inbox/scan.ts,
 * inbox/tag-email.ts). Isso causava a desconexão espontânea: quando o scan de
 * e-mail e o sync de calendário refrescavam o MESMO refresh_token quase juntos,
 * o Azure invalidava o antigo ao emitir o novo, e o segundo refresh recebia
 * `invalid_grant` e apagava a conexão.
 *
 * Aqui isso é resolvido com duas defesas:
 *  - lock em processo por usuário: refreshes concorrentes no mesmo worker
 *    compartilham uma única chamada (cobre o caso comum: scan + calendário no
 *    mesmo request);
 *  - guarda de re-leitura no invalid_grant: antes de apagar a conexão, relê a
 *    linha; se o refresh_token guardado mudou (outro processo/instância acabou
 *    de rotacionar), usa o token novo em vez de desconectar.
 */

const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const SCOPES =
  "offline_access openid profile User.Read Mail.ReadWrite Calendars.ReadWrite Tasks.ReadWrite Group.Read.All";
const EXPIRY_MARGIN_MS = 120_000;

export class OutlookReauthError extends Error {
  code = "REAUTH_REQUIRED" as const;
  constructor(message: string) {
    super(message);
    this.name = "OutlookReauthError";
  }
}

export function isInvalidGrant(payload: unknown): boolean {
  const s = JSON.stringify(payload ?? "");
  return (
    s.includes('"invalid_grant"') ||
    s.includes("AADSTS65001") ||
    s.includes("AADSTS70008") ||
    s.includes("AADSTS50173") ||
    s.includes("AADSTS700082") ||
    s.includes("AADSTS700084")
  );
}

export type OutlookTokenFields = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

const inflight = new Map<string, Promise<string>>();

async function refreshAndPersist(userId: string, refreshToken: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID ?? "",
    client_secret: process.env.MS_CLIENT_SECRET ?? "",
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: SCOPES,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (isInvalidGrant(json)) {
      // Outra instância pode ter acabado de rotacionar o token, invalidando o
      // nosso. Relê antes de desistir — se o token guardado mudou e ainda é
      // válido, a conexão está de fato saudável.
      const { data: fresh } = await supabaseAdmin
        .from("outlook_connections")
        .select("access_token,refresh_token,expires_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (
        fresh &&
        (fresh.refresh_token as string) !== refreshToken &&
        new Date(fresh.expires_at as string).getTime() - Date.now() >= EXPIRY_MARGIN_MS
      ) {
        return fresh.access_token as string;
      }
      await supabaseAdmin.from("outlook_connections").delete().eq("user_id", userId);
      throw new OutlookReauthError(
        "Sua conexão com o Outlook expirou. Reconecte para continuar sincronizando.",
      );
    }
    throw new Error(`Refresh token failed [${res.status}]: ${JSON.stringify(json).slice(0, 300)}`);
  }

  const data = json as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };

  const update: Record<string, unknown> = {
    access_token: data.access_token,
    // Sempre persiste o refresh_token rotacionado quando o Azure retorna um;
    // só cai no antigo quando NÃO retorna (esta era a linha duplicada em 7 lugares).
    refresh_token: data.refresh_token ?? refreshToken,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
  if (data.scope) update.scope = data.scope;

  const { error } = await supabaseAdmin
    .from("outlook_connections")
    .update(update as never)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  return data.access_token;
}

/**
 * Retorna um access token válido do Outlook para o usuário, refrescando (uma
 * única vez, mesmo sob chamadas concorrentes) quando o atual estiver a menos de
 * EXPIRY_MARGIN_MS de expirar. `conn` é a linha já lida de outlook_connections.
 */
export async function getValidOutlookAccessToken(
  userId: string,
  conn: OutlookTokenFields,
): Promise<string> {
  if (new Date(conn.expires_at).getTime() - Date.now() >= EXPIRY_MARGIN_MS) {
    return conn.access_token;
  }
  const existing = inflight.get(userId);
  if (existing) return existing;
  const p = refreshAndPersist(userId, conn.refresh_token).finally(() => inflight.delete(userId));
  inflight.set(userId, p);
  return p;
}
