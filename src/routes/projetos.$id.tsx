import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useProjects, useProjectHistory, computeProjectStats, PROJECT_STATUS_LABEL, type ProjectStatus } from "@/hooks/useProjects";
import { useRoles } from "@/hooks/useRoles";
import { useTasks, type Task } from "@/hooks/useTasks";
import { useMeetings, meetingDurationMinutes } from "@/hooks/useMeetings";
import { TaskCard } from "@/components/TaskCard";
import { TaskDialog, type RecurrenceScope } from "@/components/TaskDialog";
import { ProjectDialog } from "@/components/ProjectDialog";
import { ProjectStatusBadge } from "@/components/ProjectChip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Calendar, CheckCircle2, Clock, AlertTriangle, Plus, Pencil, FileText, ListTodo, CalendarClock, History, Link2, Link2Off } from "lucide-react";
import { todayISO, addDays, formatHuman, formatMinutes } from "@/lib/date";
import { toast } from "sonner";

export const Route = createFileRoute("/projetos/$id")({
  component: () => (
    <AppShell>
      <ProjectDetailPage />
    </AppShell>
  ),
});

function ProjectDetailPage() {
  const { user } = useAuth();
  const { id } = Route.useParams();
  if (!user) return null;
  return <ProjectDetailInner userId={user.id} projectId={id} />;
}

type Tab = "tasks" | "meetings" | "history";

