import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CategoryIcon } from "./CategoryBadge";
import { RoleBadge } from "./RoleBadge";
import { ProjectChip } from "./ProjectChip";
import {
  GripVertical, Repeat, AlertCircle, Clock, Play, Pause, Square, Timer,
  CalendarClock, Copy, Repeat2, ArrowRight, Lock, Check, Circle, ListChecks,
  MoreHorizontal, FolderKanban, UserSquare2, AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown,
} from "lucide-react";
import { TaskCompleteButton } from "./TaskCompleteButton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { formatMinutes, formatShort, toISODate, todayISO, addDays } from "@/lib/date";
import { formatTimer } from "@/hooks/useActiveTimer";
import type { Task, TaskStatus } from "@/hooks/useTasks";
import type { Role } from "@/hooks/useRoles";
import type { Project } from "@/hooks/useProjects";
import type { TaskColumnDef, TaskColumnKey } from "@/hooks/useTaskColumns";
import { DEFAULT_COLUMNS } from "@/hooks/useTaskColumns";

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "A fazer",
  doing: "Em andamento",
  done: "Concluída",
};
const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: "border-border/60 bg-muted/30 text-muted-foreground",
  doing: "border-primary/40 bg-primary/10 text-primary",
  done: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
};

type Props = {
  task: Task;
  role?: Role | null;
  project?: Project | null;
  onToggle: () => void;
  onEdit: () => void;
  isOverdue?: boolean;
  index?: number;
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
  selected?: boolean;
  onSelectToggle?: () => void;
  subtaskCount?: { total: number; completed: number };
  blockedBy?: string[];
  /** Custom column config (order + visibility). Defaults to all default columns visible. */
  columns?: TaskColumnDef[];
  /** CSS grid-template-columns value matching `columns`. */
  gridTemplate?: string;
};

/**
 * Tabular row presentation for tasks on the Today/Week pages.
 * Columns: [drag][done] Title | Projeto | Papel | Dur | Vencimento | Status | Actions
 */
