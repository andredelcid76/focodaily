import { ChevronsUp, ChevronUp, Minus, ChevronDown, ChevronsDown } from "lucide-react";

export type PriorityLevel = 1 | 2 | 3 | 4 | 5;

export const PRIORITY_LEVELS: PriorityLevel[] = [5, 4, 3, 2, 1];

export const PRIORITY_LABEL: Record<PriorityLevel, string> = {
  5: "Crítica",
  4: "Alta",
  3: "Média",
  2: "Baixa",
  1: "Muito baixa",
};

const PRIORITY_STYLE: Record<PriorityLevel, string> = {
  5: "border-overdue/40 bg-overdue/15 text-overdue",
  4: "border-urgent/40 bg-urgent/15 text-urgent",
  3: "border-important/40 bg-important/15 text-important",
  2: "border-circumstantial/40 bg-circumstantial/15 text-circumstantial",
  1: "border-border/60 bg-muted/30 text-muted-foreground",
};

const PRIORITY_TEXT: Record<PriorityLevel, string> = {
  5: "text-overdue",
  4: "text-urgent",
  3: "text-important",
  2: "text-circumstantial",
  1: "text-muted-foreground",
};

const PRIORITY_ICON: Record<PriorityLevel, typeof Minus> = {
  5: ChevronsUp,
  4: ChevronUp,
  3: Minus,
  2: ChevronDown,
  1: ChevronsDown,
};

/** Normalizes any stored value into a valid 1–5 level (default 3). */
export function toPriority(value: unknown): PriorityLevel {
  const n = Number(value);
  if (n >= 1 && n <= 5) return Math.round(n) as PriorityLevel;
  return 3;
}

export function PriorityIcon({
  priority,
  className = "h-3.5 w-3.5",
}: {
  priority: unknown;
  className?: string;
}) {
  const p = toPriority(priority);
  const Icon = PRIORITY_ICON[p];
  return <Icon className={`${className} ${PRIORITY_TEXT[p]} shrink-0`} aria-label={`Prioridade ${PRIORITY_LABEL[p]}`} />;
}

export function PriorityBadge({
  priority,
  size = "sm",
  showLabel = true,
  className = "",
}: {
  priority: unknown;
  size?: "sm" | "xs";
  showLabel?: boolean;
  className?: string;
}) {
  const p = toPriority(priority);
  const Icon = PRIORITY_ICON[p];
  return (
    <span
      title={`Prioridade: ${PRIORITY_LABEL[p]}`}
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${PRIORITY_STYLE[p]} ${
        size === "xs" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs"
      } ${className}`}
    >
      <Icon className={size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {showLabel && PRIORITY_LABEL[p]}
    </span>
  );
}
