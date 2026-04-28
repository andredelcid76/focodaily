import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useTasks, type Task } from "@/hooks/useTasks";
import { useRoles } from "@/hooks/useRoles";
import { TaskCard } from "@/components/TaskCard";
import { TaskDialog } from "@/components/TaskDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Clock, AlertTriangle, CheckCircle2, Zap } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { todayISO, formatHuman, formatMinutes } from "@/lib/date";
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
  const tasksApi = useTasks(userId);
  const { roles } = useRoles(userId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [quickTitle, setQuickTitle] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const rolesById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  const sortedToday = useMemo(
    () => [...tasksApi.todayTasks].sort((a, b) => a.position - b.position),
    [tasksApi.todayTasks]
  );

  const totalMinutes = sortedToday.reduce((s, t) => s + t.duration_minutes, 0);
  const remainingMinutes = sortedToday.filter((t) => !t.completed).reduce((s, t) => s + t.duration_minutes, 0);
  const completedCount = sortedToday.filter((t) => t.completed).length;

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = sortedToday.findIndex((t) => t.id === active.id);
    const newIdx = sortedToday.findIndex((t) => t.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(sortedToday, oldIdx, newIdx);
    await tasksApi.reorderInDay(today, reordered.map((t) => t.id));
  };

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (t: Task) => {
    setEditing(t);
    setDialogOpen(true);
  };

  const handleSave = async (data: any) => {
    if (editing) {
      await tasksApi.updateTask(editing.id, data);
      toast.success("Tarefa atualizada");
    } else {
      await tasksApi.createTask({ ...data, original_date: data.scheduled_date, position: sortedToday.length });
      toast.success("Tarefa criada");
    }
  };

  const handleQuickAdd = async () => {
    const title = quickTitle.trim();
    if (!title) return;
    try {
      await tasksApi.createTask({
        title,
        category: "important",
        scheduled_date: today,
        original_date: today,
        duration_minutes: 30,
        recurrence: "none",
        position: sortedToday.length,
      });
      setQuickTitle("");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao criar");
    }
  };

  const moveOverdueToToday = async (t: Task) => {
    await tasksApi.moveTaskToDay(t.id, today, sortedToday.length);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Hoje</p>
          <h1 className="font-display text-3xl font-bold capitalize">{formatHuman(today)}</h1>
        </div>
        <Button onClick={openNew} className="bg-gradient-to-r from-primary to-circumstantial text-primary-foreground hover:opacity-90">
          <Plus className="mr-1 h-4 w-4" /> Nova tarefa
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={<Clock className="h-4 w-4" />} label="Total programado" value={formatMinutes(totalMinutes)} />
        <StatCard icon={<Clock className="h-4 w-4" />} label="Restante" value={formatMinutes(remainingMinutes)} accent />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Concluídas"
          value={`${completedCount} / ${sortedToday.length}`}
        />
      </div>

      {/* Tarefa rápida */}
      <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card/60 p-2 backdrop-blur-sm focus-within:border-primary/50 transition-colors">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Zap className="h-4 w-4" />
        </div>
        <Input
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleQuickAdd()}
          placeholder="Tarefa rápida — escreva e pressione Enter (Importante · 30 min · hoje)"
          className="border-0 bg-transparent shadow-none focus-visible:ring-0 px-0"
        />
        {quickTitle.trim() && (
          <Button size="sm" onClick={handleQuickAdd}>Adicionar</Button>
        )}
      </div>

      {tasksApi.overdueTasks.length > 0 && (
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
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Tarefas de hoje
        </h2>
        {sortedToday.length === 0 ? (
          <EmptyState onAdd={openNew} />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sortedToday.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {sortedToday.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    role={t.role_id ? rolesById.get(t.role_id) ?? null : null}
                    onToggle={() => tasksApi.toggleComplete(t)}
                    onEdit={() => openEdit(t)}
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
        defaultDate={today}
        task={editing}
        roles={roles}
        onSave={handleSave}
        onDelete={editing ? async () => { await tasksApi.deleteTask(editing.id); toast.success("Tarefa excluída"); } : undefined}
      />
    </div>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 backdrop-blur-sm ${accent ? "border-primary/40 bg-primary/10" : "border-border/60 bg-card/60"}`}>
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
      <p className="text-muted-foreground">Nenhuma tarefa para hoje. Comece criando uma.</p>
      <Button variant="outline" className="mt-4" onClick={onAdd}>
        <Plus className="mr-1 h-4 w-4" /> Adicionar tarefa
      </Button>
    </div>
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
