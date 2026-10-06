import { Check } from "lucide-react";
import type { MouseEvent } from "react";

type Size = "sm" | "md";

type Props = {
  completed: boolean;
  onToggle: () => void;
  size?: Size;
  className?: string;
};

/**
 * Notion/Linear-style complete checkbox: rounded square with check icon.
 * Green when completed, outlined when pending.
 */
export function TaskCompleteButton({ completed, onToggle, size = "sm", className = "" }: Props) {
  const dims =
    size === "md"
      ? "h-[22px] w-[22px] rounded-full"
      : "h-[18px] w-[18px] rounded-full";
  const iconCls = size === "md" ? "h-3.5 w-3.5" : "h-3 w-3";
  return (
    <button
      type="button"
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`flex shrink-0 items-center justify-center border-2 transition-all ${dims} ${
        completed
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary hover:border-primary"
          : "border-muted-foreground/40 bg-transparent text-transparent hover:border-primary hover:text-primary/70"
      } ${className}`}
      aria-label={completed ? "Reabrir tarefa" : "Concluir tarefa"}
      title={completed ? "Reabrir tarefa" : "Concluir tarefa"}
      aria-pressed={completed}
    >
      <Check className={iconCls} strokeWidth={3} />
    </button>
  );
}