export function TaskListRow({
  task, role, project, onToggle, onEdit, isOverdue, index,
  isActive, isPaused, liveSeconds,
  onStart, onPause, onResume, onStop,
  onPostpone, onDuplicate, onFollowUp,
  selected, onSelectToggle,
  subtaskCount, blockedBy,
  columns, gridTemplate,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task },
    disabled: !!selected,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const totalSpent = (task.time_spent_seconds ?? 0) + (isActive ? liveSeconds ?? 0 : 0);
  const running = isActive && !isPaused;
  const status = (task.status ?? (task.completed ? "done" : "todo")) as TaskStatus;
  const hasActions = !!(onPostpone || onDuplicate || onFollowUp);

  // Click anywhere on the row toggles selection, unless clicking on interactive elements
  const handleRowClick = (e: React.MouseEvent) => {
    // If clicking on an interactive element or its child, don't toggle
    const target = e.target as HTMLElement;
    if (
      target.closest("button") ||
      target.closest("a") ||
      target.closest("[data-no-select]") ||
      target.closest("[role='dialog']") ||
      target.closest("[data-radix-popper-content-wrapper]")
    ) {
      return;
    }
    onSelectToggle?.();
  };

  const dragProps = selected ? {} : { ...attributes, ...listeners };

  const cols = columns ?? DEFAULT_COLUMNS;
  const visibleCols = cols.filter((c) => c.visible);
  const computedGridTemplate =
    gridTemplate ??
    `1rem 1.75rem ${visibleCols.map((c) => `minmax(${c.minPx}px, ${c.width})`).join(" ")} 2.25rem`;

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, gridTemplateColumns: computedGridTemplate }}
      data-task-card="true"
      onClick={handleRowClick}
      className={`group relative flex flex-wrap items-center gap-2 md:gap-3 md:grid rounded-xl border bg-card/80 backdrop-blur-sm shadow-[var(--shadow-card)] transition-all touch-none cursor-pointer
        px-3 py-2
        ${task.completed ? "bg-muted/30 border-border/40 opacity-70" : ""}
        ${isOverdue && !task.completed ? "border-overdue/40" : "border-border/60"}
        ${(task as any).non_negotiable && !task.completed ? "border-l-4 border-l-overdue pl-2" : ""}
        ${isActive && !task.completed
          ? running
            ? "border-primary/70 ring-2 ring-primary/40 shadow-[var(--shadow-glow)]"
            : "border-circumstantial/60 ring-1 ring-circumstantial/30"
          : ""}
        ${selected ? "border-primary ring-2 ring-primary/50 bg-primary/5" : ""}
      `}
    >
      {/* Drag handle */}
      <span
        {...dragProps}
        onClick={(e) => e.stopPropagation()}
        className={`text-muted-foreground/40 group-hover:text-muted-foreground/80 ${
          selected ? "" : "cursor-grab active:cursor-grabbing"
        }`}
        aria-label="Reordenar"
      >
        <GripVertical className="h-4 w-4" />
      </span>

      {/* Complete — Notion/Linear style rounded square */}
      <TaskCompleteButton completed={!!task.completed} onToggle={onToggle} />


      {/* Dynamic cells rendered in order configured by `columns` */}
      {visibleCols.map((col) => {
        switch (col.key) {
          case "title":
            return (
              <div key="title" className="min-w-0 flex-1 basis-full md:basis-auto md:flex-none" data-no-select="true">
                <div className="flex items-center gap-1.5">
                  {typeof index === "number" && (
                    <span
                      className={`inline-flex h-4 min-w-4 items-center justify-center rounded border border-border/60 bg-muted/40 px-1 text-[10px] font-semibold tabular-nums text-muted-foreground ${
                        task.completed ? "line-through" : ""
                      }`}
                      aria-label={`Posição ${index}`}
                    >
                      {index}
                    </span>
                  )}
                  <CategoryIcon category={task.category} className="h-3 w-3 shrink-0" />
                  {(task as any).non_negotiable && !task.completed && (
                    <Lock className="h-3 w-3 text-overdue shrink-0" aria-label="Inegociável hoje" />
                  )}
                  <div
                    className={`min-w-0 flex-1 text-sm font-medium leading-snug ${
                      task.completed ? "line-through text-muted-foreground" : ""
                    }`}
                  >
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); onEdit(); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onEdit(); } }}
                      className="inline cursor-pointer hover:underline decoration-from-font underline-offset-2 break-words [overflow-wrap:anywhere]"
                    >
                      {task.title}
                    </span>
                  </div>
                </div>
                {(totalSpent > 0 || (subtaskCount && subtaskCount.total > 0)
                  || task.recurrence !== "none" || task.recurrence_parent_id
                  || (blockedBy && blockedBy.length > 0)
                  || (task.followup_count ?? 0) > 1
                  || (task.postpone_count ?? 0) >= 3
                  || (task as any).origin_source) && (
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                    {totalSpent > 0 && (
                      <span
                        className={`inline-flex items-center gap-1 ${
                          running ? "text-primary font-medium" : isPaused && isActive ? "text-circumstantial font-medium" : ""
                        }`}
                        title="Tempo trabalhado"
                      >
                        <Timer className="h-3 w-3" /> {formatTimer(totalSpent)}
                      </span>
                    )}
                    {subtaskCount && subtaskCount.total > 0 && (
                      <span
                        className={`inline-flex items-center gap-1 ${
                          subtaskCount.completed === subtaskCount.total ? "text-green-500" : ""
                        }`}
                        title={`${subtaskCount.completed} de ${subtaskCount.total} subtarefas concluídas`}
                      >
                        <ListChecks className="h-3 w-3" /> {subtaskCount.completed}/{subtaskCount.total}
                      </span>
                    )}
                    {(task.recurrence !== "none" || task.recurrence_parent_id) && (
                      <span className="inline-flex items-center gap-1" title="Recorrente">
                        <Repeat className="h-3 w-3" />
                      </span>
                    )}
                    {(task.followup_count ?? 0) > 1 && (
                      <span className="inline-flex items-center gap-1 text-circumstantial" title={`Follow-up #${task.followup_count}`}>
                        <Repeat2 className="h-3 w-3" /> #{task.followup_count}
                      </span>
                    )}
                    {blockedBy && blockedBy.length > 0 && !task.completed && (
                      <span
                        className="inline-flex items-center gap-1 text-amber-600"
                        title={`Aguardando: ${blockedBy.join(", ")}`}
                      >
                        <Lock className="h-3 w-3" /> Bloqueada
                      </span>
                    )}
                    {(task.postpone_count ?? 0) >= 3 && !task.completed && (
                      <span className="inline-flex items-center gap-1 text-overdue" title={`Adiada ${task.postpone_count} vezes`}>
                        <AlertCircle className="h-3 w-3" /> {task.postpone_count}× adiada
                      </span>
                    )}
                    {(task as any).origin_source && (() => {
                      const src = (task as any).origin_source as "email" | "meeting" | "pipedrive";
                      const url = (task as any).origin_source_url as string | null;
                      const label = (task as any).origin_source_label as string | null;
                      const meta =
                        src === "email"
                          ? { l: "Outlook", c: "text-blue-600" }
                          : src === "meeting"
                          ? { l: "Fireflies", c: "text-purple-600" }
                          : { l: "Pipedrive", c: "text-emerald-600" };
                      const inner = <span className={meta.c}>{meta.l}</span>;
                      return url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          title={label ?? meta.l}
                        >
                          {inner}
                        </a>
                      ) : (
                        <span title={label ?? meta.l}>{inner}</span>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          case "project":
            return (
              <div key="project" className="min-w-0">
                {project ? (
                  <ProjectChip project={project} size="xs" />
                ) : (
                  <span className="text-[11px] text-muted-foreground/60">—</span>
                )}
              </div>
            );
          case "role":
            return (
              <div key="role" className="min-w-0">
                {role ? (
                  <RoleBadge role={role} size="xs" />
                ) : (
                  <span className="text-[11px] text-muted-foreground/60">—</span>
                )}
              </div>
            );
          case "duration":
            return (
              <div key="duration" className="text-xs text-muted-foreground tabular-nums">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {formatMinutes(task.duration_minutes)}
                </span>
              </div>
            );
          case "due":
            return (
              <div key="due" className="min-w-0">
                <span
                  className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] tabular-nums ${
                    isOverdue && !task.completed
                      ? "border-overdue/40 bg-overdue/10 text-overdue"
                      : "border-border/60 bg-muted/30 text-muted-foreground"
                  }`}
                  title={task.scheduled_date}
                >
                  {isOverdue && !task.completed && <AlertCircle className="h-3 w-3" />}
                  {formatShort(task.scheduled_date)}
                </span>
              </div>
            );
          case "status":
            return (
              <div key="status" className="min-w-0">
                <span className={`inline-flex w-full items-center justify-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${STATUS_COLOR[status]}`}>
                  {STATUS_LABEL[status]}
                </span>
              </div>
            );
          default:
            return null;
        }
      })}

      {/* Actions: timer + quick-actions popover */}
      <div
        className="flex items-center justify-end gap-0.5"
        data-no-select="true"
      >
        {!task.completed && (onStart || onPause || onStop) && (
          <>
            {!isActive ? (
              <button
                onClick={(e) => { e.stopPropagation(); onStart?.(); }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary hover:bg-primary/25"
                aria-label="Iniciar"
                title="Iniciar"
              >
                <Play className="h-3 w-3 fill-current" />
              </button>
            ) : running ? (
              <button
                onClick={(e) => { e.stopPropagation(); onPause?.(); }}
                className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-1.5 text-[10px] font-medium text-primary-foreground hover:opacity-90"
                aria-label="Pausar"
                title="Pausar"
              >
                <Pause className="h-3 w-3 fill-current" />
                <span className="tabular-nums">{formatTimer(liveSeconds ?? 0)}</span>
              </button>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); onResume?.(); }}
                className="inline-flex h-7 items-center gap-1 rounded-md bg-circumstantial/20 px-1.5 text-[10px] font-medium text-circumstantial hover:bg-circumstantial/30"
                aria-label="Retomar"
                title="Retomar"
              >
                <Play className="h-3 w-3 fill-current" />
                <span className="tabular-nums">{formatTimer(liveSeconds ?? 0)}</span>
              </button>
            )}
            {isActive && (
              <button
                onClick={(e) => { e.stopPropagation(); onStop?.(); }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-card text-muted-foreground hover:border-destructive/50 hover:text-destructive"
                aria-label="Parar"
                title="Parar e zerar"
              >
                <Square className="h-3 w-3 fill-current" />
              </button>
            )}
          </>
        )}
        {!task.completed && hasActions && (
          <QuickActionsMenu
            task={task}
            onPostpone={onPostpone}
            onDuplicate={onDuplicate}
            onFollowUp={onFollowUp}
          />
        )}
      </div>
    </div>
  );
}

export type TaskSortKey = "position" | "title" | "project" | "role" | "duration" | "due" | "status";
export type TaskSortDir = "asc" | "desc";

/** Header row matching TaskListRow's grid template. */
export function TaskListHeader({
  sortKey,
  sortDir,
  onSort,
  columns,
  gridTemplate,
  onResizeColumn,
  onReorderColumn,
}: {
  sortKey?: TaskSortKey | null;
  sortDir?: TaskSortDir;
  onSort?: (key: TaskSortKey) => void;
  columns?: TaskColumnDef[];
  gridTemplate?: string;
  /** Called with new width in pixels (use `${px}px`) while user drags the resize handle. */
  onResizeColumn?: (key: TaskColumnKey, newWidthPx: number) => void;
  /** Drag column `from` onto column `to` to swap positions. */
  onReorderColumn?: (from: TaskColumnKey, to: TaskColumnKey) => void;
}) {
  const cols = columns ?? DEFAULT_COLUMNS;
  const visibleCols = cols.filter((c) => c.visible);
  const computedGridTemplate =
    gridTemplate ??
    `1rem 1.75rem ${visibleCols.map((c) => `minmax(${c.minPx}px, ${c.width})`).join(" ")} 2.25rem`;

  const SortBtn = ({ k, label, align = "left" }: { k: TaskSortKey; label: string; align?: "left" | "center" }) => {
    const active = sortKey === k;
    if (!onSort) {
      return <span className={align === "center" ? "text-center" : ""}>{label}</span>;
    }
    return (
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${
          align === "center" ? "justify-center" : ""
        } ${active ? "text-foreground" : ""}`}
        aria-label={`Ordenar por ${label}`}
      >
        <span>{label}</span>
        {active ? (
          sortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    );
  };

  const handleResizeStart = (key: TaskColumnKey) => (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!onResizeColumn) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget;
    const cell = target.parentElement;
    if (!cell) return;
    const startX = e.clientX;
    const startWidth = cell.getBoundingClientRect().width;
    const col = cols.find((c) => c.key === key);
    const minPx = col?.minPx ?? 60;
    target.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const next = Math.max(minPx, startWidth + (ev.clientX - startX));
      onResizeColumn(key, next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const handleDragStart = (key: TaskColumnKey) => (e: React.DragEvent<HTMLDivElement>) => {
    if (!onReorderColumn) return;
    e.dataTransfer.setData("text/x-column-key", key);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!onReorderColumn) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const handleDrop = (toKey: TaskColumnKey) => (e: React.DragEvent<HTMLDivElement>) => {
    if (!onReorderColumn) return;
    e.preventDefault();
    const fromKey = e.dataTransfer.getData("text/x-column-key") as TaskColumnKey;
    if (fromKey && fromKey !== toKey) onReorderColumn(fromKey, toKey);
  };

  return (
    <div
      className="hidden md:grid items-center gap-3 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/40"
      style={{ gridTemplateColumns: computedGridTemplate }}
    >
      <span aria-hidden="true" />
      {onSort ? (
        <button
          type="button"
          onClick={() => onSort("position")}
          className={`inline-flex items-center justify-center gap-0.5 hover:text-foreground transition-colors ${sortKey === "position" ? "text-foreground" : ""}`}
          aria-label="Ordenar por #"
        >
          <span>#</span>
          {sortKey === "position" ? (
            sortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />
          ) : null}
        </button>
      ) : (
        <span className="text-center">#</span>
      )}
      {visibleCols.map((col) => (
        <div
          key={col.key}
          className="relative flex items-center pr-2"
          draggable={!!onReorderColumn}
          onDragStart={handleDragStart(col.key)}
          onDragOver={handleDragOver}
          onDrop={handleDrop(col.key)}
          title={onReorderColumn ? "Arraste para reordenar" : undefined}
        >
          <SortBtn k={col.key} label={col.label} align={col.key === "status" ? "center" : "left"} />
          {onResizeColumn && (
            <span
              onPointerDown={handleResizeStart(col.key)}
              className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none touch-none hover:bg-primary/40 active:bg-primary/60 transition-colors"
              aria-label={`Redimensionar coluna ${col.label}`}
              role="separator"
            />
          )}
        </div>
      ))}
      <span />
    </div>
  );
}

function QuickActionsMenu({
  task,
  onPostpone,
  onDuplicate,
  onFollowUp,
}: {
  task: Task;
  onPostpone?: (date: string) => void;
  onDuplicate?: (date: string) => void;
  onFollowUp?: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<null | "postpone" | "duplicate" | "followup">(null);
  const today = todayISO();
  const tomorrow = addDays(today, 1);
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
    setOpen(false);
  };

  const isToday = task.scheduled_date === today;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
            aria-label="Mais ações"
            title="Mais ações"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-44 p-1">
          {onPostpone && !isToday && (
            <MenuItem icon={<ArrowRight className="h-3.5 w-3.5" />} onClick={() => { onPostpone(today); setOpen(false); }}>
              Mover para hoje
            </MenuItem>
          )}
          {onPostpone && (
            <MenuItem icon={<CalendarClock className="h-3.5 w-3.5" />} onClick={() => setPickerMode("postpone")}>
              Mover para…
            </MenuItem>
          )}
          {onDuplicate && (
            <MenuItem icon={<Copy className="h-3.5 w-3.5" />} onClick={() => setPickerMode("duplicate")}>
              Duplicar em…
            </MenuItem>
          )}
          {onFollowUp && (
            <MenuItem icon={<Repeat2 className="h-3.5 w-3.5" />} onClick={() => setPickerMode("followup")}>
              Follow-up em…
            </MenuItem>
          )}
        </PopoverContent>
      </Popover>

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
    </>
  );
}

function MenuItem({ icon, children, onClick }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent/60"
    >
      <span className="text-muted-foreground">{icon}</span>
      {children}
    </button>
  );
}
