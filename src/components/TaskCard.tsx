import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Checkbox } from "@/components/ui/checkbox";
import { CategoryDot } from "./CategoryBadge";
import { GripVertical, Repeat, AlertCircle, Clock } from "lucide-react";
import { formatMinutes } from "@/lib/date";
import type { Task } from "@/hooks/useTasks";

type Props = {
  task: Task;
  onToggle: () => void;
  onEdit: () => void;
  isOverdue?: boolean;
  compact?: boolean;
};

export function TaskCard({ task, onToggle, onEdit, isOverdue, compact }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex items-start gap-2 rounded-xl border bg-card/80 backdrop-blur-sm p-3 shadow-[var(--shadow-card)] transition-all hover:border-primary/40 ${
        isOverdue ? "border-overdue/40" : ""
      } ${task.completed ? "opacity-60" : ""}`}
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
          <CategoryDot category={task.category} />
          <span className={`font-medium leading-tight ${task.completed ? "line-through" : ""} ${compact ? "text-xs" : "text-sm"}`}>
            {task.title}
          </span>
        </div>
        {!compact && task.description && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{task.description}</p>
        )}
        <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> {formatMinutes(task.duration_minutes)}
          </span>
          {(task.recurrence !== "none" || task.recurrence_parent_id) && (
            <span className="inline-flex items-center gap-1"><Repeat className="h-3 w-3" /></span>
          )}
          {isOverdue && (
            <span className="inline-flex items-center gap-1 text-overdue font-medium">
              <AlertCircle className="h-3 w-3" /> Atrasada
            </span>
          )}
        </div>
      </button>
    </div>
  );
}
