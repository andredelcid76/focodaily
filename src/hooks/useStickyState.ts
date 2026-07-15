import { useEffect, useRef, useState } from "react";

/**
 * useState variant that persists to sessionStorage under `key`.
 * Preserves filters/view state across route navigations (e.g. list → detail → back).
 * Supports Set/Map via custom (de)serialization.
 */
export function useStickyState<T>(
  key: string,
  initial: T,
  opts?: {
    serialize?: (v: T) => string;
    deserialize?: (raw: string) => T;
  },
) {
  const serialize = opts?.serialize ?? JSON.stringify;
  const deserialize = opts?.deserialize ?? (JSON.parse as (raw: string) => T);

  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.sessionStorage.getItem(key);
      return raw != null ? deserialize(raw) : initial;
    } catch {
      return initial;
    }
  });

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    try {
      window.sessionStorage.setItem(key, serialize(state));
    } catch {
      /* ignore quota */
    }
  }, [key, state, serialize]);

  return [state, setState] as const;
}

export const setSerialize = <T>(s: Set<T>) => JSON.stringify([...s]);
export const setDeserialize = <T>(raw: string) => new Set<T>(JSON.parse(raw) as T[]);
