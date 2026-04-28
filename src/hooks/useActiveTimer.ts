import { useEffect, useRef, useState, useCallback } from "react";

type TimerState = {
  taskId: string | null;
  startedAt: number | null; // epoch ms
};

const STORAGE_KEY = "foco_active_timer_v1";

function load(): TimerState {
  if (typeof window === "undefined") return { taskId: null, startedAt: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { taskId: null, startedAt: null };
    const parsed = JSON.parse(raw);
    return { taskId: parsed.taskId ?? null, startedAt: parsed.startedAt ?? null };
  } catch {
    return { taskId: null, startedAt: null };
  }
}

function save(state: TimerState) {
  if (typeof window === "undefined") return;
  if (state.taskId && state.startedAt) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

const listeners = new Set<(s: TimerState) => void>();
let current: TimerState = load();

function setCurrent(next: TimerState) {
  current = next;
  save(next);
  listeners.forEach((l) => l(next));
}

/**
 * Single global active timer. Persists across reloads via localStorage.
 * Returns the elapsed seconds (live) for the active task, plus controls.
 */
export function useActiveTimer() {
  const [state, setState] = useState<TimerState>(current);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  useEffect(() => {
    if (!state.taskId || !state.startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state.taskId, state.startedAt]);

  const elapsedSeconds =
    state.taskId && state.startedAt ? Math.floor((now - state.startedAt) / 1000) : 0;

  const start = useCallback((taskId: string) => {
    setCurrent({ taskId, startedAt: Date.now() });
  }, []);

  const stop = useCallback((): { taskId: string; seconds: number } | null => {
    if (!current.taskId || !current.startedAt) return null;
    const seconds = Math.floor((Date.now() - current.startedAt) / 1000);
    const taskId = current.taskId;
    setCurrent({ taskId: null, startedAt: null });
    return { taskId, seconds };
  }, []);

  return { activeTaskId: state.taskId, elapsedSeconds, start, stop };
}

export function formatTimer(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}
