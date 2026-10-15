import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const CLAUDE_ACTIVE_MS = 8 * 60 * 60 * 1000;
export const CLAUDE_CHANGED_EVENT = "foco:claude-changed";

export function isClaudeActive(startedAt: string | null | undefined, now = Date.now()) {
  if (!startedAt) return false;
  const t = new Date(startedAt).getTime();
  return Number.isFinite(t) && now - t < CLAUDE_ACTIVE_MS && now - t >= -60_000;
}

function ago(startedAt: string, now: number) {
  const mins = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 60000));
  return mins < 60 ? `há ${mins}min` : `há ${Math.floor(mins / 60)}h`;
}

export async function setClaudeStarted(taskId: string, value: string | null) {
  const { error } = await supabase
    .from("tasks")
    .update({ claude_started_at: value } as never)
    .eq("id", taskId);
  window.dispatchEvent(new CustomEvent(CLAUDE_CHANGED_EVENT, { detail: { taskId, value } }));
  return !error;
}

function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Selo "🤖 no Claude · há X" — some sozinho após 8h. */
export function ClaudeBadge({ taskId, startedAt }: { taskId: string; startedAt: string | null | undefined }) {
  const now = useNow();
  const [local, setLocal] = useState(startedAt ?? null);
  useEffect(() => setLocal(startedAt ?? null), [startedAt]);
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ taskId: string; value: string | null }>).detail;
      if (d?.taskId === taskId) setLocal(d.value);
    };
    window.addEventListener(CLAUDE_CHANGED_EVENT, h);
    return () => window.removeEventListener(CLAUDE_CHANGED_EVENT, h);
  }, [taskId]);
  if (!local || !isClaudeActive(local, now)) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
      title="Em execução no Claude"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      🤖 no Claude · {ago(local, now)}
      <button
        type="button"
        aria-label="Desligar selo do Claude"
        title="Desligar"
        className="ml-0.5 rounded hover:text-foreground"
        onClick={(e) => {
          e.stopPropagation();
          setLocal(null);
          void setClaudeStarted(taskId, null);
        }}
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

type ActiveRow = { id: string; title: string; claude_started_at: string };

/** Faixa no topo da visão do dia com tarefas em execução no Claude (qualquer data). */
export function ClaudeActiveStrip() {
  const [rows, setRows] = useState<ActiveRow[]>([]);
  const now = useNow();

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const since = new Date(Date.now() - CLAUDE_ACTIVE_MS).toISOString();
      const { data } = await supabase
        .from("tasks")
        .select("id,title,claude_started_at")
        .gt("claude_started_at" as never, since)
        .eq("completed", false)
        .order("claude_started_at" as never, { ascending: false })
        .limit(50);
      if (alive) setRows((data ?? []) as unknown as ActiveRow[]);
    };
    void load();
    const onChange = () => void load();
    window.addEventListener(CLAUDE_CHANGED_EVENT, onChange);
    const channel = supabase
      .channel(`claude-strip-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, onChange)
      .subscribe();
    return () => {
      alive = false;
      window.removeEventListener(CLAUDE_CHANGED_EVENT, onChange);
      void supabase.removeChannel(channel);
    };
  }, []);

  const active = rows.filter((r) => isClaudeActive(r.claude_started_at, now));
  if (active.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <span className="font-semibold">🤖 Em execução no Claude:</span>
      {active.map((r, i) => (
        <span key={r.id}>
          <button
            type="button"
            className="text-foreground hover:underline underline-offset-2"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("foco:open-task", { detail: { taskId: r.id, comments: false } }))
            }
          >
            {r.title}
          </button>
          {i < active.length - 1 ? "," : ""}
        </span>
      ))}
    </div>
  );
}
