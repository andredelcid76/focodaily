import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import {
  useProjects,
  computeProjectStats,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_ORDER,
  type Project,
  type ProjectStatus,
} from "@/hooks/useProjects";
import { useRoles } from "@/hooks/useRoles";
import { useTasks } from "@/hooks/useTasks";
import { ProjectDialog } from "@/components/ProjectDialog";
import { ProjectStatusBadge } from "@/components/ProjectChip";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  FolderKanban,
  Plus,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  LayoutGrid,
  List,
  KanbanSquare,
  Users as UsersIcon,
  Layers,
} from "lucide-react";
import { todayISO, formatHuman, formatShort, formatMinutes } from "@/lib/date";
import { toast } from "sonner";
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

export const Route = createFileRoute("/projetos/")({
  component: () => (
    <AppShell>
      <ProjectsPage />
    </AppShell>
  ),
});

type ViewMode = "cards" | "list" | "kanban";
type KanbanGroup = "status" | "role";

function ProjectsPage() {
  const { user } = useAuth();
  if (!user) return null;
  return <ProjectsInner userId={user.id} />;
}

function ProjectsInner({ userId }: { userId: string }) {
  const projectsApi = useProjects(userId);
  const { roles } = useRoles(userId);
  const tasksApi = useTasks(userId);
  const today = todayISO();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [filterRole, setFilterRole] = useState<string | "all">("all");
  const [hideArchived, setHideArchived] = useState(true);
  const [view, setView] = useState<ViewMode>("cards");
  const [kanbanGroup, setKanbanGroup] = useState<KanbanGroup>("status");

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

  const filtered = useMemo(() => {
    return projectsApi.projects.filter((p) => {
      if (filterRole !== "all" && p.role_id !== filterRole) return false;
      if (hideArchived && p.status === "archived") return false;
      return true;
    });
  }, [projectsApi.projects, filterRole, hideArchived]);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (p: Project) => {
    setEditing(p);
    setDialogOpen(true);
  };

  const rolesById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Projetos</p>
          <h1 className="font-display text-3xl font-bold">
            <FolderKanban className="inline h-7 w-7 text-primary mr-2 -mt-1" />
            Seus projetos
          </h1>
        </div>
        <Button
          onClick={openNew}
          className="bg-gradient-prestige text-primary-foreground hover:opacity-90"
        >
          <Plus className="mr-1 h-4 w-4" /> Novo projeto
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-card/50 p-1">
          <ViewBtn active={view === "cards"} onClick={() => setView("cards")} icon={<LayoutGrid className="h-3.5 w-3.5" />} label="Cards" />
          <ViewBtn active={view === "list"} onClick={() => setView("list")} icon={<List className="h-3.5 w-3.5" />} label="Lista" />
          <ViewBtn active={view === "kanban"} onClick={() => setView("kanban")} icon={<KanbanSquare className="h-3.5 w-3.5" />} label="Kanban" />
        </div>

        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="h-9 rounded-md border border-input bg-card/60 px-3 text-sm"
        >
          <option value="all">Todos os papéis</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={hideArchived}
            onChange={(e) => setHideArchived(e.target.checked)}
          />
          Ocultar arquivados
        </label>

        {view === "kanban" && (
          <div className="ml-2 flex items-center gap-1 rounded-lg border border-border/60 bg-card/50 p-1">
            <button
              onClick={() => setKanbanGroup("status")}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
                kanbanGroup === "status" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layers className="h-3 w-3" /> Status
            </button>
            <button
              onClick={() => setKanbanGroup("role")}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
                kanbanGroup === "role" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <UsersIcon className="h-3 w-3" /> Papel
            </button>
          </div>
        )}

        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} projeto{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-10 text-center">
          <FolderKanban className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-muted-foreground">
            Nenhum projeto ainda. Crie seu primeiro para agrupar tarefas com um propósito comum.
          </p>
          <Button variant="outline" className="mt-4" onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" /> Novo projeto
          </Button>
        </div>
      ) : view === "cards" ? (
        <CardsView
          projects={filtered}
          rolesById={rolesById}
          tasksByProject={tasksByProject}
          today={today}
          onEdit={openEdit}
        />
      ) : view === "list" ? (
        <ListView
          projects={filtered}
          rolesById={rolesById}
          tasksByProject={tasksByProject}
          today={today}
          onEdit={openEdit}
        />
      ) : (
        <KanbanView
          projects={filtered}
          roles={roles}
          rolesById={rolesById}
          tasksByProject={tasksByProject}
          today={today}
          group={kanbanGroup}
          onMove={async (id, patch) => {
            try {
              await projectsApi.updateProject(id, patch);
            } catch {
              toast.error("Erro ao mover projeto");
            }
          }}
        />
      )}

      <ProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        project={editing}
        roles={roles}
        onSave={async (data) => {
          if (editing) {
            await projectsApi.updateProject(editing.id, data);
            toast.success("Projeto atualizado");
          } else {
            await projectsApi.createProject(data);
            toast.success("Projeto criado");
          }
        }}
        onDelete={
          editing
            ? async () => {
                await projectsApi.deleteProject(editing.id);
                toast.success("Projeto excluído");
              }
            : undefined
        }
      />
    </div>
  );
}

function ViewBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
        active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon} {label}
    </button>
  );
}

// ============== CARDS VIEW ==============

function CardsView({
  projects,
  rolesById,
  tasksByProject,
  today,
  onEdit,
}: {
  projects: Project[];
  rolesById: Map<string, { name: string; color: string }>;
  tasksByProject: Map<string, any[]>;
  today: string;
  onEdit: (p: Project) => void;
}) {
  const grouped = useMemo(() => {
    const out: Record<ProjectStatus, Project[]> = {
      active: [], draft: [], paused: [], done: [], archived: [],
    };
    for (const p of projects) out[p.status].push(p);
    return out;
  }, [projects]);

  return (
    <div className="space-y-6">
      {PROJECT_STATUS_ORDER.map((status) => {
        const group = grouped[status];
        if (group.length === 0) return null;
        return (
          <section key={status}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {PROJECT_STATUS_LABEL[status]} · {group.length}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  role={p.role_id ? rolesById.get(p.role_id) ?? null : null}
                  tasks={tasksByProject.get(p.id) ?? []}
                  today={today}
                  onEdit={() => onEdit(p)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ProjectCard({
  project, role, tasks, today, onEdit,
}: {
  project: Project;
  role: { name: string; color: string } | null;
  tasks: any[];
  today: string;
  onEdit: () => void;
}) {
  const stats = computeProjectStats(project, tasks, today);
  const pct = Math.round(stats.progress * 100);

  return (
    <div
      className="group relative rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm shadow-[var(--shadow-card)] hover:border-primary/40 transition-colors overflow-hidden"
      style={{ borderTopColor: project.color, borderTopWidth: 3 }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            to="/projetos/$id"
            params={{ id: project.id }}
            className="block font-display text-lg font-semibold leading-tight hover:text-primary transition-colors"
          >
            {project.name}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <ProjectStatusBadge status={project.status} />
            {role && <RoleChip role={role} />}
          </div>
        </div>
        <button onClick={onEdit} className="text-xs text-muted-foreground hover:text-foreground" title="Editar">
          Editar
        </button>
      </div>

      {project.description && (
        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{project.description}</p>
      )}

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Progresso</span>
          <span className="tabular-nums font-medium">{pct}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: project.color }}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <Stat icon={<CheckCircle2 className="h-3 w-3" />} label={`${stats.done}/${stats.total}`} sub="tarefas" />
        <Stat icon={<Clock className="h-3 w-3" />} label={formatMinutes(stats.estimatedMinutes)} sub="restante" />
        <Stat
          icon={<Calendar className="h-3 w-3" />}
          label={
            stats.daysRemaining === null ? "—" :
            stats.daysRemaining < 0 ? `${Math.abs(stats.daysRemaining)}d` : `${stats.daysRemaining}d`
          }
          sub={
            stats.daysRemaining === null ? "sem prazo" :
            stats.daysRemaining < 0 ? "atrasado" : "p/ prazo"
          }
          danger={stats.isOverdue}
        />
      </div>

      {stats.overdueTasks > 0 && (
        <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-overdue/10 px-2 py-0.5 text-[10px] font-medium text-overdue">
          <AlertTriangle className="h-2.5 w-2.5" /> {stats.overdueTasks} tarefa{stats.overdueTasks === 1 ? "" : "s"} atrasada{stats.overdueTasks === 1 ? "" : "s"}
        </div>
      )}

      <NextTaskRow stats={stats} />

      {project.deadline && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          Prazo: <span className="capitalize">{formatHuman(project.deadline)}</span>
        </p>
      )}
    </div>
  );
}

function NextTaskRow({ stats }: { stats: { nextTaskDate: string | null; nextTaskOverdue: boolean } }) {
  if (!stats.nextTaskDate) {
    return (
      <p className="mt-2 text-[10px] text-muted-foreground">
        Próxima tarefa: <span>sem tarefas abertas</span>
      </p>
    );
  }
  return (
    <div className="mt-2 flex items-center gap-1.5 text-[10px]">
      <span className="text-muted-foreground">Próxima tarefa:</span>
      <span className={`capitalize font-medium ${stats.nextTaskOverdue ? "text-overdue" : "text-foreground"}`}>
        {formatShort(stats.nextTaskDate)}
      </span>
      <span
        className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
          stats.nextTaskOverdue
            ? "bg-overdue/15 text-overdue border border-overdue/40"
            : "bg-green-500/15 text-green-600 border border-green-500/40"
        }`}
      >
        {stats.nextTaskOverdue ? "Atrasada" : "OK"}
      </span>
    </div>
  );
}

function Stat({ icon, label, sub, danger }: { icon: React.ReactNode; label: string; sub: string; danger?: boolean }) {
  return (
    <div className={`rounded-lg border border-border/60 bg-background/40 p-1.5 ${danger ? "border-overdue/40 text-overdue" : ""}`}>
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span className="text-[9px] uppercase tracking-wider">{sub}</span>
      </div>
      <div className={`mt-0.5 font-semibold tabular-nums ${danger ? "text-overdue" : ""}`}>{label}</div>
    </div>
  );
}

function RoleChip({ role }: { role: { name: string; color: string } }) {
  return (
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
  );
}

// ============== LIST VIEW ==============

function ListView({
  projects, rolesById, tasksByProject, today, onEdit,
}: {
  projects: Project[];
  rolesById: Map<string, { name: string; color: string }>;
  tasksByProject: Map<string, any[]>;
  today: string;
  onEdit: (p: Project) => void;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-muted-foreground">
            <tr className="text-left text-xs uppercase tracking-wider">
              <th className="px-3 py-2 font-semibold">Projeto</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Papel</th>
              <th className="px-3 py-2 font-semibold text-right">Progresso</th>
              <th className="px-3 py-2 font-semibold text-right">Tarefas</th>
              <th className="px-3 py-2 font-semibold">Prazo</th>
              <th className="px-3 py-2 font-semibold">Próxima tarefa</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => {
              const stats = computeProjectStats(p, tasksByProject.get(p.id) ?? [], today);
              const pct = Math.round(stats.progress * 100);
              const role = p.role_id ? rolesById.get(p.role_id) ?? null : null;
              return (
                <tr key={p.id} className="border-t border-border/40 hover:bg-muted/20">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                      <Link
                        to="/projetos/$id"
                        params={{ id: p.id }}
                        className="font-medium hover:text-primary"
                      >
                        {p.name}
                      </Link>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <ProjectStatusBadge status={p.status} />
                  </td>
                  <td className="px-3 py-2">
                    {role ? <RoleChip role={role} /> : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: p.color }} />
                      </div>
                      <span className="tabular-nums text-xs w-9 text-right">{pct}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs">
                    {stats.done}/{stats.total}
                    {stats.overdueTasks > 0 && (
                      <span className="ml-1 text-overdue">({stats.overdueTasks}↓)</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {p.deadline ? (
                      <span className={stats.isOverdue ? "text-overdue font-medium" : "text-muted-foreground"}>
                        {formatHuman(p.deadline)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {stats.nextTaskDate ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`capitalize ${stats.nextTaskOverdue ? "text-overdue font-medium" : ""}`}>
                          {formatShort(stats.nextTaskDate)}
                        </span>
                        <span
                          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                            stats.nextTaskOverdue
                              ? "bg-overdue/15 text-overdue border border-overdue/40"
                              : "bg-green-500/15 text-green-600 border border-green-500/40"
                          }`}
                        >
                          {stats.nextTaskOverdue ? "Atrasada" : "OK"}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => onEdit(p)} className="text-xs text-muted-foreground hover:text-foreground">
                      Editar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============== KANBAN VIEW ==============

function KanbanView({
  projects, roles, rolesById, tasksByProject, today, group, onMove,
}: {
  projects: Project[];
  roles: { id: string; name: string; color: string }[];
  rolesById: Map<string, { name: string; color: string }>;
  tasksByProject: Map<string, any[]>;
  today: string;
  group: KanbanGroup;
  onMove: (id: string, patch: Partial<Project>) => Promise<void>;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const columns = useMemo(() => {
    if (group === "status") {
      return PROJECT_STATUS_ORDER.map((s) => ({
        id: `status:${s}`,
        label: PROJECT_STATUS_LABEL[s],
      }));
    }
    return [
      ...roles.map((r) => ({ id: `role:${r.id}`, label: r.name, color: r.color })),
      { id: "role:none", label: "Sem papel" },
    ];
  }, [group, roles]);

  const grouped = useMemo(() => {
    const out: Record<string, Project[]> = {};
    for (const c of columns) out[c.id] = [];
    for (const p of projects) {
      const key = group === "status" ? `status:${p.status}` : `role:${p.role_id ?? "none"}`;
      if (!out[key]) out[key] = [];
      out[key].push(p);
    }
    return out;
  }, [projects, columns, group]);

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const projectId = String(active.id);
    const targetCol = String(over.id);
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    if (group === "status") {
      const newStatus = targetCol.replace("status:", "") as ProjectStatus;
      if (project.status === newStatus) return;
      await onMove(projectId, { status: newStatus });
      toast.success(`Movido para ${PROJECT_STATUS_LABEL[newStatus]}`);
    } else {
      const raw = targetCol.replace("role:", "");
      const newRoleId = raw === "none" ? null : raw;
      if (project.role_id === newRoleId) return;
      await onMove(projectId, { role_id: newRoleId });
      toast.success(newRoleId ? "Papel atualizado" : "Papel removido");
    }
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto pb-2">
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(260px, 1fr))` }}
        >
          {columns.map((col) => (
            <KanbanCol
              key={col.id}
              id={col.id}
              label={col.label}
              color={(col as any).color}
              projects={grouped[col.id] ?? []}
              rolesById={rolesById}
              tasksByProject={tasksByProject}
              today={today}
            />
          ))}
        </div>
      </div>
    </DndContext>
  );
}

function KanbanCol({
  id, label, color, projects, rolesById, tasksByProject, today,
}: {
  id: string;
  label: string;
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
      className={`rounded-2xl border bg-card/40 backdrop-blur-sm p-3 transition-colors min-h-[200px] ${
        isOver ? "border-primary/60 ring-1 ring-primary/30" : "border-border/60"
      }`}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          {color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
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
  project, role, tasks, today,
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
      className="cursor-grab active:cursor-grabbing rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm p-3 shadow-[var(--shadow-card)] hover:border-primary/40 transition-colors overflow-hidden touch-none"
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

      {role && <div className="mt-1.5"><RoleChip role={role} /></div>}

      <div className="mt-2.5">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Progresso</span>
          <span className="tabular-nums font-medium">{pct}%</span>
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: project.color }} />
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
          <span className={`inline-flex items-center gap-1 ${stats.isOverdue ? "text-overdue font-medium" : ""}`}>
            <Calendar className="h-3 w-3" />
            {stats.daysRemaining !== null && stats.daysRemaining < 0
              ? `${Math.abs(stats.daysRemaining)}d atraso`
              : formatHuman(project.deadline)}
          </span>
        )}
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 text-[10px]">
        <span className="text-muted-foreground">Próx.:</span>
        {stats.nextTaskDate ? (
          <>
            <span className={`capitalize ${stats.nextTaskOverdue ? "text-overdue font-medium" : "text-foreground"}`}>
              {formatShort(stats.nextTaskDate)}
            </span>
            <span
              className={`inline-flex items-center rounded px-1 py-0.5 text-[9px] font-semibold uppercase ${
                stats.nextTaskOverdue
                  ? "bg-overdue/15 text-overdue border border-overdue/40"
                  : "bg-green-500/15 text-green-600 border border-green-500/40"
              }`}
            >
              {stats.nextTaskOverdue ? "Atrasada" : "OK"}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>

      {stats.overdueTasks > 0 && (
        <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-overdue/10 px-1.5 py-0.5 text-[10px] font-medium text-overdue">
          <AlertTriangle className="h-2.5 w-2.5" /> {stats.overdueTasks} atrasada{stats.overdueTasks === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}
