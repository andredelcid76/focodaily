import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Checkbox } from "@/components/ui/checkbox";
import { CategoryIcon } from "./CategoryBadge";
import { RoleBadge } from "./RoleBadge";
import {
  GripVertical, Repeat, AlertCircle, Clock, Play, Pause, Square, Timer,
  CalendarClock, Copy, Repeat2, ArrowRight, Lock, CheckCircle2, Circle,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { formatMinutes, toISODate, todayISO, addDays } from "@/lib/date";
import { formatTimer } from "@/hooks/useActiveTimer";
import type { Task } from "@/hooks/useTasks";
import type { Role } from "@/hooks/useRoles";
import type { Project } from "@/hooks/useProjects";
import { ProjectChip } from "./ProjectChip";

type Props = {
  task: Task;
  role?: Role | null;
  project?: Project | null;
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
  // Bulk selection
  selectionMode?: boolean;
  selected?: boolean;
  onSelectToggle?: () => void;
};

export function TaskCard({
  task,
  role,
  project,
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
  selectionMode,
  selected,
  onSelectToggle,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task },
    disabled: selectionMode,
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
      {...attributes}
      {...listeners}
      onClick={(e) => {
        // Click on card body (not title, not buttons) toggles selection
        e.stopPropagation();
        onSelectToggle?.();
      }}
      className={`group relative flex items-start gap-2 rounded-xl border backdrop-blur-sm p-3 shadow-[var(--shadow-card)] transition-all touch-none ${
        selectionMode
          ? "cursor-pointer"
          : "cursor-grab active:cursor-grabbing hover:border-primary/40"
      } ${
        task.completed
          ? "bg-muted/30 border-border/40 opacity-70"
          : "bg-card/80"
      } ${isOverdue && !task.completed ? "border-overdue/40" : ""} ${
        (task as any).non_negotiable && !task.completed
          ? "border-l-4 border-l-overdue"
          : ""
      } ${
        isActive && !task.completed
          ? running
            ? "border-primary/70 ring-2 ring-primary/40 shadow-[var(--shadow-glow)]"
            : "border-circumstantial/60 ring-1 ring-circumstantial/30"
          : ""
      } ${selected ? "border-primary ring-2 ring-primary/50 bg-primary/5" : ""}`}
    >
      <span
        className="mt-1 text-muted-foreground/40 group-hover:text-muted-foreground/70 pointer-events-none"
        aria-hidden="true"
      >
        <GripVertical className="h-4 w-4" />
      </span>

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

      {/* Selection checkbox – only visible in selection mode */}
      {selectionMode && (
        <Checkbox
          checked={!!selected}
          onPointerDown={(e) => e.stopPropagation()}
          onCheckedChange={() => onSelectToggle?.()}
          onClick={(e) => e.stopPropagation()}
          className="mt-1"
          aria-label="Selecionar tarefa"
        />
      )}

      {/* Complete button – always visible, distinct green circle-check */}
      {!selectionMode && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={`mt-0.5 flex-shrink-0 rounded-full transition-colors ${
            task.completed
              ? "text-green-500 hover:text-green-400"
              : "text-muted-foreground/40 hover:text-green-500"
          }`}
          aria-label="Concluir tarefa"
          title={task.completed ? "Desmarcar conclusão" : "Concluir tarefa"}
        >
          {task.completed ? (
            <CheckCircle2 className="h-5 w-5 fill-green-500/20" />
          ) : (
            <Circle className="h-5 w-5" />
          )}
        </button>
      )}


      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-1.5 flex-wrap">
            <CategoryIcon category={task.category} className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
            {(task as any).non_negotiable && !task.completed && (
              <Lock className="h-3 w-3 text-overdue" aria-label="Inegociável hoje" />
            )}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className={`max-w-full text-left font-medium leading-tight hover:underline ${task.completed ? "line-through" : ""} ${
                compact ? "text-xs" : "text-sm"
              }`}
            >
              <span className="block truncate">{task.title}</span>
            </button>
            {role && <RoleBadge role={role} size="xs" />}
            {project && <ProjectChip project={project} size="xs" />}
            {followupNumber > 1 && (
              <span
                className="inline-flex items-center gap-1 rounded-md border border-circumstantial/40 bg-circumstantial/10 px-1.5 py-0.5 text-[10px] font-semibold text-circumstantial"
                title={`Follow-up #${followupNumber}`}
              >
                <Repeat2 className="h-2.5 w-2.5" /> #{followupNumber}
              </span>
            )}
            {(task.postpone_count ?? 0) >= 3 && !task.completed && (
              <span
                className="inline-flex items-center gap-1 rounded-md border border-overdue/40 bg-overdue/10 px-1.5 py-0.5 text-[10px] font-semibold text-overdue"
                title={`Adiada ${task.postpone_count} vezes`}
              >
                <AlertCircle className="h-2.5 w-2.5" /> {task.postpone_count}× adiada
              </span>
            )}
            {(() => {
              if (task.completed || !task.planned_date) return null;
              const planned = new Date(task.planned_date + "T00:00:00").getTime();
              const sched = new Date(task.scheduled_date + "T00:00:00").getTime();
              const days = Math.round((sched - planned) / 86400000);
              if (days >= 7) {
                return (
                  <span
                    className="inline-flex items-center gap-1 rounded-md border border-overdue/40 bg-overdue/10 px-1.5 py-0.5 text-[10px] font-semibold text-overdue"
                    title={`${days} dias atrás da data prevista (${task.planned_date})`}
                  >
                    <AlertCircle className="h-2.5 w-2.5" /> +{days}d
                  </span>
                );
              }
              return null;
            })()}
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
      </div>

      {!compact && !task.completed && (
        <div
          className="flex items-center gap-1 mt-0.5"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {(onStart || onPause || onStop) && (
            <>
              {!isActive ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onStart?.(); }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary hover:bg-primary/25"
                  aria-label="Iniciar tarefa"
                  title="Iniciar"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : (
                <>
                  {running ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); onPause?.(); }}
                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-2 text-xs font-medium text-primary-foreground hover:opacity-90"
                      aria-label="Pausar"
                      title="Pausar"
                    >
                      <Pause className="h-3 w-3 fill-current" />
                      <span className="tabular-nums">{formatTimer(liveSeconds ?? 0)}</span>
                    </button>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); onResume?.(); }}
                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-circumstantial/20 px-2 text-xs font-medium text-circumstantial hover:bg-circumstantial/30"
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
            </>
          )}

          {hasActions && (
            <InlineQuickActions
              task={task}
              today={today}
              tomorrow={tomorrow}
              onPostpone={onPostpone}
              onDuplicate={onDuplicate}
              onFollowUp={onFollowUp}
            />
          )}
        </div>
      )}
    </div>
  );
}

function InlineQuickActions({
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
    <div className="flex items-center gap-1">
      {onPostpone && !isToday && (
        <button
          onClick={(e) => { e.stopPropagation(); onPostpone(today); }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
          aria-label="Mover para hoje"
          title="Mover para hoje"
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
      {onPostpone && (
        <button
          onClick={(e) => { e.stopPropagation(); setPickerMode("postpone"); }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
          aria-label="Mover para data"
          title="Mover para data…"
        >
          <CalendarClock className="h-3.5 w-3.5" />
        </button>
      )}
      {onDuplicate && (
        <button
          onClick={(e) => { e.stopPropagation(); setPickerMode("duplicate"); }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
          aria-label="Duplicar"
          title="Duplicar para…"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      )}
      {onFollowUp && (
        <button
          onClick={(e) => { e.stopPropagation(); setPickerMode("followup"); }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-card text-muted-foreground hover:border-circumstantial/50 hover:text-circumstantial"
          aria-label="Follow-up"
          title="Follow-up…"
        >
          <Repeat2 className="h-3.5 w-3.5" />
        </button>
      )}

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
