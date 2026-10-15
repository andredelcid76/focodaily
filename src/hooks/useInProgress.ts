import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type InProgressLike = {
  status?: string | null;
  completed?: boolean | null;
  time_spent_seconds?: number | null;
  in_progress_since?: string | null;
};

const CAP_SECONDS = 8 * 3600;

export function isTaskRunning(t: InProgressLike) {
  return t.status === "in_progress" && !t.completed;
}

/** time_spent_seconds + (agora − in_progress_since), atualizado a cada segundo. */
export function useLiveSpent(t: InProgressLike) {
  const running = isTaskRunning(t) && !!t.in_progress_since;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);
  const base = t.time_spent_seconds ?? 0;
  if (!running) return base;
  const since = new Date(t.in_progress_since as string).getTime();
  const open = Math.min(CAP_SECONDS, Math.max(0, Math.floor((now - since) / 1000)));
  return base + open;
}

export function formatTimer(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

const LEGACY_KEY = "foco_active_timer_v2";

/** Converte o antigo cronômetro único (localStorage) em tarefa em andamento no banco. */
export async function migrateLegacyTimer() {
  if (typeof window === "undefined") return;
  let taskId: string | null = null;
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (raw) taskId = JSON.parse(raw)?.taskId ?? null;
  } catch {
    /* ignore */
  }
  window.localStorage.removeItem(LEGACY_KEY);
  if (!taskId) return;
  await supabase
    .from("tasks")
    .update({ status: "in_progress" } as never)
    .eq("id", taskId)
    .eq("completed", false);
}
