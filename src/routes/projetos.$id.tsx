import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import {
  useProjects,
  useProjectHistory,
  computeProjectStats,
  PROJECT_STATUS_LABEL,
  type ProjectStatus,
} from "@/hooks/useProjects";
import {
  useProjectComments,
  useProjectLinks,
  useProjectMilestones,
  detectLinkKind,
  MILESTONE_STATUS_LABEL,
  type MilestoneStatus,
} from "@/hooks/useProjectExtras";
import { useRoles } from "@/hooks/useRoles";
import { useTasks, type Task } from "@/hooks/useTasks";
import { useMeetings, meetingDurationMinutes } from "@/hooks/useMeetings";
import { TaskDialog, type RecurrenceScope } from "@/components/TaskDialog";
import { ProjectDialog } from "@/components/ProjectDialog";
import { ProjectHistoryPanel } from "@/components/ProjectHistoryPanel";
import { ProjectStatusBadge } from "@/components/ProjectChip";
import { ProjectTaskBoard } from "@/components/ProjectTaskBoard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Calendar, CheckCircle2, Clock, AlertTriangle, Plus, Pencil, FileText, ListTodo,
  CalendarClock, History, Link2, MessageSquare, Flag, ExternalLink, Trash2,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { todayISO, formatHuman, formatMinutes } from "@/lib/date";
import { toast } from "sonner";

export const Route = createFileRoute("/projetos/$id")({
  component: () => (
    <AppShell>
      <ProjectDetailPage />
    </AppShell>
  ),
});

function ProjectDetailPage() {
  const { user, session } = useAuth();
  const { id } = Route.useParams();
  if (!user || !session) return null;
  return <ProjectDetailInner userId={user.id} projectId={id} accessToken={session.access_token} />;
}

type Tab = "tasks" | "milestones" | "meetings" | "comments" | "activity" | "history";

