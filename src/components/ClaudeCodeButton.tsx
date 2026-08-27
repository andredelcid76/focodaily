import { Play } from "lucide-react";

const FOLDER =
  "C:\\Users\\andre\\ANPLA SERVE MANUTENCAO E CONSTRUCAO LTDA\\ESTRATÉGIA - Documents\\PLANEJAMENTO ESTRATÉGICO\\2026\\CLAUDE\\PROJETOS CLAUDE";

const TOOLTIP = "Abrir esta tarefa no Claude Code (só funciona no desktop)";

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

  if (variant === "button") {
    return (
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={handleClick}
        title={TOOLTIP}
        aria-label={TOOLTIP}
        className={`inline-flex h-9 items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground ${className ?? ""}`}
      >
        <Play className="h-3 w-3 fill-current" />
        Claude
      </button>
    );
  }

  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={handleClick}
      title={TOOLTIP}
      aria-label={TOOLTIP}
      className={`inline-flex h-7 items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground ${className ?? ""}`}
    >
      <Play className="h-2.5 w-2.5 fill-current" />
      Claude
    </button>
  );
}
