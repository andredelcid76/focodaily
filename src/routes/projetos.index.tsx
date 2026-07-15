import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useStickyState, setSerialize, setDeserialize } from "@/hooks/useStickyState";
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
  GanttChart,
  Crown,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useProfiles } from "@/hooks/useProfiles";
import { todayISO, formatHuman, formatShort, formatMinutes } from "@/lib/date";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/projetos/")({
  component: () => (
    <AppShell>
      <ProjectsPage />
    </AppShell>
  ),
});

type ViewMode = "cards" | "list" | "kanban" | "timeline";
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
  const [filterRole, setFilterRole] = useStickyState<string | "all">("projetos:filterRole", "all");
  const [scope, setScope] = useStickyState<"all" | "personal" | "team">("projetos:scope", "all");
  const [ownership, setOwnership] = useStickyState<"all" | "mine" | "invited">("projetos:ownership", "all");
  const [hideFinished, setHideFinished] = useStickyState<boolean>("projetos:hideFinished", true);
  const [statusFilter, setStatusFilter] = useStickyState<Set<ProjectStatus>>(
    "projetos:statusFilter",
    new Set(),
    { serialize: setSerialize, deserialize: setDeserialize<ProjectStatus> },
  );
  const [view, setView] = useStickyState<ViewMode>("projetos:view", "kanban");
  const [kanbanGroup, setKanbanGroup] = useStickyState<KanbanGroup>("projetos:kanbanGroup", "status");

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
    const hasStatusFilter = statusFilter.size > 0;
    return projectsApi.projects.filter((p) => {
      if (filterRole !== "all" && p.role_id !== filterRole) return false;
      if (hasStatusFilter) {
        if (!statusFilter.has(p.status)) return false;
      } else if (hideFinished && p.status === "finished") return false;
      if (scope === "personal" && p.team_id) return false;
      if (scope === "team" && !p.team_id) return false;
      if (ownership === "mine" && p.user_id !== userId) return false;
      if (ownership === "invited" && p.user_id === userId) return false;
      return true;
    });
  }, [projectsApi.projects, filterRole, hideFinished, statusFilter, scope, ownership, userId]);

  const canEdit = useCallback((p: Project) => p.user_id === userId, [userId]);


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
            Projetos
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
          <ViewBtn active={view === "list"} onClick={() => setView("list")} icon={<List className="h-3.5 w-3.5" />} label="Tabela" />
          <ViewBtn active={view === "kanban"} onClick={() => setView("kanban")} icon={<KanbanSquare className="h-3.5 w-3.5" />} label="Kanban" />
          <ViewBtn active={view === "timeline"} onClick={() => setView("timeline")} icon={<GanttChart className="h-3.5 w-3.5" />} label="Cronograma" />
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-card/50 p-1">
          <ViewBtn active={scope === "all"} onClick={() => setScope("all")} icon={<Layers className="h-3.5 w-3.5" />} label="Todos" />
          <ViewBtn active={scope === "personal"} onClick={() => setScope("personal")} icon={<FolderKanban className="h-3.5 w-3.5" />} label="Pessoais" />
          <ViewBtn active={scope === "team"} onClick={() => setScope("team")} icon={<UsersIcon className="h-3.5 w-3.5" />} label="Equipe" />
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-card/50 p-1">
          <ViewBtn active={ownership === "all"} onClick={() => setOwnership("all")} icon={<Layers className="h-3.5 w-3.5" />} label="Todos" />
          <ViewBtn active={ownership === "mine"} onClick={() => setOwnership("mine")} icon={<FolderKanban className="h-3.5 w-3.5" />} label="Meus" />
          <ViewBtn active={ownership === "invited"} onClick={() => setOwnership("invited")} icon={<UsersIcon className="h-3.5 w-3.5" />} label="Convidado" />
        </div>



        <Select value={filterRole} onValueChange={(v) => setFilterRole(v)}>
          <SelectTrigger className="h-9 w-[180px] text-sm">
            <SelectValue placeholder="Todos os papéis" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os papéis</SelectItem>
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

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={`h-9 gap-1.5 ${statusFilter.size > 0 ? "border-primary/50 text-primary" : ""}`}
            >
              <Filter className="h-3.5 w-3.5" />
              Status
              {statusFilter.size > 0 && (
                <span className="ml-1 rounded-full bg-primary/20 px-1.5 text-[10px] font-semibold tabular-nums">
                  {statusFilter.size}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</p>
              {statusFilter.size > 0 && (
                <button
                  onClick={() => setStatusFilter(new Set())}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" /> Limpar
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PROJECT_STATUS_ORDER.map((s) => {
                const active = statusFilter.has(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      const next = new Set(statusFilter);
                      if (next.has(s)) next.delete(s);
                      else next.add(s);
                      setStatusFilter(next);
                    }}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                      active
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground hover:border-primary/40"
                    }`}
                  >
                    {PROJECT_STATUS_LABEL[s]}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        <Label className="inline-flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
          <Checkbox
            checked={hideFinished}
            onCheckedChange={(c) => setHideFinished(c === true)}
            disabled={statusFilter.size > 0}
          />
          Ocultar finalizados
        </Label>


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
          canEdit={canEdit}
        />
      ) : view === "list" ? (
        <ListView
          projects={filtered}
          rolesById={rolesById}
          tasksByProject={tasksByProject}
          today={today}
          onEdit={openEdit}
          canEdit={canEdit}
        />
      ) : view === "timeline" ? (
        <ProjectsTimelineView
          projects={filtered}
          rolesById={rolesById}
          tasksByProject={tasksByProject}
          today={today}
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
  canEdit,
}: {
  projects: Project[];
  rolesById: Map<string, { name: string; color: string }>;
  tasksByProject: Map<string, any[]>;
  today: string;
  onEdit: (p: Project) => void;
  canEdit: (p: Project) => boolean;
}) {
  const ownerIds = useMemo(() => projects.map((p) => p.user_id), [projects]);
  const profiles = useProfiles(ownerIds);

  const grouped = useMemo(() => {
    const out: Record<ProjectStatus, Project[]> = {
      active: [], in_progress: [], paused: [], not_started: [], finished: [],
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
              {group.map((p) => {
                const leader = profiles.get(p.user_id);
                const leaderName =
                  leader?.display_name?.trim() || leader?.email?.split("@")[0] || "—";
                return (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    role={p.role_id ? rolesById.get(p.role_id) ?? null : null}
                    tasks={tasksByProject.get(p.id) ?? []}
                    today={today}
                    leaderName={leaderName}
                    onEdit={canEdit(p) ? () => onEdit(p) : null}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ProjectCard({
  project, role, tasks, today, leaderName, onEdit,
}: {
  project: Project;
  role: { name: string; color: string } | null;
  tasks: any[];
  today: string;
  leaderName: string;
  onEdit: (() => void) | null;
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
            <span
              className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[10px] font-medium text-amber-600"
              title="Líder do projeto"
            >
              <Crown className="h-2.5 w-2.5" /> {leaderName}
            </span>
          </div>
        </div>
        {onEdit && (
          <button onClick={onEdit} className="text-xs text-muted-foreground hover:text-foreground" title="Editar">
            Editar
          </button>
        )}
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
            : "bg-primary/15 text-primary border border-primary/40"
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

type SortKey = "name" | "status" | "role" | "progress" | "tasks" | "deadline" | "nextTask";
type SortDir = "asc" | "desc";
type DeadlineFilter = "all" | "overdue" | "today" | "week" | "later" | "none";
type ProgressFilter = "all" | "not_started" | "in_progress" | "done";

function ListView({
  projects, rolesById, tasksByProject, today, onEdit, canEdit,
}: {
  projects: Project[];
  rolesById: Map<string, { name: string; color: string }>;
  tasksByProject: Map<string, any[]>;
  today: string;
  onEdit: (p: Project) => void;
  canEdit: (p: Project) => boolean;
}) {
  const [sortKey, setSortKey] = useStickyState<SortKey>("projetos:list:sortKey", "name");
  const [sortDir, setSortDir] = useStickyState<SortDir>("projetos:list:sortDir", "asc");
  const [search, setSearch] = useStickyState<string>("projetos:list:search", "");
  const [statusFilter, setStatusFilter] = useStickyState<ProjectStatus | "all">("projetos:list:status", "all");
  const [deadlineFilter, setDeadlineFilter] = useStickyState<DeadlineFilter>("projetos:list:deadline", "all");
  const [progressFilter, setProgressFilter] = useStickyState<ProgressFilter>("projetos:list:progress", "all");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const rows = useMemo(() => {
    const enriched = projects.map((p) => {
      const stats = computeProjectStats(p, tasksByProject.get(p.id) ?? [], today);
      const role = p.role_id ? rolesById.get(p.role_id) ?? null : null;
      return { p, stats, role };
    });

    const inWeek = (iso: string) => {
      const d = new Date(iso).getTime();
      const t = new Date(today).getTime();
      const diff = (d - t) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 7;
    };

    const filtered = enriched.filter(({ p, stats }) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (progressFilter === "not_started" && stats.progress > 0) return false;
      if (progressFilter === "in_progress" && (stats.progress === 0 || stats.progress >= 1)) return false;
      if (progressFilter === "done" && stats.progress < 1) return false;
      if (deadlineFilter !== "all") {
        if (deadlineFilter === "none" && p.deadline) return false;
        if (deadlineFilter !== "none" && !p.deadline) return false;
        if (deadlineFilter === "overdue" && !(p.deadline && p.deadline < today)) return false;
        if (deadlineFilter === "today" && !(p.deadline && p.deadline === today)) return false;
        if (deadlineFilter === "week" && !(p.deadline && inWeek(p.deadline))) return false;
        if (deadlineFilter === "later" && !(p.deadline && p.deadline > today && !inWeek(p.deadline))) return false;
      }
      return true;
    });

    const cmp = (a: typeof enriched[number], b: typeof enriched[number]) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const nullLast = (v: any) => (v === null || v === undefined || v === "" ? 1 : 0);
      switch (sortKey) {
        case "name":
          return dir * a.p.name.localeCompare(b.p.name);
        case "status":
          return dir * (PROJECT_STATUS_ORDER.indexOf(a.p.status) - PROJECT_STATUS_ORDER.indexOf(b.p.status));
        case "role": {
          const an = a.role?.name ?? "";
          const bn = b.role?.name ?? "";
          const nl = nullLast(an) - nullLast(bn);
          if (nl !== 0) return nl;
          return dir * an.localeCompare(bn);
        }
        case "progress":
          return dir * (a.stats.progress - b.stats.progress);
        case "tasks":
          return dir * (a.stats.total - b.stats.total);
        case "deadline": {
          const nl = nullLast(a.p.deadline) - nullLast(b.p.deadline);
          if (nl !== 0) return nl;
          return dir * String(a.p.deadline ?? "").localeCompare(String(b.p.deadline ?? ""));
        }
        case "nextTask": {
          const nl = nullLast(a.stats.nextTaskDate) - nullLast(b.stats.nextTaskDate);
          if (nl !== 0) return nl;
          return dir * String(a.stats.nextTaskDate ?? "").localeCompare(String(b.stats.nextTaskDate ?? ""));
        }
      }
    };

    return [...filtered].sort(cmp);
  }, [projects, tasksByProject, rolesById, today, search, statusFilter, deadlineFilter, progressFilter, sortKey, sortDir]);

  const hasFilters = search !== "" || statusFilter !== "all" || deadlineFilter !== "all" || progressFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setDeadlineFilter("all");
    setProgressFilter("all");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card/40 p-2 backdrop-blur-sm">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar projeto..."
            className="h-8 pl-7 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ProjectStatus | "all")}>
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            {PROJECT_STATUS_ORDER.map((s) => (
              <SelectItem key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={deadlineFilter} onValueChange={(v) => setDeadlineFilter(v as DeadlineFilter)}>
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue placeholder="Prazo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos prazos</SelectItem>
            <SelectItem value="overdue">Atrasados</SelectItem>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="week">Próxima semana</SelectItem>
            <SelectItem value="later">Mais tarde</SelectItem>
            <SelectItem value="none">Sem prazo</SelectItem>
          </SelectContent>
        </Select>
        <Select value={progressFilter} onValueChange={(v) => setProgressFilter(v as ProgressFilter)}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="Progresso" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo progresso</SelectItem>
            <SelectItem value="not_started">Não iniciado</SelectItem>
            <SelectItem value="in_progress">Em andamento</SelectItem>
            <SelectItem value="done">Concluído</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}>
            <X className="mr-1 h-3 w-3" /> Limpar
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {rows.length} de {projects.length}
        </span>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr className="text-left text-xs uppercase tracking-wider">
                <SortTh label="Projeto" k="name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortTh label="Status" k="status" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortTh label="Papel" k="role" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortTh label="Progresso" k="progress" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                <SortTh label="Tarefas" k="tasks" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                <SortTh label="Prazo" k="deadline" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortTh label="Próxima tarefa" k="nextTask" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-xs text-muted-foreground">
                    Nenhum projeto corresponde aos filtros.
                  </td>
                </tr>
              ) : rows.map(({ p, stats, role }) => {
                const pct = Math.round(stats.progress * 100);
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
                                : "bg-primary/15 text-primary border border-primary/40"
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
                      {canEdit(p) && (
                        <button onClick={() => onEdit(p)} className="text-xs text-muted-foreground hover:text-foreground">
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SortTh({
  label, k, sortKey, sortDir, onClick, align,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onClick: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === k;
  return (
    <th className={`px-3 py-2 font-semibold ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        onClick={() => onClick(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${active ? "text-foreground" : ""}`}
      >
        {label}
        {active ? (
          sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
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
  const [localOrder, setLocalOrder] = useState<Record<string, string[]>>({});

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
    // Apply optimistic local order overrides
    for (const colId of Object.keys(out)) {
      const order = localOrder[colId];
      if (!order) continue;
      const byId = new Map(out[colId].map((p) => [p.id, p]));
      const ordered: Project[] = [];
      for (const id of order) {
        const p = byId.get(id);
        if (p) { ordered.push(p); byId.delete(id); }
      }
      // Any new items not in saved order go to the end
      for (const p of byId.values()) ordered.push(p);
      out[colId] = ordered;
    }
    return out;
  }, [projects, columns, group, localOrder]);

  const findCol = (id: string): string | null => {
    if (id.startsWith("status:") || id.startsWith("role:")) return id;
    for (const colId of Object.keys(grouped)) {
      if (grouped[colId].some((p) => p.id === id)) return colId;
    }
    return null;
  };

  const persistOrder = async (orderedIds: string[]) => {
    const { error } = await supabase.rpc("reorder_projects", { p_ordered_ids: orderedIds });
    if (error) {
      toast.error("Não foi possível salvar a prioridade");
      // eslint-disable-next-line no-console
      console.error(error);
    }
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const projectId = String(active.id);
    const overId = String(over.id);
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    const fromCol = findCol(projectId);
    const toCol = findCol(overId);
    if (!fromCol || !toCol) return;

    // Same column → reorder (priority change)
    if (fromCol === toCol) {
      if (projectId === overId) return;
      const ids = grouped[fromCol].map((p) => p.id);
      const oldIdx = ids.indexOf(projectId);
      const newIdx = ids.indexOf(overId);
      if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return;
      const reordered = arrayMove(ids, oldIdx, newIdx);
      // Optimistic UI: update numbering immediately
      setLocalOrder((prev) => ({ ...prev, [fromCol]: reordered }));
      void persistOrder(reordered);
      return;
    }


    // Cross-column → status/role change
    if (group === "status") {
      const newStatus = toCol.replace("status:", "") as ProjectStatus;
      if (project.status === newStatus) return;
      await onMove(projectId, { status: newStatus });
      toast.success(`Movido para ${PROJECT_STATUS_LABEL[newStatus]}`);
    } else {
      const raw = toCol.replace("role:", "");
      const newRoleId = raw === "none" ? null : raw;
      if (project.role_id === newRoleId) return;
      await onMove(projectId, { role_id: newRoleId });
      toast.success(newRoleId ? "Papel atualizado" : "Papel removido");
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
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
      <SortableContext items={projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {projects.length === 0 && (
            <p className="text-center text-xs text-muted-foreground/60 py-6">Arraste projetos aqui</p>
          )}
          {projects.map((p, idx) => (
            <KanbanProjectCard
              key={p.id}
              project={p}
              role={p.role_id ? rolesById.get(p.role_id) ?? null : null}
              tasks={tasksByProject.get(p.id) ?? []}
              today={today}
              priority={idx + 1}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

function KanbanProjectCard({
  project, role, tasks, today, priority,
}: {
  project: Project;
  role: { name: string; color: string } | null;
  tasks: any[];
  today: string;
  priority: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id });
  const stats = computeProjectStats(project, tasks, today);
  const pct = Math.round(stats.progress * 100);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
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
        <div className="flex items-start gap-2 min-w-0">
          <span
            className="mt-0.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md bg-primary/15 px-1 text-[10px] font-bold text-primary tabular-nums"
            title={`Prioridade #${priority}`}
          >
            #{priority}
          </span>
          <Link
            to="/projetos/$id"
            params={{ id: project.id }}
            onPointerDown={(e) => e.stopPropagation()}
            className="font-display text-sm font-semibold leading-tight hover:text-primary transition-colors line-clamp-2"
          >
            {project.name}
          </Link>
        </div>
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
                  : "bg-primary/15 text-primary border border-primary/40"
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

// ============== TIMELINE / GANTT VIEW ==============
type TimelineScale = "day" | "week" | "month" | "quarter";

const SCALE_LABEL: Record<TimelineScale, string> = {
  day: "Dia",
  week: "Semana",
  month: "Mês",
  quarter: "Trimestre",
};

// Number of days visible in the window for each scale
const SCALE_WINDOW_DAYS: Record<TimelineScale, number> = {
  day: 14,
  week: 56,   // ~8 weeks
  month: 90,  // ~3 months
  quarter: 365, // ~1 year
};

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function fmtISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDaysDate(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}
function startOfMonthDate(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonthsDate(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}
function startOfQuarterDate(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}

const MONTH_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function ProjectsTimelineView({
  projects, rolesById, tasksByProject, today,
}: {
  projects: Project[];
  rolesById: Map<string, { name: string; color: string }>;
  tasksByProject: Map<string, any[]>;
  today: string;
}) {
  const [scale, setScale] = useState<TimelineScale>("month");
  const [anchor, setAnchor] = useState<string>(today); // start-of-window (ISO)

  const items = useMemo(() => {
    return projects
      .map((p) => {
        const start = p.starts_on ?? (p as any).created_at?.slice(0, 10) ?? null;
        const end = p.deadline ?? start;
        return { project: p, start, end, hasStart: !!p.starts_on };
      })
      .sort((a, b) => {
        // Projects without start_on first, then by start
        if (!a.start && b.start) return -1;
        if (a.start && !b.start) return 1;
        return String(a.start ?? "").localeCompare(String(b.start ?? ""));
      });
  }, [projects]);

  // Compute window
  const windowDays = SCALE_WINDOW_DAYS[scale];
  const anchorDate = useMemo(() => {
    const a = parseISO(anchor);
    if (scale === "month") return startOfMonthDate(a);
    if (scale === "quarter") return startOfQuarterDate(a);
    return a;
  }, [anchor, scale]);
  const windowStart = anchorDate;
  const windowEnd = addDaysDate(windowStart, windowDays);
  const windowStartT = windowStart.getTime();
  const windowSpanMs = windowEnd.getTime() - windowStartT;

  const shift = (dir: 1 | -1) => {
    let next: Date;
    if (scale === "day") next = addDaysDate(anchorDate, 7 * dir);
    else if (scale === "week") next = addDaysDate(anchorDate, 28 * dir);
    else if (scale === "month") next = addMonthsDate(anchorDate, 1 * dir);
    else next = addMonthsDate(anchorDate, 3 * dir);
    setAnchor(fmtISO(next));
  };
  const goToday = () => setAnchor(today);

  // Ruler ticks
  const ticks = useMemo(() => {
    const out: { pctLeft: number; label: string; strong: boolean }[] = [];
    if (scale === "day") {
      for (let i = 0; i <= windowDays; i++) {
        const d = addDaysDate(windowStart, i);
        const left = ((d.getTime() - windowStartT) / windowSpanMs) * 100;
        out.push({
          pctLeft: left,
          label: `${String(d.getDate()).padStart(2, "0")}/${MONTH_ABBR[d.getMonth()]}`,
          strong: d.getDate() === 1,
        });
      }
    } else if (scale === "week") {
      let cur = new Date(windowStart);
      // align to Monday
      const dow = cur.getDay();
      const diff = dow === 0 ? -6 : 1 - dow;
      cur = addDaysDate(cur, diff);
      while (cur.getTime() <= windowEnd.getTime()) {
        const left = ((cur.getTime() - windowStartT) / windowSpanMs) * 100;
        out.push({
          pctLeft: left,
          label: `${String(cur.getDate()).padStart(2, "0")}/${MONTH_ABBR[cur.getMonth()]}`,
          strong: cur.getDate() <= 7,
        });
        cur = addDaysDate(cur, 7);
      }
    } else if (scale === "month") {
      let cur = startOfMonthDate(windowStart);
      while (cur.getTime() <= windowEnd.getTime()) {
        const left = ((cur.getTime() - windowStartT) / windowSpanMs) * 100;
        out.push({
          pctLeft: left,
          label: `${MONTH_ABBR[cur.getMonth()]} ${String(cur.getFullYear()).slice(2)}`,
          strong: cur.getMonth() === 0,
        });
        cur = addMonthsDate(cur, 1);
      }
    } else {
      let cur = startOfQuarterDate(windowStart);
      while (cur.getTime() <= windowEnd.getTime()) {
        const left = ((cur.getTime() - windowStartT) / windowSpanMs) * 100;
        const q = Math.floor(cur.getMonth() / 3) + 1;
        out.push({
          pctLeft: left,
          label: `T${q} ${cur.getFullYear()}`,
          strong: q === 1,
        });
        cur = addMonthsDate(cur, 3);
      }
    }
    return out;
  }, [scale, windowStart, windowEnd, windowSpanMs, windowStartT, windowDays]);

  const todayT = parseISO(today).getTime();
  const todayPct = ((todayT - windowStartT) / windowSpanMs) * 100;

  const windowLabel = useMemo(() => {
    const s = windowStart;
    const e = addDaysDate(windowEnd, -1);
    const sameYear = s.getFullYear() === e.getFullYear();
    const sLabel = `${MONTH_ABBR[s.getMonth()]} ${s.getFullYear()}`;
    const eLabel = `${MONTH_ABBR[e.getMonth()]} ${e.getFullYear()}`;
    if (sameYear && s.getMonth() === e.getMonth()) return sLabel;
    return `${sLabel} – ${eLabel}`;
  }, [windowStart, windowEnd]);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-10 text-center">
        <p className="text-sm text-muted-foreground">Nenhum projeto para exibir no cronograma.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-4 backdrop-blur-sm">
      {/* Controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-card/50 p-1">
          {(Object.keys(SCALE_LABEL) as TimelineScale[]).map((s) => (
            <button
              key={s}
              onClick={() => setScale(s)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                scale === s ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {SCALE_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => shift(-1)} aria-label="Anterior">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={goToday}>
            Hoje
          </Button>
          <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => shift(1)} aria-label="Próximo">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        <span className="text-xs font-medium text-muted-foreground capitalize">{windowLabel}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">{items.length} projeto{items.length === 1 ? "" : "s"}</span>
      </div>

      {/* Chart */}
      <div className="flex overflow-hidden rounded-lg border border-border/40">
        {/* Fixed left name column */}
        <div className="w-[200px] shrink-0 border-r border-border/40 bg-muted/20">
          <div className="h-8 border-b border-border/40 px-3 flex items-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Projeto
          </div>
          {items.map(({ project }, idx) => (
            <div
              key={project.id}
              className={`h-10 flex items-center px-3 border-b border-border/30 last:border-b-0 ${idx % 2 === 1 ? "bg-background/30" : ""}`}
            >
              <Link
                to="/projetos/$id"
                params={{ id: project.id }}
                className="truncate text-xs font-medium hover:text-primary"
              >
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: project.color }} />
                {project.name}
              </Link>
            </div>
          ))}
        </div>

        {/* Right chart area */}
        <div className="relative flex-1 min-w-0">
          {/* Ruler */}
          <div className="relative h-8 border-b border-border/40 bg-muted/10">
            {ticks.map((t, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 flex items-center"
                style={{ left: `${t.pctLeft}%` }}
              >
                <div className={`h-full w-px ${t.strong ? "bg-border" : "bg-border/40"}`} />
                <span className={`ml-1 text-[10px] ${t.strong ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                  {t.label}
                </span>
              </div>
            ))}
          </div>

          {/* Rows */}
          <div className="relative">
            {/* Grid lines */}
            <div className="pointer-events-none absolute inset-0">
              {ticks.map((t, i) => (
                <div
                  key={i}
                  className={`absolute top-0 bottom-0 w-px ${t.strong ? "bg-border/60" : "bg-border/25"}`}
                  style={{ left: `${t.pctLeft}%` }}
                />
              ))}
            </div>
            {/* Today marker */}
            {todayPct >= 0 && todayPct <= 100 && (
              <div
                className="pointer-events-none absolute inset-y-0 z-10 w-px border-l border-dashed border-primary/70"
                style={{ left: `${todayPct}%` }}
              >
                <span className="absolute -top-6 -translate-x-1/2 rounded bg-primary px-1 py-0.5 text-[9px] font-semibold text-primary-foreground">
                  hoje
                </span>
              </div>
            )}

            {items.map(({ project, start, end, hasStart }, idx) => {
              const stats = computeProjectStats(project, tasksByProject.get(project.id) ?? [], today);
              const role = project.role_id ? rolesById.get(project.role_id) ?? null : null;
              const isOverdue = stats.isOverdue;

              // No start date -> render placeholder row
              if (!start) {
                return (
                  <div
                    key={project.id}
                    className={`relative h-10 border-b border-border/30 last:border-b-0 ${idx % 2 === 1 ? "bg-background/30" : ""}`}
                  >
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] italic text-muted-foreground">
                      sem data de início
                    </span>
                  </div>
                );
              }

              const sT = parseISO(start).getTime();
              const eT = parseISO(end ?? start).getTime();
              const clampedS = Math.max(sT, windowStartT);
              const clampedE = Math.min(Math.max(eT, sT + 86400000), windowStartT + windowSpanMs);
              const visible = clampedE > windowStartT && clampedS < windowStartT + windowSpanMs;
              const left = ((clampedS - windowStartT) / windowSpanMs) * 100;
              const width = Math.max(0.5, ((clampedE - clampedS) / windowSpanMs) * 100);
              const overflowsLeft = sT < windowStartT;
              const overflowsRight = eT > windowStartT + windowSpanMs;

              return (
                <div
                  key={project.id}
                  className={`relative h-10 border-b border-border/30 last:border-b-0 ${idx % 2 === 1 ? "bg-background/30" : ""}`}
                >
                  {visible ? (
                    <Link
                      to="/projetos/$id"
                      params={{ id: project.id }}
                      title={`${project.name}\nInício: ${start}${end ? `\nFim: ${end}` : ""}\n${Math.round(stats.progress * 100)}% concluído${stats.daysRemaining !== null ? ` · ${stats.daysRemaining >= 0 ? `${stats.daysRemaining}d restantes` : `${Math.abs(stats.daysRemaining)}d de atraso`}` : ""}`}
                      className={`absolute inset-y-2 flex items-center rounded-md shadow-sm transition-all hover:brightness-110 ${isOverdue ? "ring-1 ring-overdue/60" : ""}`}
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        backgroundColor: `${project.color}33`,
                        borderLeft: overflowsLeft ? undefined : `3px solid ${project.color}`,
                        borderRight: overflowsRight ? `3px solid ${project.color}88` : undefined,
                      }}
                    >
                      {/* Progress fill */}
                      <span
                        className="absolute inset-y-0 left-0 rounded-md opacity-40"
                        style={{ width: `${Math.round(stats.progress * 100)}%`, backgroundColor: project.color }}
                      />
                      {overflowsLeft && (
                        <ChevronLeft className="relative z-[1] h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                      <span className="relative z-[1] truncate px-1.5 text-[10px] font-medium">
                        {Math.round(stats.progress * 100)}%
                      </span>
                      {role && width > 8 && (
                        <span className="relative z-[1] hidden truncate text-[10px] text-muted-foreground sm:inline">
                          · {role.name}
                        </span>
                      )}
                      {overflowsRight && (
                        <ChevronRight className="relative z-[1] ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                    </Link>
                  ) : (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] italic text-muted-foreground">
                      fora do período · {formatShort(start)}{end && end !== start ? ` → ${formatShort(end)}` : ""}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-4 rounded bg-primary/40" /> barra do projeto
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-4 rounded ring-1 ring-overdue/60" /> atrasado
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-px border-l border-dashed border-primary/70" /> hoje
        </span>
      </div>
    </div>
  );
}

