import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "foco-theme";

function readStored(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch { /* ignore */ }
  return "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Compute the actual resolved theme (light|dark) from a mode. */
function resolve(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

/** Apply the resolved theme class to <html>. */
export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const resolved = resolve(mode);
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
  try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore */ }
}

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(() => readStored());

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    applyTheme(next);
  }, []);

  // Re-apply on mount (safety in case SSR/pre-hydration script missed).
  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  // React to OS theme changes when in "system" mode.
  useEffect(() => {
    if (mode !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  return { mode, setMode, resolved: resolve(mode) };
}
