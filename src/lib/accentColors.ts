// Accent color presets. Each preset overrides the primary/ring/gradient/glow
// tokens defined in src/styles.css. Base surfaces (background, card, sidebar,
// borders) come from the theme (light/dark) and are NOT retinted by the
// accent — this keeps the app usable in both modes without a hue clash.

export type AccentColorId =
  | "sapphire"
  | "violet"
  | "emerald"
  | "amber"
  | "rose"
  | "crimson"
  | "teal"
  | "copper"
  | "plum"
  | "slate";

export type AccentPreset = {
  id: AccentColorId;
  label: string;
  swatch: string;
  h: number;
  c: number;
  lightForeground?: boolean;
};

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "sapphire", label: "Safira",     swatch: "#5b8dd6", h: 255, c: 0.15, lightForeground: true },
  { id: "violet",   label: "Violeta",    swatch: "#8a7ad6", h: 285, c: 0.13, lightForeground: true },
  { id: "teal",     label: "Teal",       swatch: "#3aa3b0", h: 200, c: 0.11 },
  { id: "emerald",  label: "Esmeralda",  swatch: "#3ea88a", h: 165, c: 0.13 },
  { id: "plum",     label: "Ameixa",     swatch: "#a76a8a", h: 340, c: 0.11, lightForeground: true },
  { id: "rose",     label: "Rosé",       swatch: "#c97a7a", h: 20,  c: 0.11 },
  { id: "crimson",  label: "Carmim",     swatch: "#c85a4a", h: 25,  c: 0.16, lightForeground: true },
  { id: "copper",   label: "Cobre",      swatch: "#c48254", h: 50,  c: 0.13 },
  { id: "amber",    label: "Âmbar",      swatch: "#d1a24a", h: 80,  c: 0.14 },
  { id: "slate",    label: "Grafite",    swatch: "#8a94a2", h: 250, c: 0.03, lightForeground: true },
];

export const DEFAULT_ACCENT: AccentColorId = "sapphire";

export function getAccentPreset(id: string | null | undefined): AccentPreset {
  return ACCENT_PRESETS.find((p) => p.id === id) ?? ACCENT_PRESETS[0];
}

/**
 * Apply an accent preset to :root. Only overrides accent-driven tokens
 * (primary, ring, gradients, glow, selection). Base surfaces stay owned by
 * the light/dark theme.
 */
export function applyAccentColor(id: string | null | undefined) {
  if (typeof document === "undefined") return;
  const p = getAccentPreset(id);
  const { h, c } = p;
  const root = document.documentElement;

  const primary    = `oklch(0.60 ${c} ${h})`;
  const ring       = `oklch(0.70 ${c} ${h})`;
  const gradStart  = `oklch(0.55 ${c} ${h})`;
  const gradEnd    = `oklch(0.72 ${Math.max(c - 0.01, 0.02)} ${h})`;
  const shadowGlow = `0 0 50px -12px oklch(0.62 ${Math.max(c + 0.02, 0.10)} ${h} / 0.42)`;
  const selectionBg = `oklch(0.62 ${c} ${h} / 0.32)`;

  const fg = p.lightForeground
    ? "oklch(0.98 0.005 250)"
    : `oklch(0.14 ${Math.min(c, 0.03)} ${h})`;

  root.style.setProperty("--primary", primary);
  root.style.setProperty("--primary-foreground", fg);
  root.style.setProperty("--ring", ring);
  root.style.setProperty("--sidebar-primary", primary);
  root.style.setProperty("--sidebar-primary-foreground", fg);
  root.style.setProperty("--sidebar-ring", ring);

  root.style.setProperty(
    "--gradient-primary",
    `linear-gradient(135deg, ${gradStart} 0%, ${gradEnd} 100%)`,
  );
  root.style.setProperty(
    "--gradient-prestige",
    `linear-gradient(135deg, ${gradStart} 0%, oklch(0.78 ${Math.max(c - 0.02, 0.04)} ${h}) 100%)`,
  );

  root.style.setProperty("--shadow-glow", shadowGlow);
  root.style.setProperty("--selection-bg", selectionBg);

  // Sync <meta name="theme-color"> to a dark tint of the accent.
  try {
    const themeMetaColor = `oklch(0.18 ${Math.min(c, 0.03)} ${h})`;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = themeMetaColor;
  } catch { /* ignore */ }

  try {
    localStorage.setItem("foco-accent", p.id);
  } catch { /* ignore */ }
}

/** Read the cached accent from localStorage (safe on SSR). */
export function readCachedAccent(): AccentColorId {
  if (typeof window === "undefined") return DEFAULT_ACCENT;
  try {
    const v = localStorage.getItem("foco-accent");
    if (v && ACCENT_PRESETS.some((p) => p.id === v)) return v as AccentColorId;
  } catch { /* ignore */ }
  return DEFAULT_ACCENT;
}
