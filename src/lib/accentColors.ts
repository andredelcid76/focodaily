// Accent color presets. Each preset provides the CSS custom properties that
// override the emerald defaults in src/styles.css. We keep the dark theme,
// gradients and glow — only the primary/ring/gradient hues shift.
//
// Lightness stops (mid / bright / soft / gradient start) mirror the emerald
// baseline in styles.css so every color keeps the same "prestige" feel:
// - base    (--primary):          L 0.62
// - ring    (--ring):             L 0.72
// - grad lo (gradient start):     L 0.55
// - grad hi (gradient end):       L 0.72

export type AccentColorId =
  | "emerald"
  | "sapphire"
  | "violet"
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
  /** Hex for the swatch UI. */
  swatch: string;
  /** OKLCH hue angle. */
  h: number;
  /** OKLCH chroma for the mid/bright stops. */
  c: number;
  /** Whether the foreground on `--primary` should be light. Default: dark. */
  lightForeground?: boolean;
};

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "emerald", label: "Esmeralda", swatch: "#3ea88a", h: 165, c: 0.13 },
  { id: "teal",    label: "Teal",       swatch: "#3aa3b0", h: 200, c: 0.11 },
  { id: "sapphire",label: "Safira",     swatch: "#5b8dd6", h: 250, c: 0.13, lightForeground: true },
  { id: "violet",  label: "Violeta",    swatch: "#8a7ad6", h: 285, c: 0.13, lightForeground: true },
  { id: "plum",    label: "Ameixa",     swatch: "#a76a8a", h: 340, c: 0.11, lightForeground: true },
  { id: "rose",    label: "Rosé",       swatch: "#c97a7a", h: 20,  c: 0.11 },
  { id: "crimson", label: "Carmim",     swatch: "#c85a4a", h: 25,  c: 0.16, lightForeground: true },
  { id: "copper",  label: "Cobre",      swatch: "#c48254", h: 50,  c: 0.13 },
  { id: "amber",   label: "Âmbar",      swatch: "#d1a24a", h: 80,  c: 0.14 },
  { id: "slate",   label: "Grafite",    swatch: "#8a94a2", h: 250, c: 0.03, lightForeground: true },
];

export const DEFAULT_ACCENT: AccentColorId = "emerald";

export function getAccentPreset(id: string | null | undefined): AccentPreset {
  return ACCENT_PRESETS.find((p) => p.id === id) ?? ACCENT_PRESETS[0];
}

/**
 * Apply an accent preset to :root by setting CSS custom properties. Runs
 * synchronously so it's safe to call before first paint (from localStorage
 * cache) and again whenever the profile loads.
 */
