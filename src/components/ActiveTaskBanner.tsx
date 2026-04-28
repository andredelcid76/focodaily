import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Pause, Play, Square, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTimer, formatTimer } from "@/hooks/useActiveTimer";
import { useAuth } from "@/lib/auth";

/**
 * Persistent banner shown across all pages while a task timer is active.
 * - Pulses while running
 * - Shows live elapsed time
 * - Quick controls: pause/resume/stop
 * - Click title to jump to the task's day
 */
export function ActiveTaskBanner() {
  const { user } = useAuth();
  const timer = useActiveTimer();
  const navigate = useNavigate();
  const [task, setTask] = useState<{
    id: string;
    title: string;
    scheduled_date: string;
    time_spent_seconds: number;
  } | null>(null);

  // Fetch task metadata when active task changes
  useEffect(() => {
    if (!timer.activeTaskId || !user) {
      setTask(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id,title,scheduled_date,time_spent_seconds")
        .eq("id", timer.activeTaskId)
        .maybeSingle();
      if (!cancelled && data) setTask(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [timer.activeTaskId, user]);

  if (!timer.activeTaskId || !task) return null;

  const totalSpent = (task.time_spent_seconds ?? 0) + (timer.elapsedSeconds ?? 0);
  const running = timer.isRunning;

  // Persist accumulated time on pause/stop. We mirror the index-page logic so
  // banner controls also commit time to the database.
  const commitDelta = async (deltaSeconds: number) => {
    if (deltaSeconds <= 0) return;
    const next = (task.time_spent_seconds ?? 0) + deltaSeconds;
    await supabase.from("tasks").update({ time_spent_seconds: next }).eq("id", task.id);
    setTask((t) => (t ? { ...t, time_spent_seconds: next } : t));
  };

  const handlePause = async () => {
    const r = timer.pause();
    if (r) await commitDelta(r.deltaSeconds);
  };
  const handleResume = () => timer.resume();
  const handleStop = async () => {
    const r = timer.stop();
    if (r) await commitDelta(r.deltaSeconds);
  };

  return (
    <div
      className={`sticky top-[57px] z-20 border-b backdrop-blur-xl ${
        running
          ? "border-primary/40 bg-gradient-to-r from-primary/15 via-primary/10 to-circumstantial/15"
          : "border-circumstantial/40 bg-circumstantial/10"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary">
          {running && (
            <span className="absolute inset-0 animate-ping rounded-lg bg-primary/30" />
          )}
          <Timer className="relative h-4 w-4" />
        </div>

        <button
          onClick={() =>
            navigate({ to: "/", search: undefined as never }) /* jump to Today */
          }
          className="min-w-0 flex-1 text-left"
          aria-label="Ir para a tarefa em execução"
          title={task.title}
        >
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                running ? "animate-pulse bg-primary" : "bg-circumstantial"
              }`}
            />
            {running ? "Em execução" : "Pausada"}
          </div>
          <div className="truncate text-sm font-medium">{task.title}</div>
        </button>

        <div className="flex items-center gap-2">
          <span
            className={`tabular-nums font-display text-base font-semibold ${
              running ? "text-primary" : "text-circumstantial"
            }`}
          >
            {formatTimer(totalSpent)}
          </span>
          {running ? (
            <button
              onClick={handlePause}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90"
              aria-label="Pausar"
              title="Pausar"
            >
              <Pause className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              onClick={handleResume}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-circumstantial text-primary-foreground hover:opacity-90"
              aria-label="Retomar"
              title="Retomar"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
            </button>
          )}
          <button
            onClick={handleStop}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-card text-muted-foreground hover:border-destructive/50 hover:text-destructive"
            aria-label="Parar e zerar"
            title="Parar e zerar"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
        </div>
      </div>
    </div>
  );
}
