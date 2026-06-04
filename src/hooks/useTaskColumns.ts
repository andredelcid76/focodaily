import { useCallback, useEffect, useMemo, useState } from "react";

export type TaskColumnKey = "title" | "project" | "role" | "duration" | "due" | "status";

export type TaskColumnDef = {
  key: TaskColumnKey;
  label: string;
  /** CSS grid track value (e.g. "1.5fr", "7rem", "200px"). */
  width: string;
  visible: boolean;
  /** Minimum width in pixels, used as floor when resizing. */
  minPx: number;
};

const STORAGE_KEY = "today-table-columns-v1";

/** Fixed leading/trailing columns — not customizable. */
const FIXED_LEADING = "1rem 1.75rem"; // drag handle + complete button
const FIXED_TRAILING = "2.25rem"; // actions cell

const DEFAULT_COLUMNS: TaskColumnDef[] = [
  { key: "title",    label: "Tarefa",     width: "1.5fr", visible: true, minPx: 140 },
  { key: "project",  label: "Projeto",    width: "2fr",   visible: true, minPx: 120 },
  { key: "role",     label: "Papel",      width: "7rem",  visible: true, minPx: 80 },
  { key: "duration", label: "Duração",    width: "4.5rem",visible: true, minPx: 56 },
  { key: "due",      label: "Vencimento", width: "6rem",  visible: true, minPx: 80 },
  { key: "status",   label: "Status",     width: "8rem",  visible: true, minPx: 96 },
];

type PersistedState = {
  order: TaskColumnKey[];
  hidden: TaskColumnKey[];
  widths: Partial<Record<TaskColumnKey, string>>;
};

function loadFromStorage(): PersistedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (!Array.isArray(parsed.order)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveToStorage(state: PersistedState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode — ignore */
  }
}

function applyPersisted(persisted: PersistedState | null): TaskColumnDef[] {
  if (!persisted) return DEFAULT_COLUMNS.map((c) => ({ ...c }));
  const byKey = new Map(DEFAULT_COLUMNS.map((c) => [c.key, c]));
  const result: TaskColumnDef[] = [];
  for (const key of persisted.order) {
    const def = byKey.get(key);
    if (!def) continue;
    result.push({
      ...def,
      width: persisted.widths?.[key] ?? def.width,
      visible: !persisted.hidden?.includes(key),
    });
    byKey.delete(key);
  }
  // Append any columns added in future versions that aren't yet in persisted state
  for (const def of byKey.values()) result.push({ ...def });
  return result;
}

export function useTaskColumns() {
  const [columns, setColumns] = useState<TaskColumnDef[]>(() => applyPersisted(loadFromStorage()));

  // Persist on every change.
  useEffect(() => {
    saveToStorage({
      order: columns.map((c) => c.key),
      hidden: columns.filter((c) => !c.visible).map((c) => c.key),
      widths: Object.fromEntries(columns.map((c) => [c.key, c.width])) as Partial<
        Record<TaskColumnKey, string>
      >,
    });
  }, [columns]);

  // Cross-tab sync.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setColumns(applyPersisted(loadFromStorage()));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setWidth = useCallback((key: TaskColumnKey, width: string) => {
    setColumns((prev) => prev.map((c) => (c.key === key ? { ...c, width } : c)));
  }, []);

  const toggleVisible = useCallback((key: TaskColumnKey) => {
    setColumns((prev) => {
      const visibleCount = prev.filter((c) => c.visible).length;
      return prev.map((c) => {
        if (c.key !== key) return c;
        // Don't allow hiding the last visible column.
        if (c.visible && visibleCount <= 1) return c;
        return { ...c, visible: !c.visible };
      });
    });
  }, []);

  const reorder = useCallback((fromKey: TaskColumnKey, toKey: TaskColumnKey) => {
    setColumns((prev) => {
      const from = prev.findIndex((c) => c.key === fromKey);
      const to = prev.findIndex((c) => c.key === toKey);
      if (from === -1 || to === -1 || from === to) return prev;
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setColumns(DEFAULT_COLUMNS.map((c) => ({ ...c })));
  }, []);

  const gridTemplate = useMemo(() => {
    const middle = columns.filter((c) => c.visible).map((c) => `minmax(${c.minPx}px, ${c.width})`).join(" ");
    return `${FIXED_LEADING} ${middle} ${FIXED_TRAILING}`;
  }, [columns]);

  return { columns, setWidth, toggleVisible, reorder, reset, gridTemplate };
}

export { DEFAULT_COLUMNS };
