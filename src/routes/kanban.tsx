import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useTasks } from "@/hooks/useTasks";
import { useRoles } from "@/hooks/useRoles";
import {
  useProjects,
  computeProjectStats,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_ORDER,
  type Project,
  type ProjectStatus,
} from "@/hooks/useProjects";
import { todayISO, formatHuman, formatMinutes } from "@/lib/date";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  KanbanSquare,
  Layers,
  Users as UsersIcon,
} from "lucide-react";
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

type GroupMode = "status" | "role";

function KanbanPage() {
  const { user } = useAuth();
  if (!user) return null;
  return <KanbanInner userId={user.id} />;
}

function KanbanInner({ userId }: { userId: string }) {
  const today = todayISO();
  const projectsApi = useProjects(userId);
  const { roles } = useRoles(userId);
  const tasksApi = useTasks(userId);
  const [mode, setMode] = useState<GroupMode>("status");
  const [hideArchived, setHideArchived] = useState(true);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const tasksByProject = useMemo(() => {
    const map = new Map<string, typeof tasksApi.tasks>();
    for (const t of tasksApi.tasks) {
      const pid = t.project_id;
      if (!pid) continue;
      const arr = map.get(pid) ?? [];
      arr.push(t);
      map.set(pid, arr);
    }
    return map;
  }, [tasksApi.tasks]);

  const visibleProjects = useMemo(
    () => projectsApi.projects.filter((p) => !(hideArchived && p.status === "archived")),
    [projectsApi.projects, hideArchived]
  );

  // Columns based on mode
  const columns = useMemo(() => {
    if (mode === "status") {
      return PROJECT_STATUS_ORDER.map((s) => ({
        id: `status:${s}`,
        label: PROJECT_STATUS_LABEL[s],
        accent: statusAccent(s),
      }));
    }
    const roleCols = roles.map((r) => ({
      id: `role:${r.id}`,
      label: r.name,
      accent: "from-muted/30 to-muted/5",
      color: r.color,
    }));
    return [...roleCols, { id: "role:none", label: "Sem papel", accent: "from-muted/20 to-muted/5" }];
  }, [mode, roles]);

  const grouped = useMemo(() => {
    const out: Record<string, Project[]> = {};
    for (const c of columns) out[c.id] = [];
    for (const p of visibleProjects) {
      const key = mode === "status" ? `status:${p.status}` : `role:${p.role_id ?? "none"}`;
      if (!out[key]) out[key] = [];
      out[key].push(p);
    }
    return out;
  }, [visibleProjects, columns, mode]);

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const projectId = String(active.id);
    const targetCol = String(over.id);
    const project = visibleProjects.find((p) => p.id === projectId);
    if (!project) return;

    if (mode === "status") {
      const newStatus = targetCol.replace("status:", "") as ProjectStatus;
      if (project.status === newStatus) return;
      try {
        await projectsApi.updateProject(projectId, { status: newStatus });
        toast.success(`Movido para ${PROJECT_STATUS_LABEL[newStatus]}`);
      } catch {
        toast.error("Erro ao mover projeto");
      }
    } else {
      const raw = targetCol.replace("role:", "");
      const newRoleId = raw === "none" ? null : raw;
      if (project.role_id === newRoleId) return;
      try {
        await projectsApi.updateProject(projectId, { role_id: newRoleId });
        toast.success(newRoleId ? "Papel atualizado" : "Papel removido");
      } catch {
        toast.error("Erro ao mover projeto");
      }
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <KanbanSquare className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-display font-semibold">Kanban de projetos</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-card/50 p-1">
            <button
              onClick={() => setMode("status")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
                mode === "status" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layers className="h-3.5 w-3.5" /> Status
            </button>
            <button
              onClick={() => setMode("role")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
                mode === "role" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <UsersIcon className="h-3.5 w-3.5" /> Papel
            </button>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={hideArchived}
              onChange={(e) => setHideArchived(e.target.checked)}
            />
            Ocultar arquivados
          </label>
        </div>
      </header>

      {visibleProjects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-10 text-center">
          <KanbanSquare className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-muted-foreground">
            Nenhum projeto para exibir.{" "}
            <Link to="/projetos" className="text-primary underline-offset-4 hover:underline">
              Criar projeto
            </Link>
          </p>
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="overflow-x-auto pb-2">
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${columns.length}, minmax(260px, 1fr))`,
              }}
            >
              {columns.map((col) => (
                <Column
                  key={col.id}
                  id={col.id}
                  label={col.label}
                  accent={col.accent}
                  color={(col as any).color}
                  projects={grouped[col.id] ?? []}
                  rolesById={new Map(roles.map((r) => [r.id, r]))}
                  tasksByProject={tasksByProject}
                  today={today}
                />
              ))}
            </div>
          </div>
        </DndContext>
      )}
    </div>
  );
}

function statusAccent(s: ProjectStatus): string {
  switch (s) {
    case "active":
      return "from-primary/20 to-primary/5";
    case "draft":
      return "from-muted/40 to-muted/10";
    case "paused":
      return "from-amber-500/15 to-amber-500/5";
    case "done":
      return "from-emerald-500/20 to-emerald-500/5";
    case "archived":
      return "from-muted/30 to-muted/5";
  }
}

function Column({
  id,
  label,
  accent,
  color,
  projects,
  rolesById,
  tasksByProject,
  today,
}: {
  id: string;
  label: string;
  accent: string;
  color?: string;
  projects: Project[];
  rolesById: Map<string, { name: string; color: string }>;
  tasksByProject: Map<string, any[]>;
  today: string;
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
        <div className="flex items-center gap-2">
          {color && (
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          )}
          <h2 className="text-sm font-semibold">{label}</h2>
        </div>
        <span className="rounded-full bg-background/60 px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
          {projects.length}
        </span>
      </div>
      <div className="space-y-2">
        {projects.length === 0 && (
          <p className="text-center text-xs text-muted-foreground/60 py-6">Arraste projetos aqui</p>
        )}
        {projects.map((p) => (
          <KanbanProjectCard
            key={p.id}
            project={p}
            role={p.role_id ? rolesById.get(p.role_id) ?? null : null}
            tasks={tasksByProject.get(p.id) ?? []}
            today={today}
          />
        ))}
      </div>
    </div>
  );
}

function KanbanProjectCard({
  project,
  role,
  tasks,
  today,
}: {
  project: Project;
  role: { name: string; color: string } | null;
  tasks: any[];
  today: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: project.id });
  const stats = computeProjectStats(project, tasks, today);
  const pct = Math.round(stats.progress * 100);
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={{ ...style, borderTopColor: project.color, borderTopWidth: 3 }}
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm p-3 shadow-[var(--shadow-card)] hover:border-primary/40 transition-colors overflow-hidden"
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          to="/projetos/$id"
          params={{ id: project.id }}
          onPointerDown={(e) => e.stopPropagation()}
          className="font-display text-sm font-semibold leading-tight hover:text-primary transition-colors line-clamp-2"
        >
          {project.name}
        </Link>
      </div>

      {role && (
        <div className="mt-1.5">
          <span
            className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[10px] font-medium"
            style={{
              backgroundColor: `${role.color}20`,
              borderColor: `${role.color}55`,
              color: role.color,
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: role.color }} />
            {role.name}
          </span>
        </div>
      )}

      <div className="mt-2.5">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Progresso</span>
          <span className="tabular-nums font-medium">{pct}%</span>
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: project.color }}
          />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> {stats.done}/{stats.total}
        </span>
        {stats.estimatedMinutes > 0 && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> {formatMinutes(stats.estimatedMinutes)}
          </span>
        )}
        {project.deadline && (
          <span
            className={`inline-flex items-center gap-1 ${
              stats.isOverdue ? "text-overdue font-medium" : ""
            }`}
          >
            <Calendar className="h-3 w-3" />
            {stats.daysRemaining !== null && stats.daysRemaining < 0
              ? `${Math.abs(stats.daysRemaining)}d atraso`
              : formatHuman(project.deadline)}
          </span>
        )}
      </div>

      {stats.overdueTasks > 0 && (
        <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-overdue/10 px-1.5 py-0.5 text-[10px] font-medium text-overdue">
          <AlertTriangle className="h-2.5 w-2.5" /> {stats.overdueTasks} atrasada
          {stats.overdueTasks === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}
