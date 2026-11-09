// Shared rules for the task "origin" chip (Outlook / Fireflies / Pipedrive) in lists and cards.

export type OriginKind = "email" | "meeting" | "pipedrive" | "pipedrive_cadencia";

/** Visible chip name per origin_source. */
export function originChipName(src: string | null | undefined): string {
  if (src === "email") return "Outlook";
  if (src === "meeting") return "Fireflies";
  if (src === "pipedrive_cadencia") return "Pipedrive · cadência";
  return "Pipedrive";
}

/** Only http(s) URLs become links; internal keys such as pipedrive-cadencia://… render as a plain chip. */
export function originChipHref(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url.trim()) ? url : null;
}