function ProjectDetailInner({ userId, projectId }: { userId: string; projectId: string }) {
  const navigate = useNavigate();
  const projectsApi = useProjects(userId);
  const { roles } = useRoles(userId);
  const tasksApi = useTasks(userId);
  const meetingsApi = useMeetings(userId);
  const history = useProjectHistory(projectId);
  const today = todayISO();

  const project = projectsApi.projectById(projectId);
  const [editOpen, setEditOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [tab, setTab] = useState<Tab>("tasks");
  const [contextDraft, setContextDraft] = useState<string | null>(null);
  const [contextSaving, setContextSaving] = useState(false);

  useEffect(() => {
    if (project && contextDraft === null) {
      setContextDraft(project.description ?? "");
    }
  }, [project, contextDraft]);

  const projectTasks = useMemo(
    () => tasksApi.tasks.filter((t) => (t as any).project_id === projectId),
    [tasksApi.tasks, projectId]
  );
  const projectMeetings = useMemo(
    () => meetingsApi.meetings.filter((m) => (m as any).project_id === projectId),
    [meetingsApi.meetings, projectId]
  );

  const role = roles.find((r) => r.id === project?.role_id) ?? null;
  const stats = project
    ? computeProjectStats(project, projectTasks, today)
    : null;

  // Group tasks
  const grouped = useMemo(() => {
    const overdue: Task[] = [];
    const todayList: Task[] = [];
    const upcoming: Task[] = [];
    const later: Task[] = [];
    const done: Task[] = [];
    const sevenDays = addDays(today, 7);
    for (const t of projectTasks) {
      if (t.completed) { done.push(t); continue; }
      if (t.scheduled_date < today) overdue.push(t);
      else if (t.scheduled_date === today) todayList.push(t);
      else if (t.scheduled_date <= sevenDays) upcoming.push(t);
      else later.push(t);
    }
    const byDate = (a: Task, b: Task) => a.scheduled_date.localeCompare(b.scheduled_date) || a.position - b.position;
    return {
      overdue: overdue.sort(byDate),
      today: todayList.sort(byDate),
      upcoming: upcoming.sort(byDate),
      later: later.sort(byDate),
      done: done.sort(byDate),
    };
  }, [projectTasks, today]);

  const otherMeetings = useMemo(
    () => meetingsApi.meetings.filter((m) => !(m as any).project_id),
    [meetingsApi.meetings]
  );

  if (!project) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-10 text-center">
        <p className="text-muted-foreground">Projeto não encontrado.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate({ to: "/projetos" })}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Voltar para projetos
        </Button>
      </div>
    );
  }

  const pct = Math.round((stats?.progress ?? 0) * 100);

  const saveContext = async () => {
    if (contextDraft === null || contextDraft === (project.description ?? "")) return;
    setContextSaving(true);
    try {
      await projectsApi.updateProject(project.id, { description: contextDraft || null });
      toast.success("Contexto salvo");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setContextSaving(false);
    }
  };

  const changeStatus = async (s: ProjectStatus) => {
    await projectsApi.updateProject(project.id, { status: s });
    toast.success("Status atualizado");
  };

  const addSubtask = () => {
    setEditingTask(null);
    setTaskDialogOpen(true);
  };
  const openEditTask = (t: Task) => {
    setEditingTask(t);
    setTaskDialogOpen(true);
  };

  const linkMeeting = async (meetingId: string) => {
    await meetingsApi.updateMeeting(meetingId, { project_id: project.id } as any);
    toast.success("Reunião vinculada");
  };
  const unlinkMeeting = async (meetingId: string) => {
    await meetingsApi.updateMeeting(meetingId, { project_id: null } as any);
    toast.success("Reunião desvinculada");
  };

  return (
    <div className="space-y-6">
      <div>
        <Link to="/projetos" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Projetos
        </Link>
      </div>

      {/* Header */}
      <div
        className="rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur-sm shadow-[var(--shadow-card)]"
        style={{ borderTopColor: project.color, borderTopWidth: 4 }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-3xl font-bold leading-tight">{project.name}</h1>
              <button onClick={() => setEditOpen(true)} className="text-muted-foreground hover:text-foreground" title="Editar">
                <Pencil className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Select value={project.status} onValueChange={(v) => changeStatus(v as ProjectStatus)}>
                <SelectTrigger className="h-7 w-auto gap-1 text-xs">
                  <ProjectStatusBadge status={project.status} size="sm" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {role && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: `${role.color}20`, borderColor: `${role.color}55`, color: role.color }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: role.color }} />
                  {role.name}
                </span>
              )}
              {project.starts_on && (
                <span className="text-xs text-muted-foreground">
                  Início: <span className="capitalize">{formatHuman(project.starts_on)}</span>
                </span>
              )}
              {project.deadline && (
                <span className={`text-xs ${stats?.isOverdue ? "text-overdue font-medium" : "text-muted-foreground"}`}>
                  Prazo: <span className="capitalize">{formatHuman(project.deadline)}</span>
                  {stats && stats.daysRemaining !== null && (
                    <span className="ml-1">
                      ({stats.daysRemaining < 0 ? `${Math.abs(stats.daysRemaining)}d atrasado` : `faltam ${stats.daysRemaining}d`})
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
          <Button onClick={addSubtask} className="bg-gradient-to-r from-primary to-circumstantial text-primary-foreground hover:opacity-90">
            <Plus className="mr-1 h-4 w-4" /> Subtarefa
          </Button>
        </div>

        {/* Progress */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Progresso</span>
            <span className="tabular-nums font-medium">{pct}% · {stats?.done}/{stats?.total}</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, backgroundColor: project.color }}
            />
          </div>
        </div>

        {/* KPIs */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi icon={<ListTodo className="h-3.5 w-3.5" />} label="Abertas" value={String(stats?.open ?? 0)} />
          <Kpi icon={<Clock className="h-3.5 w-3.5" />} label="Restante" value={formatMinutes(stats?.estimatedMinutes ?? 0)} />
          <Kpi icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Tempo gasto" value={formatMinutes(Math.round((stats?.spentSeconds ?? 0) / 60))} />
          <Kpi
            icon={<Calendar className="h-3.5 w-3.5" />}
            label={stats?.daysRemaining === null ? "Sem prazo" : stats!.daysRemaining < 0 ? "Atrasado" : "Dias restantes"}
            value={stats?.daysRemaining === null ? "—" : `${Math.abs(stats!.daysRemaining)}d`}
            danger={stats?.isOverdue}
          />
        </div>

        {stats && stats.overdueTasks > 0 && (
          <div className="mt-3 inline-flex items-center gap-1 rounded-md bg-overdue/10 px-2 py-1 text-xs font-medium text-overdue">
            <AlertTriangle className="h-3 w-3" /> {stats.overdueTasks} subtarefa{stats.overdueTasks === 1 ? "" : "s"} atrasada{stats.overdueTasks === 1 ? "" : "s"}
          </div>
        )}
      </div>

      {/* Two columns */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main */}
        <div className="space-y-4">
          <div className="flex items-center gap-1 border-b border-border/60">
            <TabBtn active={tab === "tasks"} onClick={() => setTab("tasks")} icon={<ListTodo className="h-3.5 w-3.5" />}>
              Subtarefas ({projectTasks.length})
            </TabBtn>
            <TabBtn active={tab === "meetings"} onClick={() => setTab("meetings")} icon={<CalendarClock className="h-3.5 w-3.5" />}>
              Reuniões ({projectMeetings.length})
            </TabBtn>
            <TabBtn active={tab === "history"} onClick={() => setTab("history")} icon={<History className="h-3.5 w-3.5" />}>
              Atividade
            </TabBtn>
          </div>

          {tab === "tasks" && (
            <div className="space-y-5">
              {projectTasks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-8 text-center">
                  <p className="text-sm text-muted-foreground">Nenhuma subtarefa ainda.</p>
                  <Button variant="outline" className="mt-3" onClick={addSubtask}>
                    <Plus className="mr-1 h-4 w-4" /> Adicionar subtarefa
                  </Button>
                </div>
              ) : (
                <>
                  <TaskGroup title="Atrasadas" tasks={grouped.overdue} tasksApi={tasksApi} roles={roles} onEdit={openEditTask} overdue />
                  <TaskGroup title="Hoje" tasks={grouped.today} tasksApi={tasksApi} roles={roles} onEdit={openEditTask} />
                  <TaskGroup title="Próximos 7 dias" tasks={grouped.upcoming} tasksApi={tasksApi} roles={roles} onEdit={openEditTask} />
                  <TaskGroup title="Mais tarde" tasks={grouped.later} tasksApi={tasksApi} roles={roles} onEdit={openEditTask} />
                  <TaskGroup title="Concluídas" tasks={grouped.done} tasksApi={tasksApi} roles={roles} onEdit={openEditTask} muted />
                </>
              )}
            </div>
          )}

          {tab === "meetings" && (
            <div className="space-y-3">
              {projectMeetings.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma reunião vinculada.</p>
              ) : (
                <ul className="space-y-2">
                  {projectMeetings
                    .slice()
                    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
                    .map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/60 p-3">
                        <div className="min-w-0">
                          <div className="font-medium leading-tight truncate">{m.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(m.starts_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} ·{" "}
                            {formatMinutes(meetingDurationMinutes(m))}
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => unlinkMeeting(m.id)}>
                          <Link2Off className="h-3.5 w-3.5 mr-1" /> Desvincular
                        </Button>
                      </li>
                    ))}
                </ul>
              )}

              {otherMeetings.length > 0 && (
                <div className="mt-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Vincular reunião existente
                  </h3>
                  <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-xl border border-border/60 bg-card/40 p-2">
                    {otherMeetings.slice(0, 30).map((m) => (
                      <button
                        key={m.id}
                        onClick={() => linkMeeting(m.id)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg p-2 text-left text-xs hover:bg-accent/40"
                      >
                        <span className="truncate">
                          <span className="font-medium">{m.title}</span>{" "}
                          <span className="text-muted-foreground">
                            · {new Date(m.starts_at).toLocaleDateString("pt-BR")}
                          </span>
                        </span>
                        <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "history" && (
            <div className="space-y-2">
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem atividade ainda.</p>
              ) : (
                <ul className="space-y-1.5">
                  {history.map((h) => (
                    <li key={h.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-xs">
                      <History className="h-3 w-3 text-muted-foreground" />
                      <span>
                        {h.from_status
                          ? <>De <strong>{PROJECT_STATUS_LABEL[h.from_status]}</strong> para <strong>{PROJECT_STATUS_LABEL[h.to_status]}</strong></>
                          : <>Status inicial: <strong>{PROJECT_STATUS_LABEL[h.to_status]}</strong></>}
                        {h.note && <span className="ml-1 text-muted-foreground">— {h.note}</span>}
                      </span>
                      <span className="ml-auto text-muted-foreground">
                        {new Date(h.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Sidebar — Context */}
        <aside className="space-y-3">
          <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <FileText className="h-3.5 w-3.5" /> Contexto / Briefing
            </div>
            <Textarea
              value={contextDraft ?? ""}
              onChange={(e) => setContextDraft(e.target.value)}
              onBlur={saveContext}
              rows={12}
              placeholder="Objetivos, escopo, decisões importantes, links de referência…"
              className="resize-none text-sm"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              {contextSaving ? "Salvando…" : "Salvo automaticamente ao sair do campo"}
            </p>
          </div>
        </aside>
      </div>

      <TaskDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        defaultDate={today}
        task={editingTask}
        roles={roles}
        projects={projectsApi.projects}
        lockedProjectId={project.id}
        onSave={async (data, scope?: RecurrenceScope) => {
          if (editingTask) {
            if (scope && (editingTask.recurrence_parent_id || editingTask.recurrence !== "none")) {
              await tasksApi.updateTaskWithScope(editingTask, data as any, scope);
            } else {
              await tasksApi.updateTask(editingTask.id, data as any);
            }
            toast.success("Subtarefa atualizada");
          } else {
            await tasksApi.createTask({
              ...(data as any),
              original_date: data.scheduled_date,
              position: tasksApi.topPositionForDay(data.scheduled_date),
            });
            toast.success("Subtarefa criada");
          }
        }}
        onDelete={
          editingTask
            ? async (scope?: RecurrenceScope) => {
                if (scope && (editingTask.recurrence_parent_id || editingTask.recurrence !== "none")) {
                  await tasksApi.deleteTaskWithScope(editingTask, scope);
                } else {
                  await tasksApi.deleteTask(editingTask.id);
                }
                toast.success("Subtarefa excluída");
              }
            : undefined
        }
      />

      <ProjectDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        project={project}
        roles={roles}
        onSave={async (data) => {
          await projectsApi.updateProject(project.id, data);
          toast.success("Projeto atualizado");
        }}
        onDelete={async () => {
          await projectsApi.deleteProject(project.id);
          toast.success("Projeto excluído");
          navigate({ to: "/projetos" });
        }}
      />
    </div>
  );
}

function Kpi({ icon, label, value, danger }: { icon: React.ReactNode; label: string; value: string; danger?: boolean }) {
  return (
    <div className={`rounded-xl border p-2.5 ${danger ? "border-overdue/40 bg-overdue/5" : "border-border/60 bg-background/40"}`}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className={`mt-0.5 font-display text-lg font-semibold tabular-nums ${danger ? "text-overdue" : ""}`}>{value}</div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
        active ? "text-primary border-b-2 border-primary -mb-px" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon} {children}
    </button>
  );
}

function TaskGroup({
  title,
  tasks,
  tasksApi,
  roles,
  onEdit,
  overdue,
  muted,
}: {
  title: string;
  tasks: Task[];
  tasksApi: ReturnType<typeof useTasks>;
  roles: ReturnType<typeof useRoles>["roles"];
  onEdit: (t: Task) => void;
  overdue?: boolean;
  muted?: boolean;
}) {
  if (tasks.length === 0) return null;
  const rolesById = new Map(roles.map((r) => [r.id, r]));
  return (
    <section className={muted ? "opacity-70" : ""}>
      <h3 className={`mb-2 text-xs font-semibold uppercase tracking-wider ${overdue ? "text-overdue" : "text-muted-foreground"}`}>
        {title} · {tasks.length}
      </h3>
      <div className="space-y-2">
        {tasks.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            role={t.role_id ? rolesById.get(t.role_id) ?? null : null}
            onToggle={() => tasksApi.toggleComplete(t)}
            onEdit={() => onEdit(t)}
            isOverdue={overdue}
          />
        ))}
      </div>
    </section>
  );
}
