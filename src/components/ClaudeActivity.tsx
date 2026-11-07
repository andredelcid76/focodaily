import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import type { Task } from "@/hooks/useTasks";
import { supabase } from "@/integrations/supabase/client";
import { ClaudeMark } from "./ClaudeCodeButton";

export const CLAUDE_CHANGED_EVENT = "foco:claude-changed";

/** ▶ Claude: põe a tarefa em andamento e marca a origem Claude. */
export async function setClaudeStarted(taskId: string, value: string | null) {
  const patch: Record<string, unknown> = { claude_started_at: value };
  if (value) {
    patch.status = "in_progress";
    patch.claude_last_activity_at = value;
  }
  const { error } = await supabase.from("tasks").update(patch as never).eq("id", taskId);
  window.dispatchEvent(new CustomEvent(CLAUDE_CHANGED_EVENT, { detail: { taskId, value } }));
  return !error;
}

/** The day collection already includes tasks from every date and receives the shared feed. */
export function ClaudeActiveStrip({ tasks }: { tasks: Task[] }) {
  const { user } = useAuth();
  const rows = useMemo(() => tasks.filter(t => t.status === "in_progress" && !t.completed && (t.assignee_id === user?.id || (!t.assignee_id && t.user_id === user?.id))).sort((a, b) => (b.in_progress_since ?? "").localeCompare(a.in_progress_since ?? "")), [tasks, user?.id]);

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
