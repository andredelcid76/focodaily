/** Only known transport failures retry; invalid recipients/configuration are terminal. */
export function isTransientDeliveryError(error: unknown): boolean {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error ?? "");
  const status = typeof error === "object" && error !== null && "status" in error
    ? Number(error.status) : Number(message.match(/(?:http[: _-]?|lookup_|create_|send_|status[: =]*)(\d{3})/i)?.[1]);
  if (Number.isFinite(status)) return status === 408 || status === 429 || status >= 500 && status < 600;
  return /timeout|timed? ?out|aborterror|fetch failed|failed to fetch|network|socket|econn|enotfound|eai_again|connection (?:reset|closed|refused)/i.test(message);
}