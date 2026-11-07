/**
 * Outlook OAuth `state` bound to the browser that started the flow.
 * state = `<uuid>.<sha256(uuid.nonce)>`; the nonce lives only in an httpOnly cookie,
 * so a state captured elsewhere cannot be completed from another browser.
 */
export const OUTLOOK_STATE_COOKIE = "__Secure-outlook-state";
export const OUTLOOK_STATE_TTL = 600;
export const OUTLOOK_STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/api/public/outlook/callback",
  maxAge: OUTLOOK_STATE_TTL,
} as const;

export function outlookStateCookieHeader(nonce: string, maxAge = OUTLOOK_STATE_TTL): string {
  return `${OUTLOOK_STATE_COOKIE}=${nonce}; HttpOnly; Secure; SameSite=Lax; Path=${OUTLOOK_STATE_COOKIE_OPTIONS.path}; Max-Age=${maxAge}`;
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function binding(id: string, nonce: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${id}.${nonce}`));
  return base64url(new Uint8Array(digest));
}

export async function buildState(): Promise<{ state: string; nonce: string }> {
  const nonce = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const id = crypto.randomUUID();
  return { state: `${id}.${await binding(id, nonce)}`, nonce };
}

export async function verifyState(state: string, nonce: string | undefined): Promise<boolean> {
  if (!nonce || !/^[A-Za-z0-9_-]{43}$/.test(nonce)) return false;
  const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/.exec(state);
  if (!match) return false;
  const expected = await binding(match[1], nonce);
  let difference = 0;
  for (let i = 0; i < 43; i++) difference |= match[2].charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}
