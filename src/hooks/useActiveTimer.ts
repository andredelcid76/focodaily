import { useEffect, useState, useCallback } from "react";

type TimerState = {
  taskId: string | null;
  startedAt: number | null; // epoch ms when current run started (null when paused)
  accumulatedMs: number; // ms accumulated from previous runs in this session
};

const STORAGE_KEY = "foco_active_timer_v2";

function load(): TimerState {
  if (typeof window === "undefined") return { taskId: null, startedAt: null, accumulatedMs: 0 };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { taskId: null, startedAt: null, accumulatedMs: 0 };
    const p = JSON.parse(raw);
    return {
      taskId: p.taskId ?? null,
      startedAt: p.startedAt ?? null,
      accumulatedMs: p.accumulatedMs ?? 0,
    };
  } catch {
    return { taskId: null, startedAt: null, accumulatedMs: 0 };
  }
}

function save(state: TimerState) {
  if (typeof window === "undefined") return;
  if (state.taskId) {
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
 * Single global active timer with pause/resume/stop, persisted via localStorage.
 * - start(taskId): begin or switch to a task (resets accumulator)
 * - pause(): pauses; elapsed is preserved. Returns delta seconds since last commit.
 * - resume(): resumes a paused task
 * - stop(): clears timer entirely (reset to 0). Returns final delta seconds.
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

  const isRunning = !!(state.taskId && state.startedAt);

  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isRunning]);

  const liveMs = isRunning ? now - (state.startedAt as number) : 0;
  const elapsedSeconds = Math.floor((state.accumulatedMs + liveMs) / 1000);

  const start = useCallback((taskId: string) => {
    setCurrent({ taskId, startedAt: Date.now(), accumulatedMs: 0 });
  }, []);

  const pause = useCallback((): { taskId: string; deltaSeconds: number } | null => {
    if (!current.taskId || !current.startedAt) return null;
    const runMs = Date.now() - current.startedAt;
    const deltaSeconds = Math.floor(runMs / 1000);
    setCurrent({
      taskId: current.taskId,
      startedAt: null,
      accumulatedMs: current.accumulatedMs + runMs,
    });
    return { taskId: current.taskId, deltaSeconds };
  }, []);

  const resume = useCallback(() => {
    if (!current.taskId || current.startedAt) return;
    setCurrent({ ...current, startedAt: Date.now() });
  }, []);

  const stop = useCallback((): { taskId: string; deltaSeconds: number } | null => {
    if (!current.taskId) return null;
    const taskId = current.taskId;
    let deltaSeconds = 0;
    if (current.startedAt) {
      deltaSeconds = Math.floor((Date.now() - current.startedAt) / 1000);
    }
    setCurrent({ taskId: null, startedAt: null, accumulatedMs: 0 });
    return { taskId, deltaSeconds };
  }, []);

  return {
    activeTaskId: state.taskId,
    isRunning,
    isPaused: !!state.taskId && !state.startedAt,
    elapsedSeconds,
    start,
    pause,
    resume,
    stop,
  };
}

export function formatTimer(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}
