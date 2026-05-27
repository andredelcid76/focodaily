import { createHash, randomBytes } from "crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function sha256Base64Url(input: string): string {
  return createHash("sha256").update(input).digest("base64url");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function randomId(prefix: string, bytes = 16): string {
  return `${prefix}_${randomBytes(bytes).toString("base64url")}`;
}

export function getOrigin(request: Request): string {
  const url = new URL(request.url);
  // Honor x-forwarded-host/proto when present (proxies)
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  return `${proto}://${host}`;
}

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id",
};
