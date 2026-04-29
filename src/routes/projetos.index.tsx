import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useProjects, computeProjectStats, PROJECT_STATUS_LABEL, PROJECT_STATUS_ORDER, type Project, type ProjectStatus } from "@/hooks/useProjects";
import { useRoles } from "@/hooks/useRoles";
import { useTasks } from "@/hooks/useTasks";
import { ProjectDialog } from "@/components/ProjectDialog";
import { ProjectStatusBadge } from "@/components/ProjectChip";
import { Button } from "@/components/ui/button";
import { FolderKanban, Plus, Calendar, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { todayISO, formatHuman, formatMinutes } from "@/lib/date";
import { toast } from "sonner";

export const Route = createFileRoute("/projetos/")({
  component: () => (
    <AppShell>
      <ProjectsPage />
    </AppShell>
  ),
});

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

  const tasksByProject = useMemo(() => {
    const map = new Map<string, typeof tasksApi.tasks>();
    for (const t of tasksApi.tasks) {
      const pid = (t as any).project_id as string | null;
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

  const grouped = useMemo(() => {
    const out: Record<ProjectStatus, Project[]> = {
      active: [],
      draft: [],
      paused: [],
      done: [],
      archived: [],
    };
    for (const p of filtered) out[p.status].push(p);
    return out;
  }, [filtered]);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (p: Project) => {
    setEditing(p);
    setDialogOpen(true);
  };

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
          className="bg-gradient-to-r from-primary to-circumstantial text-primary-foreground hover:opacity-90"
        >
          <Plus className="mr-1 h-4 w-4" /> Novo projeto
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
      ) : (
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
                      role={roles.find((r) => r.id === p.role_id) ?? null}
                      tasks={tasksByProject.get(p.id) ?? []}
                      today={today}
                      onEdit={() => openEdit(p)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
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

function ProjectCard({
  project,
  role,
  tasks,
  today,
  onEdit,
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
            {role && (
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
            )}
          </div>
        </div>
        <button
          onClick={onEdit}
          className="text-xs text-muted-foreground hover:text-foreground"
          title="Editar"
        >
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
            style={{
              width: `${pct}%`,
              backgroundColor: project.color,
            }}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <Stat icon={<CheckCircle2 className="h-3 w-3" />} label={`${stats.done}/${stats.total}`} sub="tarefas" />
        <Stat icon={<Clock className="h-3 w-3" />} label={formatMinutes(stats.estimatedMinutes)} sub="restante" />
        <Stat
          icon={<Calendar className="h-3 w-3" />}
          label={
            stats.daysRemaining === null
              ? "—"
              : stats.daysRemaining < 0
              ? `${Math.abs(stats.daysRemaining)}d`
              : `${stats.daysRemaining}d`
          }
          sub={
            stats.daysRemaining === null
              ? "sem prazo"
              : stats.daysRemaining < 0
              ? "atrasado"
              : "p/ prazo"
          }
          danger={stats.isOverdue}
        />
      </div>

      {stats.overdueTasks > 0 && (
        <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-overdue/10 px-2 py-0.5 text-[10px] font-medium text-overdue">
          <AlertTriangle className="h-2.5 w-2.5" /> {stats.overdueTasks} tarefa{stats.overdueTasks === 1 ? "" : "s"} atrasada{stats.overdueTasks === 1 ? "" : "s"}
        </div>
      )}

      {project.deadline && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          Prazo: <span className="capitalize">{formatHuman(project.deadline)}</span>
        </p>
      )}
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
