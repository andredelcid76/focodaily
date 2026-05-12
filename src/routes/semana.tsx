import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useTasks, type Task } from "@/hooks/useTasks";
import { useMeetings, meetingDurationMinutes, type Meeting } from "@/hooks/useMeetings";
import { useRoles, type Role } from "@/hooks/useRoles";
import { useProjects, type Project } from "@/hooks/useProjects";
import { TaskDialog, type RecurrenceScope } from "@/components/TaskDialog";
import { CategoryIcon } from "@/components/CategoryBadge";
import { Lock, Repeat } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { TaskFiltersBar, applyTaskFilters, emptyFilters, type TaskFilters } from "@/components/TaskFiltersBar";
import { AutoOrganizeButton } from "@/components/AutoOrganizeButton";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { todayISO, addDays, startOfWeek, weekDays, formatShort, formatMinutes } from "@/lib/date";
import { toast } from "sonner";

export const Route = createFileRoute("/semana")({
  component: () => (
    <AppShell>
      <WeekPage />
    </AppShell>
  ),
});

function WeekPage() {
  const { user } = useAuth();
  if (!user) return null;
  return <WeekInner userId={user.id} />;
}

function WeekInner({ userId }: { userId: string }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayISO()));
  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const tasksApi = useTasks(userId);
  const meetingsApi = useMeetings(userId);
  const { roles } = useRoles(userId);
  const { projects } = useProjects(userId);
  const rolesById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [defaultDate, setDefaultDate] = useState(todayISO());
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<TaskFilters>(() => emptyFilters());

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const matchesQuery = (t: Task) => {
    if (!normalizedQuery) return true;
    return (
      t.title.toLowerCase().includes(normalizedQuery) ||
      (t.description ?? "").toLowerCase().includes(normalizedQuery)
    );
  };

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    days.forEach((d) => map.set(d, []));
    const filteredTasks = applyTaskFilters(tasksApi.tasks.filter(matchesQuery), filters);
    for (const t of filteredTasks) {
      if (map.has(t.scheduled_date)) {
        map.get(t.scheduled_date)!.push(t);
      }
    }
    for (const arr of map.values()) arr.sort((a, b) => a.position - b.position);
    return map;
  }, [tasksApi.tasks, days, filters, normalizedQuery]);

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeTask = active.data.current?.task as Task | undefined;
    const overData = over.data.current as { task?: Task; day?: string } | undefined;
    if (!activeTask) return;

    const overTask = overData?.task;
    const targetDay = overTask?.scheduled_date ?? overData?.day;
    if (!targetDay) return;

    if (activeTask.scheduled_date === targetDay && overTask) {
      // reorder within same day
      const list = tasksByDay.get(targetDay) ?? [];
      const oldIdx = list.findIndex((t) => t.id === activeTask.id);
      const newIdx = list.findIndex((t) => t.id === overTask.id);
      if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return;
      const reordered = arrayMove(list, oldIdx, newIdx);
      await tasksApi.reorderInDay(targetDay, reordered.map((t) => t.id));
    } else {
      // move to another day
      const targetList = tasksByDay.get(targetDay) ?? [];
      const insertIdx = overTask ? targetList.findIndex((t) => t.id === overTask.id) : targetList.length;
      const newOrder = [...targetList.filter((t) => t.id !== activeTask.id)];
      newOrder.splice(insertIdx >= 0 ? insertIdx : newOrder.length, 0, activeTask);
      await tasksApi.reorderInDay(targetDay, newOrder.map((t) => t.id));
    }
  };

  const openNew = (date: string) => {
    setEditing(null);
    setDefaultDate(date);
    setDialogOpen(true);
  };
  const openEdit = (t: Task) => {
    setEditing(t);
    setDefaultDate(t.scheduled_date);
    setDialogOpen(true);
  };
  const handleSave = async (data: any) => {
    if (editing) {
      await tasksApi.updateTask(editing.id, data);
      toast.success("Tarefa atualizada");
    } else {
      await tasksApi.createTask({ ...data, original_date: data.scheduled_date, position: 999 });
      toast.success("Tarefa criada");
    }
  };

  const today = todayISO();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Planejamento</p>
          <h1 className="font-display text-3xl font-bold">Visão semanal</h1>
        </div>
        <div className="flex items-center gap-2">
          <AutoOrganizeButton scope="week" weekStart={weekStart} onDone={() => tasksApi.refresh()} />
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(todayISO()))}>Esta semana</Button>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar tarefas…"
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
        <TaskFiltersBar filters={filters} onChange={setFilters} roles={roles} projects={projects} />
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="-mx-4 overflow-x-auto px-4 pb-2">
          <div className="flex gap-3 min-w-max">
            {days.map((d) => {
              const list = tasksByDay.get(d) ?? [];
              const dayMeetings = meetingsApi.meetingsByDay(d);
              const tasksMinutes = list.reduce((s, t) => s + t.duration_minutes, 0);
              const meetingsMinutes = dayMeetings.reduce((s, m) => s + meetingDurationMinutes(m), 0);
              const isToday = d === today;
              return (
                <div key={d} className="w-[260px] shrink-0">
                  <DayColumn
                    day={d}
                    tasks={list}
                    meetings={dayMeetings}
                    rolesById={rolesById}
                    projectsById={projectsById}
                    isToday={isToday}
                    tasksMinutes={tasksMinutes}
                    meetingsMinutes={meetingsMinutes}
                    onAdd={() => openNew(d)}
                    onToggle={(t) => tasksApi.toggleComplete(t)}
                    onEdit={(t) => openEdit(t)}
                    onAutoOrganized={() => tasksApi.refresh()}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </DndContext>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultDate={defaultDate}
        task={editing}
        roles={roles}
        projects={projects}
        onSave={handleSave}
        onDelete={editing ? async (scope?: RecurrenceScope) => {
          if (scope && (editing.recurrence_parent_id || editing.recurrence !== "none")) {
            await tasksApi.deleteTaskWithScope(editing, scope);
          } else {
            await tasksApi.deleteTask(editing.id);
          }
          toast.success("Tarefa excluída");
        } : undefined}
      />
    </div>
  );
}

function DayColumn({
  day, tasks, meetings, rolesById, projectsById, isToday, tasksMinutes, meetingsMinutes, onAdd, onToggle, onEdit, onAutoOrganized,
}: {
  day: string;
  tasks: Task[];
  meetings: Meeting[];
  rolesById: Map<string, Role>;
  projectsById: Map<string, Project>;
  isToday: boolean;
  tasksMinutes: number;
  meetingsMinutes: number;
  onAdd: () => void;
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
  onAutoOrganized?: () => void;
}) {
  const totalMinutes = tasksMinutes + meetingsMinutes;
  return (
    <div className={`rounded-2xl border p-3 backdrop-blur-sm min-h-[200px] flex flex-col ${
      isToday ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card/40"
    }`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`text-xs uppercase tracking-wider ${isToday ? "text-primary font-semibold" : "text-muted-foreground"}`}>
            {formatShort(day)}
          </div>
          <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground leading-tight">
            <div className="flex items-center justify-between gap-2">
              <span>Tarefas</span>
              <span className="tabular-nums">{formatMinutes(tasksMinutes)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Reuniões</span>
              <span className="tabular-nums">{formatMinutes(meetingsMinutes)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 pt-0.5 border-t border-border/40 text-foreground/80 font-medium">
              <span>Total</span>
              <span className="tabular-nums">{formatMinutes(totalMinutes)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {tasks.length > 1 && (
            <AutoOrganizeButton scope="day" date={day} size="icon" variant="ghost" onDone={onAutoOrganized} />
          )}
          <button onClick={onAdd} className="rounded-md p-1 text-muted-foreground hover:bg-accent/40 hover:text-foreground" aria-label="Adicionar">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
      {meetings.length > 0 && (
        <div className="mb-2 space-y-1">
          {meetings.map((m) => (
            <div key={m.id} className="rounded-md border border-border/40 bg-muted/30 px-2 py-1 text-[11px]">
              <div className="font-medium truncate">{m.title}</div>
              {!m.is_all_day && (
                <div className="text-muted-foreground tabular-nums">
                  {new Date(m.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  {" – "}
                  {new Date(m.ends_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 space-y-2" data-day={day}>
          {tasks.length === 0 ? (
            <DropZone day={day} />
          ) : (
            tasks.map((t) => (
              <MiniTaskRow
                key={t.id}
                task={t}
                role={t.role_id ? rolesById.get(t.role_id) ?? null : null}
                project={t.project_id ? projectsById.get(t.project_id) ?? null : null}
                onToggle={() => onToggle(t)}
                onEdit={() => onEdit(t)}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function MiniTaskRow({
  task,
  role,
  project,
  onToggle,
  onEdit,
}: {
  task: Task;
  role: Role | null;
  project: Project | null;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const nonNeg = (task as any).non_negotiable && !task.completed;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        onEdit();
      }}
      title={task.title}
      className={`group flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] backdrop-blur-sm transition-colors cursor-pointer touch-none ${
        task.completed
          ? "border-border/40 bg-muted/20 opacity-60"
          : "border-border/50 bg-card/70 hover:border-primary/40"
      } ${nonNeg ? "border-l-2 border-l-overdue" : ""}`}
    >
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-full border ${
          task.completed
            ? "border-green-500 bg-green-500/30"
            : "border-muted-foreground/40 hover:border-green-500"
        }`}
        aria-label="Concluir"
      />
      <CategoryIcon category={task.category} className="h-3 w-3 shrink-0" />
      {nonNeg && <Lock className="h-2.5 w-2.5 text-overdue shrink-0" aria-label="Inegociável" />}
      {(task.recurrence !== "none" || task.recurrence_parent_id) && (
        <Repeat className="h-2.5 w-2.5 text-muted-foreground/60 shrink-0" />
      )}
      <span
        className={`flex-1 min-w-0 truncate leading-tight ${task.completed ? "line-through" : ""}`}
        style={
          project?.color || role?.color
            ? { borderLeft: undefined }
            : undefined
        }
      >
        {task.title}
      </span>
      {(role?.color || project?.color) && (
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: project?.color ?? role?.color }}
          title={project?.name ?? role?.name}
        />
      )}
    </div>
  );
}

import { useDroppable } from "@dnd-kit/core";

function DropZone({ day }: { day: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `empty-${day}`, data: { day } });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground/60 transition-colors ${
        isOver ? "border-primary bg-primary/10" : "border-border/40"
      }`}
    >
      Arraste aqui
    </div>
  );
}