export function applyAccentColor(id: string | null | undefined) {
  if (typeof document === "undefined") return;
  const p = getAccentPreset(id);
  const { h, c } = p;
  const root = document.documentElement;

  const primary       = `oklch(0.62 ${c} ${h})`;
  const ring          = `oklch(0.72 ${c} ${h})`;
  const gradStart     = `oklch(0.55 ${c} ${h})`;
  const gradEnd       = `oklch(0.72 ${Math.max(c - 0.01, 0.02)} ${h})`;
  const bgTopGlow     = `oklch(0.32 ${Math.min(c - 0.03, 0.10)} ${h} / 0.55)`;
  const bgMidGlow     = `oklch(0.30 ${Math.min(c - 0.04, 0.09)} ${h} / 0.20)`;
  const bgBottomGlow  = `oklch(0.20 ${Math.min(c - 0.09, 0.04)} ${h} / 0.7)`;
  const shadowGlow    = `0 0 50px -12px oklch(0.62 ${Math.max(c + 0.03, 0.10)} ${h} / 0.45)`;
  const selectionBg   = `oklch(0.62 ${c} ${h} / 0.35)`;
  const glassC        = Math.min(c, 0.03);
  const glassBg       = `oklch(0.21 ${glassC} ${h} / 0.6)`;
  const glassStrongBg = `oklch(0.18 ${glassC} ${h} / 0.78)`;
  const scrollThumb   = `oklch(0.30 ${glassC} ${h} / 0.6)`;
  const scrollThumbHi = `oklch(0.40 ${Math.min(c, 0.05)} ${h} / 0.8)`;

  const fg = p.lightForeground
    ? "oklch(0.98 0.005 90)"
    : `oklch(0.14 ${Math.min(c, 0.03)} ${h})`;

  root.style.setProperty("--primary", primary);
  root.style.setProperty("--primary-foreground", fg);
  root.style.setProperty("--ring", ring);
  root.style.setProperty("--sidebar-primary", primary);
  root.style.setProperty("--sidebar-primary-foreground", fg);
  root.style.setProperty("--sidebar-ring", ring);

  // Retint base surfaces so the whole app (background, cards, popovers,
  // sidebar, inputs, borders) inherits the accent hue — not just buttons.
  const surfaceC = Math.min(c, 0.03);
  root.style.setProperty("--background",        `oklch(0.16 ${surfaceC} ${h})`);
  root.style.setProperty("--card",              `oklch(0.21 ${surfaceC} ${h})`);
  root.style.setProperty("--popover",           `oklch(0.20 ${surfaceC} ${h})`);
  root.style.setProperty("--muted",             `oklch(0.24 ${surfaceC} ${h})`);
  root.style.setProperty("--secondary",         `oklch(0.24 ${surfaceC} ${h})`);
  root.style.setProperty("--accent",            `oklch(0.28 ${Math.min(c, 0.05)} ${h})`);
  root.style.setProperty("--border",            `oklch(0.30 ${surfaceC} ${h} / 0.55)`);
  root.style.setProperty("--input",             `oklch(0.26 ${surfaceC} ${h} / 0.6)`);
  root.style.setProperty("--sidebar",           `oklch(0.14 ${surfaceC} ${h})`);
  root.style.setProperty("--sidebar-accent",    `oklch(0.24 ${surfaceC} ${h})`);
  root.style.setProperty("--sidebar-border",    `oklch(0.28 ${surfaceC} ${h} / 0.55)`);

  // Glass / scrollbar / selection — retinted to the accent.
  root.style.setProperty("--glass-bg", glassBg);
  root.style.setProperty("--glass-strong-bg", glassStrongBg);
  root.style.setProperty("--scrollbar-thumb", scrollThumb);
  root.style.setProperty("--scrollbar-thumb-hover", scrollThumbHi);
  root.style.setProperty("--selection-bg", selectionBg);

  root.style.setProperty(
    "--gradient-primary",
    `linear-gradient(135deg, ${gradStart} 0%, ${gradEnd} 100%)`,
  );
  // Prestige uses close hues within the accent for a smooth nuance, no jump
  // to a distant color.
  root.style.setProperty(
    "--gradient-prestige",
    `linear-gradient(135deg, ${gradStart} 0%, oklch(0.78 ${Math.max(c - 0.02, 0.04)} ${h}) 100%)`,
  );

  // Painterly page background — same shape as :root, fully retinted so no
  // green residue leaks through when the accent isn't emerald.
  root.style.setProperty(
    "--gradient-bg",
    `radial-gradient(ellipse 80% 55% at 18% -10%, ${bgTopGlow}, transparent 60%),` +
      ` radial-gradient(ellipse 60% 50% at 100% 100%, ${bgMidGlow}, transparent 65%),` +
      ` radial-gradient(ellipse 90% 60% at 50% 130%, ${bgBottomGlow}, transparent 60%)`,
  );

  root.style.setProperty("--shadow-glow", shadowGlow);

  // Sync <meta name="theme-color"> so the OS window chrome (installed PWA
  // title bar on Windows, address bar on mobile Chrome/Edge) follows the
  // accent. Uses a very dark tint of the accent hue to match the app shell.
  try {
    const themeMetaColor = `oklch(0.18 ${surfaceC} ${h})`;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = themeMetaColor;
  } catch { /* ignore */ }

  // Persist for pre-hydration flash-prevention.
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
