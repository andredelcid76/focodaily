/** Canonical local navigation only; OAuth provider callbacks use their registered allowlist. */
export function internalReturnPath(value: unknown, origin = "https://app.invalid"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return "/";
  try {
    const url = new URL(value, origin);
    if (url.origin !== new URL(origin).origin || url.pathname.startsWith("//")) return "/";
    return url.pathname + url.search + url.hash;
  } catch { return "/"; }
}