import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Checkbox } from "@/components/ui/checkbox";
import { CategoryIcon } from "./CategoryBadge";
import { RoleBadge } from "./RoleBadge";
import { GripVertical, Repeat, AlertCircle, Clock, Play, Square, Timer } from "lucide-react";
import { formatMinutes } from "@/lib/date";
import { formatTimer } from "@/hooks/useActiveTimer";
import type { Task } from "@/hooks/useTasks";
import type { Role } from "@/hooks/useRoles";

type Props = {
  task: Task;
  role?: Role | null;
  onToggle: () => void;
  onEdit: () => void;
  isOverdue?: boolean;
  compact?: boolean;
  // Timer
  isActive?: boolean;
  liveSeconds?: number;
  onStart?: () => void;
  onStop?: () => void;
};

export function TaskCard({
  task,
  role,
  onToggle,
  onEdit,
  isOverdue,
  compact,
  isActive,
  liveSeconds,
  onStart,
  onStop,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const totalSpent = (task.time_spent_seconds ?? 0) + (isActive ? liveSeconds ?? 0 : 0);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex items-start gap-2 rounded-xl border bg-card/80 backdrop-blur-sm p-3 shadow-[var(--shadow-card)] transition-all hover:border-primary/40 ${
        isOverdue ? "border-overdue/40" : ""
      } ${isActive ? "border-primary/60 ring-1 ring-primary/30" : ""} ${
        task.completed ? "opacity-60" : ""
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="mt-1 cursor-grab text-muted-foreground/50 hover:text-foreground active:cursor-grabbing"
        aria-label="Arrastar"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <Checkbox checked={task.completed} onCheckedChange={onToggle} className="mt-1" />

      <button onClick={onEdit} className="flex-1 text-left min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <CategoryIcon category={task.category} className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
          <span
            className={`font-medium leading-tight ${task.completed ? "line-through" : ""} ${
              compact ? "text-xs" : "text-sm"
            }`}
          >
            {task.title}
          </span>
          {role && <RoleBadge role={role} size="xs" />}
        </div>
        {!compact && task.description && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{task.description}</p>
        )}
        <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> {formatMinutes(task.duration_minutes)}
          </span>
          {totalSpent > 0 && (
            <span
              className={`inline-flex items-center gap-1 ${
                isActive ? "text-primary font-medium" : ""
              }`}
            >
              <Timer className="h-3 w-3" /> {formatTimer(totalSpent)}
            </span>
          )}
          {(task.recurrence !== "none" || task.recurrence_parent_id) && (
            <span className="inline-flex items-center gap-1">
              <Repeat className="h-3 w-3" />
            </span>
          )}
          {isOverdue && (
            <span className="inline-flex items-center gap-1 text-overdue font-medium">
              <AlertCircle className="h-3 w-3" /> Atrasada
            </span>
          )}
        </div>
      </button>

      {!compact && !task.completed && (onStart || onStop) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isActive) onStop?.();
            else onStart?.();
          }}
          className={`mt-0.5 inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium transition-colors ${
            isActive
              ? "bg-primary text-primary-foreground hover:opacity-90"
              : "bg-primary/15 text-primary hover:bg-primary/25"
          }`}
          aria-label={isActive ? "Parar cronômetro" : "Iniciar tarefa"}
        >
          {isActive ? <Square className="h-3 w-3 fill-current" /> : <Play className="h-3 w-3 fill-current" />}
          <span className="tabular-nums">
            {isActive ? formatTimer(liveSeconds ?? 0) : "Iniciar"}
          </span>
        </button>
      )}
    </div>
  );
}
