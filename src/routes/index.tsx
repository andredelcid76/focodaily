import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useTasks, type Task, type TaskCategory } from "@/hooks/useTasks";
import { useRoles } from "@/hooks/useRoles";
import { useProjects } from "@/hooks/useProjects";
import { useActiveTimer } from "@/hooks/useActiveTimer";
import { TaskCard } from "@/components/TaskCard";
import { useSubtaskCounts } from "@/hooks/useSubtaskCounts";

import { TaskDialog, type RecurrenceScope } from "@/components/TaskDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategoryIcon } from "@/components/CategoryBadge";
import { DatePickerField } from "@/components/DatePickerField";
import { TaskFiltersBar, applyTaskFilters, emptyFilters, type TaskFilters } from "@/components/TaskFiltersBar";
import { Switch } from "@/components/ui/switch";
import { useMeetings, meetingDurationMinutes } from "@/hooks/useMeetings";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import {
  Plus,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Zap,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  X,
  Trash2,
  CalendarPlus,
  Folder,
  UserSquare2,
  Lock,
  Search,
  LayoutGrid,
  List as ListIcon,
  KanbanSquare,
  ListPlus,
} from "lucide-react";
import { BulkTaskDialog } from "@/components/BulkTaskDialog";
import { MeetingsRail } from "@/components/MeetingsRail";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable,
  useDraggable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { todayISO, toISODate, addDays, formatHuman, formatMinutes } from "@/lib/date";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  component: () => (
    <AppShell>
      <TodayPage />
    </AppShell>
  ),
});

function TodayPage() {
  const { user } = useAuth();
  if (!user) return null;
  return <TodayInner userId={user.id} />;
}