function ProjectDetailInner({ userId, projectId, accessToken }: { userId: string; projectId: string; accessToken: string }) {
  const navigate = useNavigate();
  const projectsApi = useProjects(userId);
  const { roles } = useRoles(userId);
  const tasksApi = useTasks(userId);
  const meetingsApi = useMeetings(userId);
  const statusHistory = useProjectHistory(projectId);
  const comments = useProjectComments(projectId, userId);
  const linksApi = useProjectLinks(projectId, userId);
  const milestonesApi = useProjectMilestones(projectId, userId);
  const today = todayISO();

  const project = projectsApi.projectById(projectId);
  const [editOpen, setEditOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [tab, setTab] = useState<Tab>("tasks");
  const [contextDraft, setContextDraft] = useState<string | null>(null);
  const [contextSaving, setContextSaving] = useState(false);

  useEffect(() => {
    if (project && contextDraft === null) setContextDraft(project.description ?? "");
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
  const stats = project ? computeProjectStats(project, projectTasks, today) : null;




  const otherMeetings = useMemo(
    () => meetingsApi.meetings.filter((m) => !(m as any).project_id),
    [meetingsApi.meetings]
  );

  if (!project) {
    if (projectsApi.loading) {
      return (
        <div className="flex items-center justify-center rounded-2xl border border-border/60 bg-card/30 p-10 text-sm text-muted-foreground">
          Carregando projeto…
        </div>
      );
    }
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
    } catch (e: any) { toast.error(e.message ?? "Erro ao salvar"); }
    finally { setContextSaving(false); }
  };

  const changeStatus = async (s: ProjectStatus) => {
    await projectsApi.updateProject(project.id, { status: s });
    toast.success("Status atualizado");
  };

  const addSubtask = () => { setEditingTask(null); setTaskDialogOpen(true); };
  const openEditTask = (t: Task) => { setEditingTask(t); setTaskDialogOpen(true); };

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
              {project.user_id === userId && (
                <button onClick={() => setEditOpen(true)} className="text-muted-foreground hover:text-foreground" title="Editar">
                  <Pencil className="h-4 w-4" />
                </button>
              )}
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
          <Button onClick={addSubtask} className="bg-gradient-prestige text-primary-foreground hover:opacity-90">
            <Plus className="mr-1 h-4 w-4" /> Subtarefa
          </Button>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Progresso</span>
            <span className="tabular-nums font-medium">{pct}% · {stats?.done}/{stats?.total}</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: project.color }} />
          </div>
        </div>

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

      {/* Briefing / Links collapsible */}
      <BriefingHeader
        contextDraft={contextDraft}
        setContextDraft={setContextDraft}
        onSave={saveContext}
        saving={contextSaving}
        linksApi={linksApi}
      />

      <div className="space-y-4">
        <div className="flex items-center gap-1 border-b border-border/60 overflow-x-auto">
          <TabBtn active={tab === "tasks"} onClick={() => setTab("tasks")} icon={<ListTodo className="h-3.5 w-3.5" />}>
            Tarefas ({projectTasks.length})
          </TabBtn>
          <TabBtn active={tab === "milestones"} onClick={() => setTab("milestones")} icon={<Flag className="h-3.5 w-3.5" />}>
            Marcos ({milestonesApi.milestones.length})
          </TabBtn>
          <TabBtn active={tab === "meetings"} onClick={() => setTab("meetings")} icon={<CalendarClock className="h-3.5 w-3.5" />}>
            Reuniões ({projectMeetings.length})
          </TabBtn>
          <TabBtn active={tab === "comments"} onClick={() => setTab("comments")} icon={<MessageSquare className="h-3.5 w-3.5" />}>
            Comentários ({comments.comments.length})
          </TabBtn>
          <TabBtn active={tab === "history"} onClick={() => setTab("history")} icon={<History className="h-3.5 w-3.5" />}>
            Histórico
          </TabBtn>
        </div>

        {tab === "tasks" && (
          <ProjectTaskBoard
            projectId={project.id}
            tasks={projectTasks}
            roles={roles}
            ownerId={(project as any).user_id ?? userId}
            onAdd={addSubtask}
            onEdit={openEditTask}
            onSetStatus={(id, status) => tasksApi.setStatus(id, status)}
            onUpdate={(id, patch) => tasksApi.updateTask(id, patch as any)}
            onToggleComplete={(t) => tasksApi.toggleComplete(t)}
            onBulkDelete={(ids) => tasksApi.bulkDelete(ids)}
          />
        )}

        {tab === "milestones" && (
          <MilestonesPanel api={milestonesApi} today={today} color={project.color} />
        )}

        {tab === "meetings" && (
          <div className="space-y-3">
            {projectMeetings.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma reunião vinculada.</p>
            ) : (
              <ul className="space-y-2">
                {projectMeetings.slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/60 p-3">
                    <div className="min-w-0">
                      <div className="font-medium leading-tight truncate">{m.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(m.starts_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {formatMinutes(meetingDurationMinutes(m))}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => unlinkMeeting(m.id)}>
                      Desvincular
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {otherMeetings.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vincular reunião existente</h3>
                <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-xl border border-border/60 bg-card/40 p-2">
                  {otherMeetings.slice(0, 30).map((m) => (
                    <button key={m.id} onClick={() => linkMeeting(m.id)} className="flex w-full items-center justify-between gap-2 rounded-lg p-2 text-left text-xs hover:bg-accent/40">
                      <span className="truncate">
                        <span className="font-medium">{m.title}</span>{" "}
                        <span className="text-muted-foreground">· {new Date(m.starts_at).toLocaleDateString("pt-BR")}</span>
                      </span>
                      <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "comments" && <CommentsPanel api={comments} />}

        {tab === "history" && <ProjectHistoryPanel projectId={project.id} />}
      </div>


      <TaskDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        defaultDate={today}
        task={editingTask}
        roles={roles}
        projects={projectsApi.projects}
        lockedProjectId={editingTask ? undefined : project.id}
        onSave={async (data, scope?: RecurrenceScope) => {
          if (editingTask) {
            if (scope && (editingTask.recurrence_parent_id || editingTask.recurrence !== "none")) {
              await tasksApi.updateTaskWithScope(editingTask, data as any, scope);
            } else {
              await tasksApi.updateTask(editingTask.id, data as any);
            }
            toast.success("Subtarefa atualizada");
            return editingTask.id;
          } else {
            const inserted = await tasksApi.createTask({
              ...(data as any),
              original_date: data.scheduled_date,
              position: tasksApi.topPositionForDay(data.scheduled_date),
            });
            toast.success("Subtarefa criada");
            return inserted?.id;
          }
        }}
        onDelete={editingTask ? async (scope?: RecurrenceScope) => {
          if (scope && (editingTask.recurrence_parent_id || editingTask.recurrence !== "none")) {
            await tasksApi.deleteTaskWithScope(editingTask, scope);
          } else {
            await tasksApi.deleteTask(editingTask.id);
          }
          toast.success("Subtarefa excluída");
        } : undefined}
        onToggleComplete={editingTask ? () => tasksApi.toggleComplete(editingTask) : undefined}
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
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${active ? "text-primary border-b-2 border-primary -mb-px" : "text-muted-foreground hover:text-foreground"}`}>
      {icon} {children}
    </button>
  );
}

function BriefingHeader({
  contextDraft, setContextDraft, onSave, saving, linksApi,
}: {
  contextDraft: string | null;
  setContextDraft: (s: string) => void;
  onSave: () => void;
  saving: boolean;
  linksApi: ReturnType<typeof useProjectLinks>;
}) {
  const [open, setOpen] = useState(false);
  const linksCount = linksApi.links.length;
  const hasContext = !!(contextDraft && contextDraft.trim());

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-accent/20"
      >
        <div className="flex items-center gap-2 text-sm">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold">Briefing & contexto</span>
          <span className="text-xs text-muted-foreground">
            {hasContext ? "preenchido" : "vazio"} · {linksCount} link{linksCount === 1 ? "" : "s"}
          </span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="grid gap-4 border-t border-border/60 p-4 lg:grid-cols-[1fr_320px]">
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Contexto / Briefing
            </div>
            <Textarea
              value={contextDraft ?? ""}
              onChange={(e) => setContextDraft(e.target.value)}
              onBlur={onSave}
              rows={6}
              placeholder="Objetivos, escopo, decisões importantes…"
              className="resize-y text-sm"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              {saving ? "Salvando…" : "Salvo automaticamente ao sair do campo"}
            </p>
          </div>
          <div>
            <LinksPanel api={linksApi} />
          </div>
        </div>
      )}
    </div>
  );
}


// ---------------- Comments Panel ----------------
function CommentsPanel({ api }: { api: ReturnType<typeof useProjectComments> }) {
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const submit = async () => {
    if (!draft.trim()) return;
    setPosting(true);
    try { await api.add(draft); setDraft(""); }
    catch (e: any) { toast.error(e.message ?? "Erro ao comentar"); }
    finally { setPosting(false); }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/60 bg-card/40 p-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="Registrar uma decisão, dúvida ou evolução…"
          className="resize-none text-sm border-0 bg-transparent focus-visible:ring-0 p-0"
        />
        <div className="mt-2 flex justify-end">
          <Button size="sm" onClick={submit} disabled={posting || !draft.trim()}>
            <MessageSquare className="mr-1 h-3.5 w-3.5" /> Comentar
          </Button>
        </div>
      </div>

      {api.comments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Nenhum comentário ainda. Use este espaço para registrar evoluções, decisões e contexto.</p>
      ) : (
        <ul className="space-y-2">
          {api.comments.slice().reverse().map((c) => (
            <li key={c.id} className="rounded-xl border border-border/60 bg-card/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm whitespace-pre-wrap break-words flex-1">{c.content}</p>
                <button
                  onClick={() => { if (window.confirm("Excluir comentário?")) api.remove(c.id); }}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  title="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                {new Date(c.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                {c.edited_at && " · editado"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------- Milestones Panel ----------------
function MilestonesPanel({
  api, today, color,
}: {
  api: ReturnType<typeof useProjectMilestones>; today: string; color: string;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");

  const submit = async () => {
    if (!title.trim()) return;
    await api.add({ title: title.trim(), due_date: due || null, status: "pending" });
    setTitle(""); setDue(""); setAdding(false);
    toast.success("Marco criado");
  };

  return (
    <div className="space-y-3">
      {api.milestones.length === 0 && !adding && (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-8 text-center">
          <Flag className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">Nenhum marco. Marcos ajudam a quebrar o projeto em entregas concretas (ex.: Kickoff, MVP, Go-live).</p>
          <Button variant="outline" className="mt-3" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-4 w-4" /> Adicionar marco
          </Button>
        </div>
      )}

      {api.milestones.length > 0 && (
        <ul className="space-y-2">
          {api.milestones.map((m) => {
            const isOverdue = m.due_date && m.due_date < today && m.status !== "done";
            return (
              <li key={m.id} className="rounded-xl border border-border/60 bg-card/60 p-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 h-8 w-8 rounded-full grid place-items-center shrink-0" style={{ backgroundColor: `${color}25`, color }}>
                    {m.status === "done" ? <CheckCircle2 className="h-4 w-4" /> : <Flag className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className={`font-medium ${m.status === "done" ? "line-through text-muted-foreground" : ""}`}>{m.title}</h4>
                      <Select value={m.status} onValueChange={(v) => api.update(m.id, { status: v as MilestoneStatus })}>
                        <SelectTrigger className="h-6 w-auto gap-1 text-[10px] py-0 px-2"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(MILESTONE_STATUS_LABEL) as MilestoneStatus[]).map((s) => (
                            <SelectItem key={s} value={s}>{MILESTONE_STATUS_LABEL[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {m.due_date && (
                      <p className={`mt-1 text-xs ${isOverdue ? "text-overdue font-medium" : "text-muted-foreground"}`}>
                        <Calendar className="inline h-3 w-3 mr-1" />
                        <span className="capitalize">{formatHuman(m.due_date)}</span>
                        {isOverdue && " · atrasado"}
                      </p>
                    )}
                  </div>
                  <button onClick={() => { if (window.confirm("Excluir marco?")) api.remove(m.id); }} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <div className="rounded-xl border border-border/60 bg-card/60 p-3 space-y-2">
          <Input autoFocus placeholder="Título do marco" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setTitle(""); setDue(""); }}>Cancelar</Button>
            <Button size="sm" onClick={submit}>Adicionar</Button>
          </div>
        </div>
      ) : api.milestones.length > 0 && (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Novo marco
        </Button>
      )}
    </div>
  );
}

// ---------------- Links Panel ----------------
function LinksPanel({ api }: { api: ReturnType<typeof useProjectLinks> }) {
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (url && !label) {
      const d = detectLinkKind(url);
      setLabel(d.suggestedLabel);
    }
  }, [url]); // eslint-disable-line

  const submit = async () => {
    if (!url.trim()) return;
    try { await api.add({ url: url.trim(), label: label.trim() || undefined }); setUrl(""); setLabel(""); setAdding(false); }
    catch (e: any) { toast.error(e.message ?? "Erro"); }
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Link2 className="h-3.5 w-3.5" /> Links
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="text-xs text-primary hover:underline">+ Adicionar</button>
        )}
      </div>

      {api.links.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground">Cole links do Loop, SharePoint, Figma, Drive…</p>
      )}

      <ul className="space-y-1.5">
        {api.links.map((l) => (
          <li key={l.id} className="flex items-center gap-2 group rounded-lg p-1.5 hover:bg-accent/30">
            <a href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 min-w-0 flex-1 text-sm hover:text-primary">
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{l.label}</span>
            </a>
            <button
              onClick={() => api.remove(l.id)}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
              title="Remover"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>

      {adding && (
        <div className="mt-2 space-y-1.5">
          <Input autoFocus placeholder="Cole o URL" value={url} onChange={(e) => setUrl(e.target.value)} className="h-8 text-xs" />
          <Input placeholder="Rótulo (opcional)" value={label} onChange={(e) => setLabel(e.target.value)} className="h-8 text-xs" />
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setUrl(""); setLabel(""); }} className="h-7 text-xs">Cancelar</Button>
            <Button size="sm" onClick={submit} className="h-7 text-xs">Salvar</Button>
          </div>
        </div>
      )}
    </div>
  );
}

