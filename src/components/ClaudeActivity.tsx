import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { ClaudeMark } from "./ClaudeCodeButton";

export const CLAUDE_CHANGED_EVENT = "foco:claude-changed";

/** ▶ Claude: põe a tarefa em andamento e marca a origem Claude. */
export async function setClaudeStarted(taskId: string, value: string | null) {
  const patch: Record<string, unknown> = { claude_started_at: value };
  if (value) patch.status = "in_progress";
  const { error } = await supabase.from("tasks").update(patch as never).eq("id", taskId);
  window.dispatchEvent(new CustomEvent(CLAUDE_CHANGED_EVENT, { detail: { taskId, value } }));
  return !error;
}

type ActiveRow = { id: string; title: string; claude_started_at: string | null };

/** Faixa no topo de Hoje com TODAS as tarefas em andamento (qualquer data). */
export function ClaudeActiveStrip() {
  const [rows, setRows] = useState<ActiveRow[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) {
          if (alive) setRows([]);
          return;
        }
        const data = await fetchAllRows<ActiveRow>(() =>
          supabase
            .from("tasks")
            .select("id,title,claude_started_at")
            .eq("status", "in_progress")
            .eq("completed", false)
            .or(`assignee_id.eq.${uid},and(assignee_id.is.null,user_id.eq.${uid})`)
            .order("in_progress_since" as never, { ascending: false })
            .order("id"),
        );
        if (alive) setRows(data);
      } catch {
        /* ignore */
      }
    };
    void load();
    const onChange = () => void load();
    window.addEventListener(CLAUDE_CHANGED_EVENT, onChange);
    window.addEventListener("foco:tasks-changed", onChange);
    const channel = supabase
      .channel(`in-progress-strip-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, onChange)
      .subscribe();
    return () => {
      alive = false;
      window.removeEventListener(CLAUDE_CHANGED_EVENT, onChange);
      window.removeEventListener("foco:tasks-changed", onChange);
      void supabase.removeChannel(channel);
    };
  }, []);

  if (rows.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
      <span className="font-semibold">Em andamento:</span>
      {rows.map((r, i) => (
        <span key={r.id} className="inline-flex items-center gap-1">
          {r.claude_started_at && (
            <span style={{ color: "#D97757" }} className="inline-flex" title="No Claude">
              <ClaudeMark className="h-3 w-3" />
            </span>
          )}
          <button
            type="button"
            className="text-foreground hover:underline underline-offset-2"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("foco:open-task", { detail: { taskId: r.id, comments: false } }))
            }
          >
            {r.title}
          </button>
          {i < rows.length - 1 ? "," : ""}
        </span>
      ))}
    </div>
  );
}
