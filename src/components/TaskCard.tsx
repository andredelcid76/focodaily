import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Checkbox } from "@/components/ui/checkbox";
import { CategoryIcon } from "./CategoryBadge";
import { RoleBadge } from "./RoleBadge";
import {
  GripVertical, Repeat, AlertCircle, Clock, Play, Pause, Square, Timer,
  MoreVertical, CalendarPlus, CalendarClock, Copy, Repeat2, ArrowRight,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { formatMinutes, toISODate, todayISO, addDays } from "@/lib/date";
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
  index?: number; // 1-based ordering number
  // Timer
  isActive?: boolean;
  isPaused?: boolean;
  liveSeconds?: number;
  onStart?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  // Quick actions
  onPostpone?: (date: string) => void;
  onDuplicate?: (date: string) => void;
  onFollowUp?: (date: string) => void;
};

export function TaskCard({
  task,
  role,
  onToggle,
  onEdit,
  isOverdue,
  compact,
  index,
  isActive,
  isPaused,
  liveSeconds,
  onStart,
  onPause,
  onResume,
  onStop,
  onPostpone,
  onDuplicate,
  onFollowUp,
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
  const running = isActive && !isPaused;

  const today = todayISO();
  const tomorrow = addDays(today, 1);
  const hasActions = !!(onPostpone || onDuplicate || onFollowUp);
  const followupNumber = task.followup_count ?? 0;

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

      {typeof index === "number" && (
        <span
          className={`mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-border/60 bg-muted/40 px-1 text-[10px] font-semibold tabular-nums text-muted-foreground ${
            task.completed ? "line-through" : ""
          }`}
          aria-label={`Posição ${index}`}
        >
          {index}
        </span>
      )}

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
          {followupNumber > 1 && (
            <span
              className="inline-flex items-center gap-1 rounded-md border border-circumstantial/40 bg-circumstantial/10 px-1.5 py-0.5 text-[10px] font-semibold text-circumstantial"
              title={`Follow-up #${followupNumber}`}
            >
              <Repeat2 className="h-2.5 w-2.5" /> #{followupNumber}
            </span>
          )}
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
                running ? "text-primary font-medium" : isPaused && isActive ? "text-circumstantial font-medium" : ""
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

      {!compact && !task.completed && (onStart || onPause || onStop) && (
        <div className="flex items-center gap-1 mt-0.5" onClick={(e) => e.stopPropagation()}>
          {!isActive ? (
            <button
              onClick={(e) => { e.stopPropagation(); onStart?.(); }}
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary/15 px-2.5 text-xs font-medium text-primary hover:bg-primary/25"
              aria-label="Iniciar tarefa"
            >
              <Play className="h-3 w-3 fill-current" />
              <span>Iniciar</span>
            </button>
          ) : (
            <>
              {running ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onPause?.(); }}
                  className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                  aria-label="Pausar"
                  title="Pausar"
                >
                  <Pause className="h-3 w-3 fill-current" />
                  <span className="tabular-nums">{formatTimer(liveSeconds ?? 0)}</span>
                </button>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); onResume?.(); }}
                  className="inline-flex h-8 items-center gap-1 rounded-lg bg-circumstantial/20 px-2.5 text-xs font-medium text-circumstantial hover:bg-circumstantial/30"
                  aria-label="Retomar"
                  title="Retomar"
                >
                  <Play className="h-3 w-3 fill-current" />
                  <span className="tabular-nums">{formatTimer(liveSeconds ?? 0)}</span>
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onStop?.(); }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-card text-muted-foreground hover:border-destructive/50 hover:text-destructive"
                aria-label="Parar e zerar"
                title="Parar e zerar"
              >
                <Square className="h-3 w-3 fill-current" />
              </button>
            </>
          )}
        </div>
      )}

      {hasActions && !task.completed && (
        <TaskActionsMenu
          task={task}
          today={today}
          tomorrow={tomorrow}
          onPostpone={onPostpone}
          onDuplicate={onDuplicate}
          onFollowUp={onFollowUp}
        />
      )}
    </div>
  );
}

function TaskActionsMenu({
  task,
  today,
  tomorrow,
  onPostpone,
  onDuplicate,
  onFollowUp,
}: {
  task: Task;
  today: string;
  tomorrow: string;
  onPostpone?: (date: string) => void;
  onDuplicate?: (date: string) => void;
  onFollowUp?: (date: string) => void;
}) {
  const [pickerMode, setPickerMode] = useState<null | "postpone" | "duplicate" | "followup">(null);
  const [pickerDate, setPickerDate] = useState<Date>(() => {
    const [y, m, d] = tomorrow.split("-").map(Number);
    return new Date(y, m - 1, d);
  });

  const closePicker = () => setPickerMode(null);
  const confirmPicker = () => {
    const iso = toISODate(pickerDate);
    if (pickerMode === "postpone") onPostpone?.(iso);
    else if (pickerMode === "duplicate") onDuplicate?.(iso);
    else if (pickerMode === "followup") onFollowUp?.(iso);
    closePicker();
  };

  const isToday = task.scheduled_date === today;

  return (
    <div onClick={(e) => e.stopPropagation()} className="mt-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
            aria-label="Mais ações"
            title="Mais ações"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {onPostpone && !isToday && (
            <DropdownMenuItem onClick={() => onPostpone(today)}>
              <ArrowRight className="mr-2 h-4 w-4" /> Mover para hoje
            </DropdownMenuItem>
          )}
          {onPostpone && (
            <DropdownMenuItem onClick={() => onPostpone(tomorrow)}>
              <CalendarPlus className="mr-2 h-4 w-4" /> Mover para amanhã
            </DropdownMenuItem>
          )}
          {onPostpone && (
            <DropdownMenuItem onClick={() => setPickerMode("postpone")}>
              <CalendarClock className="mr-2 h-4 w-4" /> Mover para data…
            </DropdownMenuItem>
          )}
          {(onDuplicate || onFollowUp) && <DropdownMenuSeparator />}
          {onDuplicate && (
            <DropdownMenuItem onClick={() => setPickerMode("duplicate")}>
              <Copy className="mr-2 h-4 w-4" /> Duplicar para…
            </DropdownMenuItem>
          )}
          {onFollowUp && (
            <DropdownMenuItem onClick={() => setPickerMode("followup")}>
              <Repeat2 className="mr-2 h-4 w-4" /> Follow-up…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={pickerMode !== null} onOpenChange={(o: boolean) => !o && closePicker()}>
        <DialogContent className="w-auto max-w-[20rem] p-0">
          <DialogHeader className="border-b border-border/60 p-3">
            <DialogTitle className="text-sm">
              {pickerMode === "postpone" && "Mover para…"}
              {pickerMode === "duplicate" && "Duplicar em…"}
              {pickerMode === "followup" && "Follow-up em…"}
            </DialogTitle>
          </DialogHeader>
          <Calendar
            mode="single"
            selected={pickerDate}
            onSelect={(d) => d && setPickerDate(d)}
            initialFocus
            className="p-3 pointer-events-auto"
          />
          <div className="flex justify-end gap-2 border-t border-border/60 p-2">
            <button
              onClick={closePicker}
              className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent/40"
            >
              Cancelar
            </button>
            <button
              onClick={confirmPicker}
              className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              Confirmar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
