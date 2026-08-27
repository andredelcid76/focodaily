const FOLDER =
  "C:\\Users\\andre\\ANPLA SERVE MANUTENCAO E CONSTRUCAO LTDA\\ESTRATÉGIA - Documents\\PLANEJAMENTO ESTRATÉGICO\\2026\\CLAUDE\\PROJETOS CLAUDE";

const TOOLTIP = "Abrir esta tarefa no Claude Code (só funciona no desktop)";
const CLAUDE_ORANGE = "#D97757";

export function openTaskInClaudeCode(opts: {
  id: string;
  title: string;
  projectName?: string | null;
}) {
  const projeto = opts.projectName ?? "sem projeto";
  const prompt =
    `Vamos trabalhar na tarefa "${opts.title}" do projeto "${projeto}" do Foco ` +
    `(task id: ${opts.id}). Puxe os detalhes dessa tarefa no Foco e vamos executá-la juntos.`;
  const url = `claude://code/new?q=${encodeURIComponent(prompt)}&folder=${encodeURIComponent(FOLDER)}`;
  window.location.href = url;
}

/** Claude's sunburst mark, simplified. */
function ClaudeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M12 2.4c.36 0 .66.27.7.62l.5 4.36 2.6-3.06a.7.7 0 0 1 1.2.68l-1.5 4.12 3.86-2.12a.7.7 0 0 1 .82 1.1l-3.1 3.1 4.36.5a.7.7 0 0 1 0 1.4l-4.36.5 3.1 3.1a.7.7 0 0 1-.82 1.1l-3.86-2.12 1.5 4.12a.7.7 0 0 1-1.2.68l-2.6-3.06-.5 4.36a.7.7 0 0 1-1.4 0l-.5-4.36-2.6 3.06a.7.7 0 0 1-1.2-.68l1.5-4.12L3.94 20a.7.7 0 0 1-.82-1.1l3.1-3.1-4.36-.5a.7.7 0 0 1 0-1.4l4.36-.5-3.1-3.1a.7.7 0 0 1 .82-1.1l3.86 2.12-1.5-4.12a.7.7 0 0 1 1.2-.68l2.6 3.06.5-4.36c.04-.35.34-.62.7-.62Z" />
    </svg>
  );
}

type Props = {
  taskId: string;
  title: string;
  projectName?: string | null;
  /** "icon" for dense lists, "button" for dialogs/toolbars. */
  variant?: "icon" | "button";
  className?: string;
};

export function ClaudeCodeButton({ taskId, title, projectName, variant = "icon", className }: Props) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    openTaskInClaudeCode({ id: taskId, title, projectName });
  };

  const shared = {
    type: "button" as const,
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onClick: handleClick,
    title: TOOLTIP,
    "aria-label": TOOLTIP,
    style: { color: CLAUDE_ORANGE, borderColor: `${CLAUDE_ORANGE}59`, backgroundColor: `${CLAUDE_ORANGE}14` },
  };

  if (variant === "button") {
    return (
      <button
        {...shared}
        className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition-opacity hover:opacity-80 ${className ?? ""}`}
      >
        <ClaudeMark className="h-3.5 w-3.5" />
        Claude Code
      </button>
    );
  }

  return (
    <button
      {...shared}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition-opacity hover:opacity-80 ${className ?? ""}`}
    >
      <ClaudeMark className="h-3.5 w-3.5" />
    </button>
  );
}
