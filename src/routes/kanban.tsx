import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useTasks, type Task, type TaskStatus } from "@/hooks/useTasks";
import { useRoles } from "@/hooks/useRoles";
import { CategoryIcon } from "@/components/CategoryBadge";
import { RoleBadge } from "@/components/RoleBadge";
import { todayISO, addDays, formatHuman, formatMinutes } from "@/lib/date";
import { ChevronLeft, ChevronRight, Clock, KanbanSquare } from "lucide-react";
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
  { id: "done", label: "Feitas", accent: "from-emerald-500/20 to-emerald-500/5" },
];

function KanbanInner({ userId }: { userId: string }) {
  const today = todayISO();
  const [viewDate, setViewDate] = useState(today);
  const { tasksByDay, setStatus } = useTasks(userId);
  const { roles } = useRoles(userId);
  const rolesById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const dayTasks = tasksByDay(viewDate);
  const grouped = useMemo(() => {
    const out: Record<TaskStatus, Task[]> = { todo: [], doing: [], done: [] };
    for (const t of dayTasks) out[t.status].push(t);
    return out;
  }, [dayTasks]);

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const taskId = String(active.id);
    const newStatus = String(over.id) as TaskStatus;
    const task = dayTasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;
    try {
      await setStatus(taskId, newStatus);
    } catch {
      toast.error("Erro ao mover tarefa");
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <KanbanSquare className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-display font-semibold">Kanban</h1>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-card/50 p-1">
          <button
            onClick={() => setViewDate(addDays(viewDate, -1))}
            className="rounded-md p-1.5 hover:bg-accent/40"
            aria-label="Dia anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewDate(today)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              viewDate === today ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {viewDate === today ? "Hoje" : formatHuman(viewDate)}
          </button>
          <button
            onClick={() => setViewDate(addDays(viewDate, 1))}
            className="rounded-md p-1.5 hover:bg-accent/40"
            aria-label="Próximo dia"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => (
            <Column
              key={col.id}
              id={col.id}
              label={col.label}
              accent={col.accent}
              tasks={grouped[col.id]}
              rolesById={rolesById}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function Column({
  id,
  label,
  accent,
  tasks,
  rolesById,
}: {
  id: TaskStatus;
  label: string;
  accent: string;
  tasks: Task[];
  rolesById: Map<string, ReturnType<typeof useRoles>["roles"][number]>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl border bg-gradient-to-b ${accent} backdrop-blur-sm p-3 transition-colors ${
        isOver ? "border-primary/60 ring-1 ring-primary/30" : "border-border/60"
      }`}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold">{label}</h2>
        <span className="rounded-full bg-background/60 px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
          {tasks.length}
        </span>
      </div>
      <div className="space-y-2 min-h-[120px]">
        {tasks.length === 0 && (
          <p className="text-center text-xs text-muted-foreground/60 py-6">Arraste tarefas aqui</p>
        )}
        {tasks.map((t) => (
          <KanbanCard key={t.id} task={t} role={t.role_id ? rolesById.get(t.role_id) ?? null : null} />
        ))}
      </div>
    </div>
  );
}

function KanbanCard({ task, role }: { task: Task; role: ReturnType<typeof useRoles>["roles"][number] | null }) {
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
      className={`cursor-grab active:cursor-grabbing rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm p-3 shadow-[var(--shadow-card)] hover:border-primary/40 transition-colors ${
        task.status === "done" ? "opacity-70" : ""
      }`}
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <CategoryIcon category={task.category} className="h-3.5 w-3.5" />
        <span className={`text-sm font-medium leading-tight ${task.status === "done" ? "line-through" : ""}`}>
          {task.title}
        </span>
        {role && <RoleBadge role={role} size="xs" />}
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" /> {formatMinutes(task.duration_minutes)}
        </span>
      </div>
    </div>
  );
}