function TodayInner({ userId }: { userId: string }) {
  const today = todayISO();
  const [viewDate, setViewDate] = useState(today);
  const [includeMeetings, setIncludeMeetings] = useState(true);
  const tasksApi = useTasks(userId);
  const { roles } = useRoles(userId);
  const subtaskCounts = useSubtaskCounts(userId);
  const { projects } = useProjects(userId);
  const meetingsApi = useMeetings(userId);
  const timer = useActiveTimer();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionActive, setSelectionActive] = useState(false);
  const [bulkPickerOpen, setBulkPickerOpen] = useState(false);
  const [bulkPickerDate, setBulkPickerDate] = useState<Date>(() => new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<TaskFilters>(() => emptyFilters());
  const [taskView, setTaskView] = useState<"list" | "cards" | "kanban">(() => {
    if (typeof window === "undefined") return "list";
    const v = window.localStorage.getItem("focodaily.taskView");
    return v === "cards" || v === "kanban" ? v : "list";
  });
  const changeTaskView = (v: "list" | "cards" | "kanban") => {
    setTaskView(v);
    if (typeof window !== "undefined") window.localStorage.setItem("focodaily.taskView", v);
  };
  const [showCompleted, setShowCompleted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("focodaily.showCompleted") === "1";
  });
  const toggleShowCompleted = () => {
    setShowCompleted((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("focodaily.showCompleted", next ? "1" : "0");
      }
      return next;
    });
  };
  const selectionMode = selectionActive || selectedIds.size > 0;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectionActive(false);
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 180, tolerance: 6 } }));

  const rolesById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const isViewingToday = viewDate === today;
  const dayTasks = useMemo(() => {
    const base = tasksApi.tasksByDay(viewDate).slice();
    // When viewing today, also include tasks scheduled for the future that were COMPLETED today.
    if (isViewingToday) {
      const completedTodayFromFuture = tasksApi.tasks.filter((t) => {
        if (!t.completed || !t.completed_at) return false;
        if (t.scheduled_date <= today) return false; // already in base or in past
        return t.completed_at.slice(0, 10) === today;
      });
      base.push(...completedTodayFromFuture);
    }
    return base.sort((a, b) => {
      // Completed tasks always go to the bottom
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return a.position - b.position;
    });
  }, [tasksApi, viewDate, isViewingToday, today]);
  const dayMeetings = useMemo(() => meetingsApi.meetingsByDay(viewDate), [meetingsApi, viewDate]);

  const nowMs = Date.now();
  const tasksMinutes = dayTasks.reduce((s, t) => s + t.duration_minutes, 0);
  const meetingsMinutes = dayMeetings.reduce((s, m) => s + meetingDurationMinutes(m), 0);
  // Only meetings that haven't ended yet count toward "Restante"
  const upcomingMeetingsMinutes = dayMeetings
    .filter((m) => new Date(m.ends_at).getTime() > nowMs)
    .reduce((s, m) => s + meetingDurationMinutes(m), 0);
  const totalMinutes = tasksMinutes + (includeMeetings ? meetingsMinutes : 0);
  const remainingMinutes =
    dayTasks.filter((t) => !t.completed).reduce((s, t) => s + t.duration_minutes, 0) +
    (includeMeetings ? upcomingMeetingsMinutes : 0);
  const completedCount = dayTasks.filter((t) => t.completed).length;
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const matchesQuery = (t: Task) => {
    if (!normalizedQuery) return true;
    return (
      t.title.toLowerCase().includes(normalizedQuery) ||
      (t.description ?? "").toLowerCase().includes(normalizedQuery)
    );
  };
  const visibleDayTasks = useMemo(
    () =>
      applyTaskFilters(
        dayTasks
          .filter((t) => (showCompleted ? true : !t.completed))
          .filter(matchesQuery),
        filters
      ),
    [dayTasks, showCompleted, normalizedQuery, filters]
  );
  const nonNegotiablePending = useMemo(
    () => visibleDayTasks.filter((t) => (t as any).non_negotiable && !t.completed),
    [visibleDayTasks]
  );
  const isLateAfternoon = new Date().getHours() >= 17;
  const showNonNegotiableBanner =
    isViewingToday && isLateAfternoon && nonNegotiablePending.length > 0;
  const visibleOverdue = useMemo(
    () =>
      applyTaskFilters(
        tasksApi.overdueTasks
          .filter((t) => (showCompleted ? true : !t.completed))
          .filter(matchesQuery),
        filters
      ),
    [tasksApi.overdueTasks, showCompleted, normalizedQuery, filters]
  );
  

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    // Multi-drag: if items are selected and the dragged item is one of them,
    // move the whole selection block to the drop position.
    if (selectedIds.size > 1 && selectedIds.has(active.id as string)) {
      const remaining = dayTasks.filter((t) => !selectedIds.has(t.id));
      const selected = dayTasks.filter((t) => selectedIds.has(t.id));
      const dropIdx = remaining.findIndex((t) => t.id === over.id);
      if (dropIdx < 0) return;
      const reordered = [
        ...remaining.slice(0, dropIdx + 1),
        ...selected,
        ...remaining.slice(dropIdx + 1),
      ];
      await tasksApi.reorderInDay(viewDate, reordered.map((t) => t.id));
      return;
    }

    const oldIdx = dayTasks.findIndex((t) => t.id === active.id);
    const newIdx = dayTasks.findIndex((t) => t.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(dayTasks, oldIdx, newIdx);
    await tasksApi.reorderInDay(viewDate, reordered.map((t) => t.id));
  };

  // Bulk actions
  const handleBulkMove = async (date: string, label: string) => {
    const ids = Array.from(selectedIds);
    if (date !== today) {
      const lockedCount = dayTasks.filter(
        (t) => ids.includes(t.id) && (t as any).non_negotiable && !t.completed
      ).length;
      if (lockedCount > 0) {
        const ok = window.confirm(
          `${lockedCount} tarefa${lockedCount === 1 ? "" : "s"} marcada${lockedCount === 1 ? "" : "s"} como inegociável hoje. Adiar mesmo assim?`
        );
        if (!ok) return;
      }
    }
    await tasksApi.bulkMoveToDay(ids, date);
    toast.success(`${ids.length} tarefa${ids.length === 1 ? "" : "s"} movida${ids.length === 1 ? "" : "s"} para ${label}`);
    clearSelection();
  };
  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!window.confirm(`Excluir ${ids.length} tarefa${ids.length === 1 ? "" : "s"}? Esta ação não pode ser desfeita.`)) return;
    await tasksApi.bulkDelete(ids);
    toast.success(`${ids.length} tarefa${ids.length === 1 ? "" : "s"} excluída${ids.length === 1 ? "" : "s"}`);
    clearSelection();
  };
  const handleBulkPickerConfirm = async () => {
    const iso = toISODate(bulkPickerDate);
    setBulkPickerOpen(false);
    await handleBulkMove(iso, formatHuman(iso));
  };
  const handleBulkAssignProject = async (projectId: string | null, label: string) => {
    const ids = Array.from(selectedIds);
    await tasksApi.bulkAssignProject(ids, projectId);
    toast.success(
      projectId
        ? `${ids.length} tarefa${ids.length === 1 ? "" : "s"} vinculada${ids.length === 1 ? "" : "s"} a ${label}`
        : `Projeto removido de ${ids.length} tarefa${ids.length === 1 ? "" : "s"}`
    );
    clearSelection();
  };
  const handleBulkAssignRole = async (roleId: string | null, label: string) => {
    const ids = Array.from(selectedIds);
    await tasksApi.bulkAssignRole(ids, roleId);
    toast.success(
      roleId
        ? `${ids.length} tarefa${ids.length === 1 ? "" : "s"} atribuída${ids.length === 1 ? "" : "s"} a ${label}`
        : `Papel removido de ${ids.length} tarefa${ids.length === 1 ? "" : "s"}`
    );
    clearSelection();
  };

  const enterSelectionMode = () => {
    setSelectedIds(new Set());
    setSelectionActive(true);
  };

  // ESC to deselect; click outside any card also deselects
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedIds.size > 0) clearSelection();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (selectedIds.size === 0) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Ignore clicks inside cards, the bulk action bar, dialogs/popovers and the "Selecionar" toggle.
      if (
        target.closest("[data-task-card]") ||
        target.closest("[data-bulk-bar]") ||
        target.closest("[role='dialog']") ||
        target.closest("[data-radix-popper-content-wrapper]") ||
        target.closest("[data-selection-toggle]")
      ) {
        return;
      }
      clearSelection();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [selectedIds.size]);

  // Optional seed for the dialog when opened from QuickAdd
  const [dialogSeed, setDialogSeed] = useState<Partial<Task> | null>(null);

  const openNew = (seed?: Partial<Task> | null) => {
    setEditing(null);
    setDialogSeed(seed ?? null);
    setDialogOpen(true);
  };
  const openEdit = (t: Task) => {
    setEditing(t);
    setDialogSeed(null);
    setDialogOpen(true);
  };

  // Listen for "open task by id" events fired by the global search palette
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ taskId: string }>).detail;
      if (!detail?.taskId) return;
      const found = tasksApi.tasks.find((t) => t.id === detail.taskId);
      if (found) {
        // Switch the view date to the task's date for context
        setViewDate(found.scheduled_date);
        openEdit(found);
      }
    };
    window.addEventListener("focodaily:open-task", handler);
    return () => window.removeEventListener("focodaily:open-task", handler);
  }, [tasksApi.tasks]);

  const handleSave = async (data: any, scope?: RecurrenceScope) => {
    if (editing) {
      if (scope && (editing.recurrence_parent_id || editing.recurrence !== "none")) {
        await tasksApi.updateTaskWithScope(editing, data, scope);
      } else {
        await tasksApi.updateTask(editing.id, data);
      }
      toast.success("Tarefa atualizada");
    } else {
      await tasksApi.createTask({ ...data, original_date: data.scheduled_date, position: tasksApi.topPositionForDay(data.scheduled_date) });
      toast.success("Tarefa criada");
    }
  };

  const handleDelete = async (scope?: RecurrenceScope) => {
    if (!editing) return;
    if (scope && (editing.recurrence_parent_id || editing.recurrence !== "none")) {
      await tasksApi.deleteTaskWithScope(editing, scope);
    } else {
      await tasksApi.deleteTask(editing.id);
    }
    toast.success("Tarefa excluída");
  };

  const moveOverdueToToday = async (t: Task) => {
    await tasksApi.moveTaskToDay(t.id, today, tasksApi.topPositionForDay(today));
  };

  // Quick actions for today's task list
  const handlePostpone = async (t: Task, date: string) => {
    if (date !== today && (t as any).non_negotiable && !t.completed && t.scheduled_date === today) {
      const ok = window.confirm(
        `"${t.title}" está marcada como inegociável hoje. Adiar mesmo assim?`
      );
      if (!ok) return;
    }
    await tasksApi.moveTaskToDay(t.id, date, 999);
    toast.success(date === today ? "Movida para hoje" : `Movida para ${formatHuman(date)}`);
  };
  const handleDuplicate = async (t: Task, date: string) => {
    await tasksApi.duplicateTask(t, date);
    toast.success(`Duplicada para ${formatHuman(date)}`);
  };
  const handleFollowUp = async (t: Task, date: string) => {
    await tasksApi.createFollowUp(t, date);
    toast.success(`Follow-up criado para ${formatHuman(date)}`);
  };

  // Timer integration: persist accumulated time on pause/stop/switch.
  const handleStartTimer = (t: Task) => {
    if (timer.activeTaskId && timer.activeTaskId !== t.id) {
      const stopped = timer.stop();
      if (stopped && stopped.deltaSeconds > 0) {
        tasksApi.addTimeSpent(stopped.taskId, stopped.deltaSeconds);
      }
    }
    timer.start(t.id);
  };
  const handlePauseTimer = () => {
    const paused = timer.pause();
    if (paused && paused.deltaSeconds > 0) {
      tasksApi.addTimeSpent(paused.taskId, paused.deltaSeconds);
    }
  };
  const handleResumeTimer = () => {
    timer.resume();
  };
  const handleStopTimer = () => {
    const stopped = timer.stop();
    if (stopped && stopped.deltaSeconds > 0) {
      tasksApi.addTimeSpent(stopped.taskId, stopped.deltaSeconds);
    }
  };

  const dayLabel = isViewingToday
    ? `Hoje · ${formatHuman(viewDate)}`
    : viewDate === addDays(today, 1)
    ? `Amanhã · ${formatHuman(viewDate)}`
    : formatHuman(viewDate);

  return (
    <div className="space-y-6">
      
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {isViewingToday ? "Hoje" : "Planejamento"}
          </p>
          <h1 className="font-display text-3xl font-bold capitalize">{dayLabel}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-card/60 p-1 backdrop-blur-sm">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewDate(addDays(viewDate, -1))}
              aria-label="Dia anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2">
                  <CalendarDays className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Escolher dia</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={(() => { const [y,m,d]=viewDate.split("-").map(Number); return new Date(y,m-1,d); })()}
                  onSelect={(date) => { if (date) setViewDate(toISODate(date)); }}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            {!isViewingToday && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={() => setViewDate(today)}
              >
                Hoje
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewDate(addDays(viewDate, 1))}
              aria-label="Próximo dia"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            onClick={() => setBulkDialogOpen(true)}
            title="Criar várias tarefas de uma vez"
          >
            <ListPlus className="mr-1 h-4 w-4" /> Em lote
          </Button>
          <Button
            onClick={() => openNew()}
            className="bg-gradient-to-r from-primary to-circumstantial text-primary-foreground hover:opacity-90"
          >
            <Plus className="mr-1 h-4 w-4" /> Nova tarefa
          </Button>
        </div>
      </div>

      <MeetingsRail
        meetings={dayMeetings}
        totalMinutes={meetingsMinutes}
        includeMeetings={includeMeetings}
        onToggleInclude={setIncludeMeetings}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={<Clock className="h-4 w-4" />} label="Total programado" value={formatMinutes(totalMinutes)} />
        <StatCard icon={<Clock className="h-4 w-4" />} label="Restante" value={formatMinutes(remainingMinutes)} accent />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Concluídas"
          value={`${completedCount} / ${dayTasks.length}`}
        />
      </div>

      {/* Tarefa rápida — expansível */}
      <QuickAdd
        defaultDate={viewDate}
        roles={roles}
        onCreate={async (payload) => {
          await tasksApi.createTask({
            ...payload,
            original_date: payload.scheduled_date,
            position: tasksApi.topPositionForDay(payload.scheduled_date),
            recurrence: "none",
          });
        }}
        onOpenFull={openNew}
      />

      {showNonNegotiableBanner && (
        <div className="rounded-2xl border border-overdue/50 bg-overdue/10 p-4 flex items-start gap-3">
          <Lock className="h-5 w-5 text-overdue mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-display text-sm font-semibold text-overdue">
              {nonNegotiablePending.length} tarefa{nonNegotiablePending.length === 1 ? "" : "s"} inegociável{nonNegotiablePending.length === 1 ? "" : "is"} pendente{nonNegotiablePending.length === 1 ? "" : "s"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              O dia está acabando. Estas tarefas não podem ser adiadas sem confirmação.
            </div>
          </div>
        </div>
      )}

      {isViewingToday && nonNegotiablePending.length > 0 && (
        <section className="rounded-2xl border border-overdue/30 bg-overdue/5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Lock className="h-4 w-4 text-overdue" />
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-overdue">
              Hoje sem falta ({nonNegotiablePending.length})
            </h2>
          </div>
          <div className="space-y-2">
            {nonNegotiablePending.map((t) => (
              <TaskCardStatic
                key={`nn-${t.id}`}
                task={t}
                role={t.role_id ? rolesById.get(t.role_id) ?? null : null}
                project={t.project_id ? projectsById.get(t.project_id) ?? null : null}
                onToggle={() => tasksApi.toggleComplete(t)}
                onEdit={() => openEdit(t)}
                isActive={timer.activeTaskId === t.id}
                isPaused={timer.activeTaskId === t.id && timer.isPaused}
                liveSeconds={timer.elapsedSeconds}
                onStart={() => handleStartTimer(t)}
                onPause={handlePauseTimer}
                onResume={handleResumeTimer}
                onStop={handleStopTimer}
                onPostpone={(date) => handlePostpone(t, date)}
                onDuplicate={(date) => handleDuplicate(t, date)}
                onFollowUp={(date) => handleFollowUp(t, date)}
                subtaskCount={subtaskCounts[t.id]}
              />
            ))}
          </div>
        </section>
      )}

      {isViewingToday && visibleOverdue.length > 0 && (
        <section className="rounded-2xl border border-overdue/30 bg-overdue/5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-overdue" />
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-overdue">
              Atrasadas ({visibleOverdue.length})
            </h2>
          </div>
          <div className="space-y-2">
            {visibleOverdue.map((t) => (
              <div key={t.id} className="flex items-center gap-2 min-w-0">
                <div className="flex-1 min-w-0">
                  <TaskCardStatic
                    task={t}
                    role={t.role_id ? rolesById.get(t.role_id) ?? null : null}
                    project={t.project_id ? projectsById.get(t.project_id) ?? null : null}
                    onToggle={() => tasksApi.toggleComplete(t)}
                    onEdit={() => openEdit(t)}
                    isOverdue
                    isActive={timer.activeTaskId === t.id}
                    isPaused={timer.activeTaskId === t.id && timer.isPaused}
                    liveSeconds={timer.elapsedSeconds}
                    onStart={() => handleStartTimer(t)}
                    onPause={handlePauseTimer}
                    onResume={handleResumeTimer}
                    onStop={handleStopTimer}
                    onPostpone={(date) => handlePostpone(t, date)}
                    onDuplicate={(date) => handleDuplicate(t, date)}
                    onFollowUp={(date) => handleFollowUp(t, date)}
                    selectionMode={selectionMode}
                    selected={selectedIds.has(t.id)}
                    onSelectToggle={() => toggleSelect(t.id)}
                    subtaskCount={subtaskCounts[t.id]}
                  />
                </div>
                <Button variant="outline" size="sm" onClick={() => moveOverdueToToday(t)}>
                  Hoje →
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Tarefas {isViewingToday ? "de hoje" : "do dia"}
          </h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-card/50 p-0.5">
              <ViewBtn active={taskView === "list"} onClick={() => changeTaskView("list")} icon={<ListIcon className="h-3.5 w-3.5" />} label="Lista" />
              <ViewBtn active={taskView === "cards"} onClick={() => changeTaskView("cards")} icon={<LayoutGrid className="h-3.5 w-3.5" />} label="Cards" />
              <ViewBtn active={taskView === "kanban"} onClick={() => changeTaskView("kanban")} icon={<KanbanSquare className="h-3.5 w-3.5" />} label="Kanban" />
            </div>
            {completedCount > 0 && (
              <button
                type="button"
                onClick={toggleShowCompleted}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showCompleted
                  ? `Ocultar concluídas (${completedCount})`
                  : `Mostrar concluídas (${completedCount})`}
              </button>
            )}
            {(visibleDayTasks.length > 0 || visibleOverdue.length > 0) && taskView === "list" && (
              <button
                type="button"
                data-selection-toggle="true"
                onClick={selectionMode ? clearSelection : enterSelectionMode}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {selectionMode ? "Cancelar seleção" : "Selecionar"}
              </button>
            )}
          </div>
        </div>
        <div className="mb-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar tarefas por título ou descrição…"
              className="pl-9 pr-9 h-9 bg-card/60"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40"
                aria-label="Limpar busca"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <TaskFiltersBar
            filters={filters}
            onChange={setFilters}
            roles={roles}
            projects={projects}
          />
        </div>
        {visibleDayTasks.length === 0 ? (
          normalizedQuery ? (
            <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Nenhuma tarefa encontrada para "{searchQuery}".
              </p>
            </div>
          ) : dayTasks.length > 0 && !showCompleted ? (
            <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Tudo concluído por aqui! 🎉
              </p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={toggleShowCompleted}>
                Mostrar {completedCount} concluída{completedCount === 1 ? "" : "s"}
              </Button>
            </div>
          ) : (
            <EmptyState onAdd={openNew} />
          )
        ) : taskView === "list" ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleDayTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {visibleDayTasks.map((t, i) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    role={t.role_id ? rolesById.get(t.role_id) ?? null : null}
                    project={t.project_id ? projectsById.get(t.project_id) ?? null : null}
                    onToggle={() => tasksApi.toggleComplete(t)}
                    onEdit={() => openEdit(t)}
                    index={i + 1}
                    isActive={timer.activeTaskId === t.id}
                    isPaused={timer.activeTaskId === t.id && timer.isPaused}
                    liveSeconds={timer.elapsedSeconds}
                    onStart={() => handleStartTimer(t)}
                    onPause={handlePauseTimer}
                    onResume={handleResumeTimer}
                    onStop={handleStopTimer}
                    onPostpone={(date) => handlePostpone(t, date)}
                    onDuplicate={(date) => handleDuplicate(t, date)}
                    onFollowUp={(date) => handleFollowUp(t, date)}
                    selectionMode={selectionMode}
                    selected={selectedIds.has(t.id)}
                    onSelectToggle={() => toggleSelect(t.id)}
                    subtaskCount={subtaskCounts[t.id]}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : taskView === "cards" ? (
          <TasksCardsView
            tasks={visibleDayTasks}
            rolesById={rolesById}
            projectsById={projectsById}
            onEdit={openEdit}
            onToggle={(t) => tasksApi.toggleComplete(t)}
          />
        ) : (
          <TasksKanbanView
            tasks={visibleDayTasks}
            rolesById={rolesById}
            projectsById={projectsById}
            onEdit={openEdit}
            onSetStatus={(id, status) => tasksApi.setStatus(id, status)}
          />
        )}
      </section>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultDate={viewDate}
        task={editing ?? (dialogSeed as Task | null)}
        isSeed={!editing && !!dialogSeed}
        roles={roles}
        projects={projects}
        onSave={handleSave}
        onDelete={editing ? handleDelete : undefined}
      />

      <BulkTaskDialog
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        defaultDate={viewDate}
        roles={roles}
        projects={projects}
        onCreate={async (rows) => {
          for (const r of rows) {
            await tasksApi.createTask({
              ...r,
              original_date: r.scheduled_date,
              position: tasksApi.topPositionForDay(r.scheduled_date),
              recurrence: "none",
            });
          }
        }}
      />

      {/* Floating bulk-action bar */}
      {selectionMode && (
        <div data-bulk-bar="true" className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-border/60 bg-background/95 px-3 py-2 shadow-[var(--shadow-glow)] backdrop-blur-xl max-w-full">
            <span className="px-1 text-sm font-medium tabular-nums">
              {selectedIds.size} selecionada{selectedIds.size === 1 ? "" : "s"}
            </span>
            <div className="hidden sm:block h-5 w-px bg-border/60" />
            <Button size="sm" variant="outline" onClick={() => handleBulkMove(today, "hoje")}>
              Hoje
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkMove(addDays(today, 1), "amanhã")}>
              Amanhã
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const [y, m, d] = addDays(today, 1).split("-").map(Number);
                setBulkPickerDate(new Date(y, m - 1, d));
                setBulkPickerOpen(true);
              }}
            >
              <CalendarPlus className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Outra data…</span>
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline">
                  <Folder className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">Projeto</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="center" className="w-60 p-1">
                <div className="max-h-64 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => handleBulkAssignProject(null, "")}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
                  >
                    <X className="h-3.5 w-3.5" /> Sem projeto
                  </button>
                  {projects.length === 0 && (
                    <div className="px-2 py-2 text-xs text-muted-foreground">Nenhum projeto criado.</div>
                  )}
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleBulkAssignProject(p.id, p.name)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: p.color || "#8b5cf6" }}
                      />
                      <span className="truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline">
                  <UserSquare2 className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">Papel</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="center" className="w-60 p-1">
                <div className="max-h-64 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => handleBulkAssignRole(null, "")}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
                  >
                    <X className="h-3.5 w-3.5" /> Sem papel
                  </button>
                  {roles.length === 0 && (
                    <div className="px-2 py-2 text-xs text-muted-foreground">Nenhum papel criado.</div>
                  )}
                  {roles.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => handleBulkAssignRole(r.id, r.name)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: r.color || "#8b5cf6" }}
                      />
                      <span className="truncate">{r.name}</span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Button
              size="sm"
              variant="outline"
              onClick={handleBulkDelete}
              className="text-destructive hover:text-destructive hover:border-destructive/50"
            >
              <Trash2 className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Excluir</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={bulkPickerOpen} onOpenChange={setBulkPickerOpen}>
        <DialogContent className="w-auto max-w-[20rem] p-0">
          <DialogHeader className="border-b border-border/60 p-3">
            <DialogTitle className="text-sm">
              Mover {selectedIds.size} tarefa{selectedIds.size === 1 ? "" : "s"} para…
            </DialogTitle>
          </DialogHeader>
          <Calendar
            mode="single"
            selected={bulkPickerDate}
            onSelect={(d) => d && setBulkPickerDate(d)}
            initialFocus
            className="p-3 pointer-events-auto"
          />
          <div className="flex justify-end gap-2 border-t border-border/60 p-2">
            <Button size="sm" variant="ghost" onClick={() => setBulkPickerOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleBulkPickerConfirm}>
              Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 backdrop-blur-sm ${
        accent ? "border-primary/40 bg-primary/10" : "border-border/60 bg-card/60"
      }`}
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className={`mt-1 font-display text-2xl font-semibold ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-10 text-center">
      <p className="text-muted-foreground">Nenhuma tarefa neste dia. Comece criando uma.</p>
      <Button variant="outline" className="mt-4" onClick={onAdd}>
        <Plus className="mr-1 h-4 w-4" /> Adicionar tarefa
      </Button>
    </div>
  );
}

// MeetingsSection foi substituído por <MeetingsRail /> (aba lateral colapsável).

function TaskCardStatic(props: React.ComponentProps<typeof TaskCard>) {
  return (
    <DndContext>
      <SortableContext items={[props.task.id]}>
        <TaskCard {...props} />
      </SortableContext>
    </DndContext>
  );
}

// ===================== Visões de tarefas =====================

function ViewBtn({
  active, onClick, icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
      title={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function TasksCardsView({
  tasks, rolesById, projectsById, onEdit, onToggle,
}: {
  tasks: Task[];
  rolesById: Map<string, { name: string; color: string }>;
  projectsById: Map<string, { name: string; color: string }>;
  onEdit: (t: Task) => void;
  onToggle: (t: Task) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tasks.map((t) => {
        const role = t.role_id ? rolesById.get(t.role_id) ?? null : null;
        const project = t.project_id ? projectsById.get(t.project_id) ?? null : null;
        const isNN = (t as any).non_negotiable && !t.completed;
        return (
          <div
            key={t.id}
            className={`group relative rounded-2xl border bg-card/70 backdrop-blur-sm p-3 shadow-[var(--shadow-card)] transition-colors hover:border-primary/40 cursor-pointer ${
              t.completed ? "opacity-60" : ""
            } ${isNN ? "border-l-4 border-l-overdue" : "border-border/60"}`}
            onClick={() => onEdit(t)}
          >
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggle(t); }}
                className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                  t.completed ? "bg-primary border-primary" : "border-muted-foreground/40 hover:border-primary"
                }`}
                aria-label={t.completed ? "Desmarcar" : "Concluir"}
              >
                {t.completed && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
              </button>
              {isNN && <Lock className="h-3 w-3 mt-1 text-overdue shrink-0" />}
              <p className={`text-sm font-medium leading-tight flex-1 ${t.completed ? "line-through" : ""}`}>
                {t.title}
              </p>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
              {project && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0 font-medium"
                  style={{ backgroundColor: `${project.color}20`, borderColor: `${project.color}55`, color: project.color }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project.color }} />
                  {project.name}
                </span>
              )}
              {role && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0 font-medium"
                  style={{ backgroundColor: `${role.color}20`, borderColor: `${role.color}55`, color: role.color }}
                >
                  {role.name}
                </span>
              )}
              {t.duration_minutes > 0 && (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-2.5 w-2.5" /> {t.duration_minutes}m
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const KANBAN_COLS: { id: "todo" | "doing" | "done"; label: string; accent: string }[] = [
  { id: "todo", label: "A fazer", accent: "from-muted/40 to-muted/10" },
  { id: "doing", label: "Fazendo", accent: "from-primary/20 to-primary/5" },
  { id: "done", label: "Feita", accent: "from-emerald-500/20 to-emerald-500/5" },
];

function TasksKanbanView({
  tasks, rolesById, projectsById, onEdit, onSetStatus,
}: {
  tasks: Task[];
  rolesById: Map<string, { name: string; color: string }>;
  projectsById: Map<string, { name: string; color: string }>;
  onEdit: (t: Task) => void;
  onSetStatus: (id: string, status: "todo" | "doing" | "done") => Promise<void>;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 180, tolerance: 6 } }));

  const grouped = useMemo(() => {
    const out: Record<"todo" | "doing" | "done", Task[]> = { todo: [], doing: [], done: [] };
    for (const t of tasks) {
      const s = (t.completed ? "done" : t.status) as "todo" | "doing" | "done";
      if (out[s]) out[s].push(t);
    }
    return out;
  }, [tasks]);

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const id = String(active.id);
    const newStatus = String(over.id) as "todo" | "doing" | "done";
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    const current = (t.completed ? "done" : t.status) as "todo" | "doing" | "done";
    if (current === newStatus) return;
    try {
      await onSetStatus(id, newStatus);
    } catch {
      toast.error("Erro ao mover");
    }
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid gap-3 sm:grid-cols-3">
        {KANBAN_COLS.map((col) => (
          <KanbanCol
            key={col.id}
            id={col.id}
            label={col.label}
            accent={col.accent}
            tasks={grouped[col.id]}
            rolesById={rolesById}
            projectsById={projectsById}
            onEdit={onEdit}
          />
        ))}
      </div>
    </DndContext>
  );
}

function KanbanCol({
  id, label, accent, tasks, rolesById, projectsById, onEdit,
}: {
  id: "todo" | "doing" | "done";
  label: string;
  accent: string;
  tasks: Task[];
  rolesById: Map<string, { name: string; color: string }>;
  projectsById: Map<string, { name: string; color: string }>;
  onEdit: (t: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl border bg-gradient-to-b ${accent} backdrop-blur-sm p-3 transition-colors min-h-[200px] ${
        isOver ? "border-primary/60 ring-1 ring-primary/30" : "border-border/60"
      }`}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider">{label}</h3>
        <span className="rounded-full bg-background/60 px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
          {tasks.length}
        </span>
      </div>
      <div className="space-y-2">
        {tasks.length === 0 && (
          <p className="text-center text-xs text-muted-foreground/50 py-4">Arraste aqui</p>
        )}
        {tasks.map((t) => (
          <KanbanTaskCard
            key={t.id}
            task={t}
            role={t.role_id ? rolesById.get(t.role_id) ?? null : null}
            project={t.project_id ? projectsById.get(t.project_id) ?? null : null}
            onEdit={() => onEdit(t)}
          />
        ))}
      </div>
    </div>
  );
}

function KanbanTaskCard({
  task, role, project, onEdit,
}: {
  task: Task;
  role: { name: string; color: string } | null;
  project: { name: string; color: string } | null;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };
  const isNN = (task as any).non_negotiable && !task.completed;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onDoubleClick={onEdit}
      className={`cursor-grab active:cursor-grabbing rounded-xl border bg-card/80 backdrop-blur-sm p-3 shadow-[var(--shadow-card)] hover:border-primary/40 transition-colors touch-none ${
        isNN ? "border-l-4 border-l-overdue border-border/60" : "border-border/60"
      } ${task.completed ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-1.5">
        {isNN && <Lock className="h-3 w-3 mt-0.5 text-overdue shrink-0" />}
        <p className={`text-sm font-medium leading-tight ${task.completed ? "line-through" : ""}`}>
          {task.title}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
        {project && (
          <span
            className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0 font-medium"
            style={{ backgroundColor: `${project.color}20`, borderColor: `${project.color}55`, color: project.color }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project.color }} />
            {project.name}
          </span>
        )}
        {role && (
          <span
            className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0 font-medium"
            style={{ backgroundColor: `${role.color}20`, borderColor: `${role.color}55`, color: role.color }}
          >
            {role.name}
          </span>
        )}
        {task.duration_minutes > 0 && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Clock className="h-2.5 w-2.5" /> {task.duration_minutes}m
          </span>
        )}
      </div>
    </div>
  );
}


// ===================== Quick Add =====================

const QUICK_DURATIONS = [5, 15, 30, 45, 60, 90, 120];

function QuickAdd({
  defaultDate,
  roles,
  onCreate,
  onOpenFull,
}: {
  defaultDate: string;
  roles: { id: string; name: string; color: string }[];
  onCreate: (payload: {
    title: string;
    category: TaskCategory;
    scheduled_date: string;
    duration_minutes: number;
    role_id: string | null;
  }) => Promise<void>;
  onOpenFull: (seed?: Partial<Task> | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TaskCategory>("important");
  const [date, setDate] = useState(defaultDate);
  const [duration, setDuration] = useState(30);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Keep date synced with viewDate when not yet expanded
  if (!expanded && date !== defaultDate) {
    // light reset on view-day change while collapsed
    setDate(defaultDate);
  }

  const reset = () => {
    setTitle("");
    setCategory("important");
    setDate(defaultDate);
    setDuration(30);
    setRoleId(null);
    setExpanded(false);
  };

  const submit = async () => {
    const t = title.trim();
    if (!t) {
      toast.error("Dê um título à tarefa");
      return;
    }
    setSaving(true);
    try {
      await onCreate({
        title: t,
        category,
        scheduled_date: date,
        duration_minutes: Math.max(5, Math.min(600, duration)),
        role_id: roleId,
      });
      reset();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao criar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm transition-colors focus-within:border-primary/50">
      <div className="flex items-center gap-2 p-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Zap className="h-4 w-4" />
        </div>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={() => setExpanded(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape" && expanded) reset();
          }}
          placeholder="Tarefa rápida — clique para detalhes"
          className="border-0 bg-transparent shadow-none focus-visible:ring-0 px-0"
        />
        {expanded && (
          <button
            onClick={reset}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent/40 hover:text-foreground"
            aria-label="Cancelar"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {expanded && (
        <div className="border-t border-border/40 p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <Label className="text-xs">Tríade</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as TaskCategory)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">
                    <span className="inline-flex items-center gap-2">
                      <CategoryIcon category="urgent" /> Urgente
                    </span>
                  </SelectItem>
                  <SelectItem value="important">
                    <span className="inline-flex items-center gap-2">
                      <CategoryIcon category="important" /> Importante
                    </span>
                  </SelectItem>
                  <SelectItem value="circumstantial">
                    <span className="inline-flex items-center gap-2">
                      <CategoryIcon category="circumstantial" /> Circunstancial
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Data</Label>
              <DatePickerField value={date} onChange={setDate} size="sm" />
            </div>
            <div>
              <Label className="text-xs">Tempo</Label>
              <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUICK_DURATIONS.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {formatMinutes(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Papel</Label>
              <Select
                value={roleId ?? "__none"}
                onValueChange={(v) => setRoleId(v === "__none" ? null : v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Sem papel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sem papel</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
                        {r.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onOpenFull({
                  title: title.trim() || undefined,
                  category,
                  scheduled_date: date,
                  duration_minutes: duration,
                  role_id: roleId,
                } as Partial<Task>);
                reset();
              }}
              className="text-xs text-muted-foreground"
            >
              Mais opções (descrição, recorrência…)
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={reset}>
                Cancelar
              </Button>
              <Button size="sm" onClick={submit} disabled={saving}>
                {saving ? "Salvando…" : "Adicionar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
