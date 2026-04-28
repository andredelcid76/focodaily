import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useTasks, type Task, type TaskCategory } from "@/hooks/useTasks";
import { useRoles } from "@/hooks/useRoles";
import { useActiveTimer } from "@/hooks/useActiveTimer";
import { TaskCard } from "@/components/TaskCard";
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
  ChevronDown,
  CalendarDays,
  CalendarClock,
  MapPin,
  ExternalLink,
  X,
  Trash2,
  CalendarPlus,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
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
  const meetingsApi = useMeetings(userId);
  const timer = useActiveTimer();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPickerOpen, setBulkPickerOpen] = useState(false);
  const [bulkPickerDate, setBulkPickerDate] = useState<Date>(() => new Date());
  const selectionMode = selectedIds.size > 0;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const rolesById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  const isViewingToday = viewDate === today;
  const dayTasks = useMemo(
    () =>
      tasksApi.tasksByDay(viewDate).slice().sort((a, b) => {
        // Completed tasks always go to the bottom
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return a.position - b.position;
      }),
    [tasksApi, viewDate]
  );
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

  const handleDragEnd = async (e: DragEndEvent) => {
    if (selectionMode) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = dayTasks.findIndex((t) => t.id === active.id);
    const newIdx = dayTasks.findIndex((t) => t.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(dayTasks, oldIdx, newIdx);
    await tasksApi.reorderInDay(viewDate, reordered.map((t) => t.id));
  };

  // Bulk actions
  const handleBulkMove = async (date: string, label: string) => {
    const ids = Array.from(selectedIds);
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

  const selectAllVisible = () => {
    const ids = new Set(selectedIds);
    dayTasks.forEach((t) => ids.add(t.id));
    if (isViewingToday) tasksApi.overdueTasks.forEach((t) => ids.add(t.id));
    setSelectedIds(ids);
  };

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (t: Task) => {
    setEditing(t);
    setDialogOpen(true);
  };

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
            onClick={openNew}
            className="bg-gradient-to-r from-primary to-circumstantial text-primary-foreground hover:opacity-90"
          >
            <Plus className="mr-1 h-4 w-4" /> Nova tarefa
          </Button>
        </div>
      </div>

      {dayMeetings.length > 0 && (
        <MeetingsSection
          meetings={dayMeetings}
          totalMinutes={meetingsMinutes}
          includeMeetings={includeMeetings}
          onToggleInclude={setIncludeMeetings}
        />
      )}

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

      {isViewingToday && tasksApi.overdueTasks.length > 0 && (
        <section className="rounded-2xl border border-overdue/30 bg-overdue/5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-overdue" />
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-overdue">
              Atrasadas ({tasksApi.overdueTasks.length})
            </h2>
          </div>
          <div className="space-y-2">
            {tasksApi.overdueTasks.map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <div className="flex-1">
                  <TaskCardStatic
                    task={t}
                    role={t.role_id ? rolesById.get(t.role_id) ?? null : null}
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
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Tarefas {isViewingToday ? "de hoje" : "do dia"}
          </h2>
          {dayTasks.length > 0 && (
            <button
              type="button"
              onClick={selectionMode ? clearSelection : selectAllVisible}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {selectionMode ? "Cancelar seleção" : "Selecionar"}
            </button>
          )}
        </div>
        {dayTasks.length === 0 ? (
          <EmptyState onAdd={openNew} />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={dayTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {dayTasks.map((t, i) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    role={t.role_id ? rolesById.get(t.role_id) ?? null : null}
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
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </section>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultDate={viewDate}
        task={editing}
        roles={roles}
        onSave={handleSave}
        onDelete={editing ? handleDelete : undefined}
      />

      {/* Floating bulk-action bar */}
      {selectionMode && (
        <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 pointer-events-none">
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

function MeetingsSection({
  meetings,
  totalMinutes,
  includeMeetings,
  onToggleInclude,
}: {
  meetings: ReturnType<ReturnType<typeof useMeetings>["meetingsByDay"]>;
  totalMinutes: number;
  includeMeetings: boolean;
  onToggleInclude: (v: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(includeMeetings);
  // Sincroniza: quando o toggle "Incluir nas somas" liga/desliga, abre/fecha a seção.
  const [prevInclude, setPrevInclude] = useState(includeMeetings);
  if (prevInclude !== includeMeetings) {
    setPrevInclude(includeMeetings);
    setExpanded(includeMeetings);
  }

  const nowMs = Date.now();
  const sorted = [...meetings].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
  );
  const upcomingCount = sorted.filter((m) => new Date(m.ends_at).getTime() > nowMs).length;

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <section className="rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left text-muted-foreground hover:text-foreground transition-colors"
          aria-expanded={expanded}
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "" : "-rotate-90"}`}
          />
          <CalendarClock className="h-4 w-4" />
          <span>
            {meetings.length} reuni{meetings.length === 1 ? "ão" : "ões"} no dia ·{" "}
            {formatMinutes(totalMinutes)}
            {upcomingCount < meetings.length && (
              <span className="ml-1 text-xs">
                ({upcomingCount} restante{upcomingCount === 1 ? "" : "s"})
              </span>
            )}
          </span>
        </button>
        <label className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          Incluir nas somas
          <Switch checked={includeMeetings} onCheckedChange={onToggleInclude} />
        </label>
      </div>

      {expanded && (
        <ul className="divide-y divide-border/40 border-t border-border/40">
          {sorted.map((m) => {
            const isPast = new Date(m.ends_at).getTime() <= nowMs;
            const isOngoing = !isPast && new Date(m.starts_at).getTime() <= nowMs;
            return (
              <li
                key={m.id}
                className={`flex items-start gap-3 px-4 py-2.5 text-sm transition-colors ${
                  isPast ? "opacity-50" : "hover:bg-card/60"
                }`}
              >
                <div
                  className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: m.color || "#0ea5e9" }}
                  aria-hidden
                />
                <div className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">
                  {m.is_all_day ? (
                    <span>dia todo</span>
                  ) : (
                    <>
                      <div className={isPast ? "line-through" : ""}>{fmtTime(m.starts_at)}</div>
                      <div className="text-muted-foreground/70">{fmtTime(m.ends_at)}</div>
                    </>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`font-medium leading-tight ${
                        isPast ? "line-through text-muted-foreground" : ""
                      }`}
                    >
                      {m.title}
                    </span>
                    {isOngoing && (
                      <span className="inline-flex items-center rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        agora
                      </span>
                    )}
                  </div>
                  {m.location && (
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{m.location}</span>
                    </div>
                  )}
                </div>
                {m.web_link && (
                  <a
                    href={m.web_link}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                    aria-label="Abrir reunião"
                    title="Abrir no Outlook"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TaskCardStatic(props: React.ComponentProps<typeof TaskCard>) {
  return (
    <DndContext>
      <SortableContext items={[props.task.id]}>
        <TaskCard {...props} />
      </SortableContext>
    </DndContext>
  );
}

// ===================== Quick Add =====================

const QUICK_DURATIONS = [15, 30, 45, 60, 90];

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
  onOpenFull: () => void;
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
                onOpenFull();
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
