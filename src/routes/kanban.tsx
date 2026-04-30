import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useTasks, type Task, type TaskStatus } from "@/hooks/useTasks";
import { useRoles } from "@/hooks/useRoles";
import { useProjects } from "@/hooks/useProjects";
import { TaskFiltersBar, applyTaskFilters, type TaskFilters } from "@/components/TaskFiltersBar";
import { todayISO } from "@/lib/date";
import { KanbanSquare, Search, Lock, Clock } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/kanban")({
  component: () => (
    <AppShell>
      <KanbanPage />
    </AppShell>
  ),
});

function KanbanPage() {
  const { user } = useAuth();
  if (!user) return null;
  return <KanbanInner userId={user.id} />;
}

const COLUMNS: { id: TaskStatus; label: string; accent: string }[] = [
  { id: "todo", label: "A fazer", accent: "from-muted/40 to-muted/10" },
  { id: "doing", label: "Fazendo", accent: "from-primary/20 to-primary/5" },
  { id: "done", label: "Feita", accent: "from-emerald-500/20 to-emerald-500/5" },
];

function KanbanInner({ userId }: { userId: string }) {
  const today = todayISO();
  const tasksApi = useTasks(userId);
  const { roles } = useRoles(userId);
  const projectsApi = useProjects(userId);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<TaskFilters>({});
  const [scope, setScope] = useState<"today" | "week" | "all">("today");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const visible = useMemo(() => {
    let list = tasksApi.tasks;

    // Scope filter
    if (scope === "today") {
      list = list.filter((t) => t.scheduled_date === today);
    } else if (scope === "week") {
      const d = new Date();
      const dow = (d.getDay() + 6) % 7; // 0 = Mon
      const start = new Date(d);
      start.setDate(d.getDate() - dow);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const startISO = start.toISOString().slice(0, 10);
      const endISO = end.toISOString().slice(0, 10);
      list = list.filter((t) => t.scheduled_date >= startISO && t.scheduled_date <= endISO);
    }

    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q)
      );
    }

    return applyTaskFilters(list, filters);
  }, [tasksApi.tasks, scope, today, query, filters]);

  const grouped = useMemo(() => {
    const out: Record<TaskStatus, Task[]> = { todo: [], doing: [], done: [] };
    for (const t of visible) {
      const s = (t.completed ? "done" : t.status) as TaskStatus;
      if (out[s]) out[s].push(t);
    }
    // Sort by position then date
    for (const k of Object.keys(out) as TaskStatus[]) {
      out[k].sort((a, b) => {
        if (a.scheduled_date !== b.scheduled_date) return a.scheduled_date.localeCompare(b.scheduled_date);
        return (a.position ?? 0) - (b.position ?? 0);
      });
    }
    return out;
  }, [visible]);

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const taskId = String(active.id);
    const newStatus = String(over.id) as TaskStatus;
    const task = tasksApi.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const current = (task.completed ? "done" : task.status) as TaskStatus;
    if (current === newStatus) return;
    try {
      await tasksApi.setStatus(taskId, newStatus);
      toast.success(
        newStatus === "done" ? "Tarefa concluída" : `Movida para ${COLUMNS.find((c) => c.id === newStatus)?.label}`
      );
    } catch {
      toast.error("Erro ao mover tarefa");
    }
  };

  const projectsById = useMemo(
    () => new Map(projectsApi.projects.map((p) => [p.id, p])),
    [projectsApi.projects]
  );
  const rolesById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <KanbanSquare className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-display font-semibold">Kanban de tarefas</h1>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-card/50 p-1">
          {(["today", "week", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                scope === s ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "today" ? "Hoje" : s === "week" ? "Semana" : "Todas"}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar tarefas…"
            className="pl-9"
          />
        </div>
        <TaskFiltersBar
          filters={filters}
          onChange={setFilters}
          roles={roles}
          projects={projectsApi.projects}
        />
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto pb-2">
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(260px, 1fr))` }}
          >
            {COLUMNS.map((col) => (
              <KanbanColumn
                key={col.id}
                id={col.id}
                label={col.label}
                accent={col.accent}
                tasks={grouped[col.id]}
                projectsById={projectsById}
                rolesById={rolesById}
              />
            ))}
          </div>
        </div>
      </DndContext>
    </div>
  );
}

function KanbanColumn({
  id,
  label,
  accent,
  tasks,
  projectsById,
  rolesById,
}: {
  id: TaskStatus;
  label: string;
  accent: string;
  tasks: Task[];
  projectsById: Map<string, { name: string; color: string }>;
  rolesById: Map<string, { name: string; color: string }>;
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
        <h2 className="text-sm font-semibold">{label}</h2>
        <span className="rounded-full bg-background/60 px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
          {tasks.length}
        </span>
      </div>
      <div className="space-y-2">
        {tasks.length === 0 && (
          <p className="text-center text-xs text-muted-foreground/60 py-6">Arraste tarefas aqui</p>
        )}
        {tasks.map((t) => (
          <KanbanTaskCard
            key={t.id}
            task={t}
            project={t.project_id ? projectsById.get(t.project_id) ?? null : null}
            role={t.role_id ? rolesById.get(t.role_id) ?? null : null}
          />
        ))}
      </div>
    </div>
  );
}

function KanbanTaskCard({
  task,
  project,
  role,
}: {
  task: Task;
  project: { name: string; color: string } | null;
  role: { name: string; color: string } | null;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`cursor-grab active:cursor-grabbing rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm p-3 shadow-[var(--shadow-card)] hover:border-primary/40 transition-colors touch-none ${
        (task as any).non_negotiable && !task.completed ? "border-l-4 border-l-overdue" : ""
      }`}
    >
      <div className="flex items-start gap-1.5">
        {(task as any).non_negotiable && !task.completed && (
          <Lock className="h-3 w-3 mt-0.5 text-overdue shrink-0" />
        )}
        <p className={`font-medium text-sm leading-tight ${task.completed ? "line-through opacity-60" : ""}`}>
          {task.title}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
        {project && (
          <span
            className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0 font-medium"
            style={{
              backgroundColor: `${project.color}20`,
              borderColor: `${project.color}55`,
              color: project.color,
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project.color }} />
            {project.name}
          </span>
        )}
        {role && (
          <span
            className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0 font-medium"
            style={{
              backgroundColor: `${role.color}20`,
              borderColor: `${role.color}55`,
              color: role.color,
            }}
          >
            {role.name}
          </span>
        )}
        {task.duration_minutes > 0 && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Clock className="h-2.5 w-2.5" />
            {task.duration_minutes}m
          </span>
        )}
      </div>
    </div>
  );
}
