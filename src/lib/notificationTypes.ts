export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  task_id: string | null;
  actor_id: string | null;
  read_at: string | null;
  created_at: string;
  group_count: number;
};

export const NOTIFICATION_SELECT =
  "id, type, title, body, link, task_id, actor_id, read_at, created_at, group_count";

export const NOTIFICATION_TYPES: { value: string; label: string; description: string }[] = [
  { value: "task_assigned", label: "Delegadas para mim", description: "Alguém delegou uma tarefa para você" },
  { value: "task_unassigned", label: "Reatribuídas", description: "Uma tarefa sua passou para outra pessoa" },
  { value: "task_mention", label: "Menções", description: "Alguém mencionou você com @ em um comentário" },
  { value: "task_comment", label: "Comentários", description: "Novo comentário em tarefa sua ou que você acompanha" },
  { value: "task_completed", label: "Concluídas", description: "Uma tarefa que você delegou foi concluída" },
  { value: "task_updated", label: "Alteradas", description: "Mudança de data, status, prioridade ou título" },
  { value: "task_blocked", label: "Bloqueios", description: "A tarefa anterior da sua ficou bloqueada" },
  { value: "task_unblocked", label: "Liberadas", description: "A tarefa anterior foi concluída e a sua foi liberada" },
  { value: "task_due_soon", label: "Prazo amanhã", description: "Tarefa delegada vence amanhã" },
  { value: "task_overdue", label: "Atrasadas", description: "Tarefa delegada passou do prazo" },
];

export const FILTER_GROUPS: { value: string; label: string; types: string[] | null }[] = [
  { value: "all", label: "Tudo", types: null },
  { value: "assigned", label: "Delegadas", types: ["task_assigned", "task_unassigned"] },
  { value: "comments", label: "Comentários", types: ["task_comment", "task_mention"] },
  { value: "done", label: "Concluídas", types: ["task_completed", "task_unblocked"] },
  { value: "changes", label: "Alteradas", types: ["task_updated", "task_blocked", "task_due_soon", "task_overdue"] },
];

/** Abre uma tarefa em qualquer tela do app. */
export function openTaskGlobally(taskId: string, opts?: { comments?: boolean }) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("foco:open-task", { detail: { taskId, comments: !!opts?.comments } }));
}
