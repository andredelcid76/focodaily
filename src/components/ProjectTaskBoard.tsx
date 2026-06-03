import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2, Circle, Clock, Table as TableIcon, KanbanSquare, GanttChart,
  Plus, Lock, AlertCircle, Layers, Pencil, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RoleBadge } from "./RoleBadge";
import { CategoryIcon } from "./CategoryBadge";
import { formatShort, todayISO, addDays } from "@/lib/date";
import { listProjectMembers } from "@/lib/team.functions";
import type { Task, TaskStatus } from "@/hooks/useTasks";
import type { Role } from "@/hooks/useRoles";
import { toast } from "sonner";

type View = "table" | "kanban" | "timeline";
type Grouping = "none" | "assignee" | "status" | "due";

type Member = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  is_me: boolean;
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "A fazer",
  doing: "Em andamento",
  done: "Concluída",
};
const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: "bg-muted text-muted-foreground border-border",
  doing: "bg-primary/10 text-primary border-primary/30",
  done: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
};

function nameOf(m?: Member | null) {
  if (!m) return "Sem responsável";
  return m.display_name?.trim() || m.email || "—";
}
function initialsOf(m?: Member | null) {
  const n = nameOf(m);
  return n
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
}

export function ProjectTaskBoard({
  projectId,
  tasks,
  roles,
  ownerId,
  onAdd,
  onEdit,
  onSetStatus,
  onUpdate,
  onToggleComplete,
  onBulkDelete,
}: {
  projectId: string;
  tasks: Task[];
  roles: Role[];
  ownerId: string;
  onAdd: () => void;
  onEdit: (t: Task) => void;
  onSetStatus: (id: string, status: TaskStatus) => Promise<void> | void;
  onUpdate: (id: string, patch: Partial<Task>) => Promise<void> | void;
  onToggleComplete: (t: Task) => Promise<void> | void;
  onBulkDelete?: (ids: string[]) => Promise<void> | void;
}) {
  const [view, setView] = useState<View>("table");
  const [grouping, setGrouping] = useState<Grouping>("none");
  const [search, setSearch] = useState("");

  const fetchMembers = useServerFn(listProjectMembers);
  const { data: membersData } = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: () => fetchMembers({ data: { project_id: projectId } }),
  });
  const members: Member[] = useMemo(
    () => (membersData?.members ?? []).map((m) => ({
      user_id: m.user_id,
      email: m.email,
      display_name: m.display_name,
      is_me: m.is_me,
    })),
    [membersData],
  );
  const memberById = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);
  const rolesById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((t) => t.title.toLowerCase().includes(q));
  }, [tasks, search]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border/60 bg-card/40 p-0.5">
          <ToggleBtn active={view === "table"} onClick={() => setView("table")} icon={<TableIcon className="h-3.5 w-3.5" />}>Tabela</ToggleBtn>
          <ToggleBtn active={view === "kanban"} onClick={() => setView("kanban")} icon={<KanbanSquare className="h-3.5 w-3.5" />}>Kanban</ToggleBtn>
          <ToggleBtn active={view === "timeline"} onClick={() => setView("timeline")} icon={<GanttChart className="h-3.5 w-3.5" />}>Cronograma</ToggleBtn>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar subtarefa…"
            className="h-8 w-44 text-xs"
          />
          {view === "table" && (
            <Select value={grouping} onValueChange={(v) => setGrouping(v as Grouping)}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <Layers className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Agrupar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem agrupamento</SelectItem>
                <SelectItem value="assignee">Por responsável</SelectItem>
                <SelectItem value="status">Por status</SelectItem>
                <SelectItem value="due">Por prazo</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button size="sm" onClick={onAdd} className="bg-gradient-prestige text-primary-foreground hover:opacity-90">
            <Plus className="h-3.5 w-3.5 mr-1" /> Subtarefa
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-10 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma subtarefa.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onAdd}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
          </Button>
        </div>
      ) : view === "table" ? (
        <TableView
          tasks={filtered}
          grouping={grouping}
          members={members}
          memberById={memberById}
          rolesById={rolesById}
          ownerId={ownerId}
          onEdit={onEdit}
          onSetStatus={onSetStatus}
          onUpdate={onUpdate}
          onToggleComplete={onToggleComplete}
          onBulkDelete={onBulkDelete}
        />
      ) : view === "kanban" ? (
        <KanbanView
          tasks={filtered}
          members={members}
          memberById={memberById}
          rolesById={rolesById}
          onEdit={onEdit}
          onSetStatus={onSetStatus}
          onUpdate={onUpdate}
        />
      ) : (
        <TimelineView
          tasks={filtered}
          memberById={memberById}
          rolesById={rolesById}
          onEdit={onEdit}
        />
      )}
    </div>
  );
}

/* ============================================================
   Table view
============================================================ */
function TableView({
  tasks, grouping, members, memberById, rolesById, ownerId,
  onEdit, onSetStatus, onUpdate, onToggleComplete, onBulkDelete,
}: {
  tasks: Task[];
  grouping: Grouping;
  members: Member[];
  memberById: Map<string, Member>;
  rolesById: Map<string, Role>;
  ownerId: string;
  onEdit: (t: Task) => void;
  onSetStatus: (id: string, status: TaskStatus) => Promise<void> | void;
  onUpdate: (id: string, patch: Partial<Task>) => Promise<void> | void;
  onToggleComplete: (t: Task) => Promise<void> | void;
  onBulkDelete?: (ids: string[]) => Promise<void> | void;
}) {
  const today = todayISO();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSel = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const clearSel = () => setSelected(new Set());
  const allIds = tasks.map((t) => t.id);
  const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(allIds));

  const ids = Array.from(selected);
  const hasSelection = ids.length > 0;

  const bulkStatus = async (s: TaskStatus) => {
    await Promise.all(ids.map((id) => onSetStatus(id, s)));
    toast.success(`${ids.length} tarefa(s) atualizada(s)`);
    clearSel();
  };
  const bulkAssign = async (uid: string | null) => {
    await Promise.all(ids.map((id) => onUpdate(id, { assignee_id: uid } as any)));
    toast.success(uid ? "Responsável atualizado" : "Responsável removido");
    clearSel();
  };
  const bulkDate = async (date: string) => {
    if (!date) return;
    await Promise.all(ids.map((id) => onUpdate(id, { scheduled_date: date } as any)));
    toast.success("Datas atualizadas");
    clearSel();
  };
  const bulkDelete = async () => {
    if (!onBulkDelete) return;
    if (!window.confirm(`Excluir ${ids.length} subtarefa(s)?`)) return;
    await onBulkDelete(ids);
    toast.success("Excluídas");
    clearSel();
  };

  const groups = useMemo(() => {
    if (grouping === "none") return [{ key: "all", label: "", tasks: sortByDate(tasks) }];
    if (grouping === "status") {
      const order: TaskStatus[] = ["doing", "todo", "done"];
      return order.map((s) => ({
        key: s,
        label: STATUS_LABEL[s],
        tasks: sortByDate(tasks.filter((t) => (t.status ?? (t.completed ? "done" : "todo")) === s)),
      })).filter((g) => g.tasks.length > 0);
    }
    if (grouping === "assignee") {
      const map = new Map<string, Task[]>();
      for (const t of tasks) {
        const aid = (t.assignee_id ?? "__unassigned") as string;
        map.set(aid, [...(map.get(aid) ?? []), t]);
      }
      const arr = Array.from(map.entries()).map(([uid, ts]) => ({
        key: uid,
        label: uid === "__unassigned" ? "Sem responsável" : nameOf(memberById.get(uid)),
        tasks: sortByDate(ts),
      }));
      arr.sort((a, b) => b.tasks.length - a.tasks.length);
      return arr;
    }
    // due
    const buckets = { overdue: [] as Task[], today: [] as Task[], week: [] as Task[], later: [] as Task[], done: [] as Task[] };
    const in7 = addDays(today, 7);
    for (const t of tasks) {
      if (t.completed) buckets.done.push(t);
      else if (t.scheduled_date < today) buckets.overdue.push(t);
      else if (t.scheduled_date === today) buckets.today.push(t);
      else if (t.scheduled_date <= in7) buckets.week.push(t);
      else buckets.later.push(t);
    }
    return [
      { key: "overdue", label: "Atrasadas", tasks: sortByDate(buckets.overdue) },
      { key: "today", label: "Hoje", tasks: sortByDate(buckets.today) },
      { key: "week", label: "Próximos 7 dias", tasks: sortByDate(buckets.week) },
      { key: "later", label: "Mais tarde", tasks: sortByDate(buckets.later) },
      { key: "done", label: "Concluídas", tasks: sortByDate(buckets.done) },
    ].filter((g) => g.tasks.length > 0);
  }, [tasks, grouping, ownerId, memberById, today]);

  return (
    <div className="space-y-2">
      {hasSelection && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
          <span className="font-semibold text-primary">{ids.length} selecionada(s)</span>
          <span className="text-muted-foreground">·</span>
          <Select onValueChange={(v) => bulkStatus(v as TaskStatus)}>
            <SelectTrigger className="h-7 w-36 text-xs"><SelectValue placeholder="Mudar status" /></SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select onValueChange={(v) => bulkAssign(v === "__none" ? null : v)}>
            <SelectTrigger className="h-7 w-44 text-xs"><SelectValue placeholder="Atribuir a…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Sem responsável</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>{nameOf(m)}{m.is_me ? " (você)" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            onChange={(e) => bulkDate(e.target.value)}
            className="h-7 w-36 text-xs"
            title="Mover vencimento"
          />
          {onBulkDelete && (
            <Button size="sm" variant="ghost" onClick={bulkDelete} className="h-7 text-destructive hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={clearSel} className="ml-auto h-7">
            <X className="h-3.5 w-3.5 mr-1" /> Limpar
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm">
        <div className="grid grid-cols-[1.5rem_1.25rem_minmax(0,1fr)_8rem_10rem_8.5rem_2rem] items-center gap-3 border-b border-border/60 bg-muted/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span />
          <Checkbox checked={allChecked} onCheckedChange={toggleAll} aria-label="Selecionar todas" />
          <span>Tarefa</span>
          <span>Vencimento</span>
          <span>Responsável</span>
          <span>Status</span>
          <span />
        </div>

        {groups.map((g) => (
          <div key={g.key}>
            {g.label && (
              <div className="flex items-center gap-2 border-b border-border/40 bg-background/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {grouping === "assignee" && (
                  <Avatar name={g.label} />
                )}
                <span>{g.label}</span>
                <span className="text-muted-foreground/60">· {g.tasks.length}</span>
              </div>
            )}
            {g.tasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                today={today}
                members={members}
                assignee={t.assignee_id ? memberById.get(t.assignee_id) : undefined}
                role={t.role_id ? rolesById.get(t.role_id) ?? null : null}
                selected={selected.has(t.id)}
                onSelectToggle={() => toggleSel(t.id)}
                onEdit={() => onEdit(t)}
                onSetStatus={(s) => onSetStatus(t.id, s)}
                onAssign={(uid) => onUpdate(t.id, { assignee_id: uid })}
                onDate={(d) => onUpdate(t.id, { scheduled_date: d })}
                onToggleComplete={() => onToggleComplete(t)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskRow({
  task, today, members, assignee, role, selected, onSelectToggle,
  onEdit, onSetStatus, onAssign, onDate, onToggleComplete,
}: {
  task: Task;
  today: string;
  members: Member[];
  assignee?: Member;
  role: Role | null;
  selected?: boolean;
  onSelectToggle?: () => void;
  onEdit: () => void;
  onSetStatus: (s: TaskStatus) => void;
  onAssign: (uid: string | null) => void;
  onDate: (d: string) => void;
  onToggleComplete: () => void;
}) {
  const status = (task.status ?? (task.completed ? "done" : "todo")) as TaskStatus;
  const isOverdue = !task.completed && task.scheduled_date < today;
  return (
    <div className={`grid grid-cols-[1.5rem_1.25rem_minmax(0,1fr)_8rem_10rem_8.5rem_2rem] items-center gap-3 border-b border-border/40 px-3 py-2 hover:bg-accent/20 ${selected ? "bg-primary/5" : ""}`}>
      <button
        onClick={onToggleComplete}
        className={`text-muted-foreground/50 hover:text-emerald-500 ${task.completed ? "text-emerald-500" : ""}`}
        title={task.completed ? "Reabrir" : "Concluir"}
      >
        {task.completed ? <CheckCircle2 className="h-4 w-4 fill-emerald-500/20" /> : <Circle className="h-4 w-4" />}
      </button>
      <Checkbox
        checked={!!selected}
        onCheckedChange={() => onSelectToggle?.()}
        aria-label="Selecionar"
      />

      <button onClick={onEdit} className="min-w-0 text-left">
        <div className="flex items-center gap-1.5">
          <CategoryIcon category={task.category} className="h-3 w-3 shrink-0" />
          {(task as any).non_negotiable && !task.completed && <Lock className="h-3 w-3 text-overdue shrink-0" />}
          <span className={`truncate text-sm ${task.completed ? "line-through text-muted-foreground" : ""}`}>
            {task.title}
          </span>
          {role && <RoleBadge role={role} size="xs" />}
        </div>
        {task.duration_minutes > 0 && (
          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-2.5 w-2.5" /> {task.duration_minutes}min
          </div>
        )}
      </button>

      <div className="relative">
        <input
          type="date"
          value={task.scheduled_date}
          onChange={(e) => onDate(e.target.value)}
          className={`h-7 w-full rounded border border-border/50 bg-transparent px-1.5 text-xs tabular-nums ${isOverdue ? "text-overdue border-overdue/40" : ""}`}
        />
      </div>

      <Select value={task.assignee_id ?? ""} onValueChange={(v) => onAssign(v || null)}>
        <SelectTrigger className="h-7 text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <Avatar name={nameOf(assignee)} />
            <span className="truncate">{nameOf(assignee)}</span>
          </div>
        </SelectTrigger>
        <SelectContent>
          {members.map((m) => (
            <SelectItem key={m.user_id} value={m.user_id}>
              <div className="flex items-center gap-2">
                <Avatar name={nameOf(m)} />
                <span>{nameOf(m)}{m.is_me ? " (você)" : ""}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={status} onValueChange={(v) => onSetStatus(v as TaskStatus)}>
        <SelectTrigger className={`h-7 text-xs border ${STATUS_COLOR[status]}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
            <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <button onClick={onEdit} className="text-muted-foreground/60 hover:text-foreground" title="Editar">
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ============================================================
   Kanban view
============================================================ */
function KanbanView({
  tasks, members, memberById, rolesById, onEdit, onSetStatus, onUpdate,
}: {
  tasks: Task[];
  members: Member[];
  memberById: Map<string, Member>;
  rolesById: Map<string, Role>;
  onEdit: (t: Task) => void;
  onSetStatus: (id: string, status: TaskStatus) => Promise<void> | void;
  onUpdate: (id: string, patch: Partial<Task>) => Promise<void> | void;
}) {
  const cols: TaskStatus[] = ["todo", "doing", "done"];
  const byStatus = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = { todo: [], doing: [], done: [] };
    for (const t of tasks) {
      const s = (t.status ?? (t.completed ? "done" : "todo")) as TaskStatus;
      map[s].push(t);
    }
    for (const k of cols) map[k] = sortByDate(map[k]);
    return map;
  }, [tasks]);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {cols.map((s) => (
        <div key={s} className="flex flex-col rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
            <div className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[s]}`}>
              {STATUS_LABEL[s]}
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">{byStatus[s].length}</span>
          </div>
          <div className="space-y-2 p-2">
            {byStatus[s].map((t) => (
              <KanbanCard
                key={t.id}
                task={t}
                members={members}
                assignee={memberById.get(t.assignee_id ?? "")}
                role={t.role_id ? rolesById.get(t.role_id) ?? null : null}
                onEdit={() => onEdit(t)}
                onSetStatus={(ns) => onSetStatus(t.id, ns)}
                onAssign={(uid) => onUpdate(t.id, { assignee_id: uid })}
              />
            ))}
            {byStatus[s].length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">Vazio</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function KanbanCard({
  task, members, assignee, role, onEdit, onSetStatus, onAssign,
}: {
  task: Task;
  members: Member[];
  assignee?: Member;
  role: Role | null;
  onEdit: () => void;
  onSetStatus: (s: TaskStatus) => void;
  onAssign: (uid: string | null) => void;
}) {
  const today = todayISO();
  const isOverdue = !task.completed && task.scheduled_date < today;
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-2.5 shadow-sm hover:border-primary/40">
      <button onClick={onEdit} className="block w-full text-left">
        <div className="flex items-start gap-1.5">
          <CategoryIcon category={task.category} className="h-3 w-3 mt-0.5 shrink-0" />
          <span className="text-sm font-medium leading-snug">{task.title}</span>
        </div>
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 tabular-nums ${isOverdue ? "border-overdue/40 bg-overdue/10 text-overdue" : "border-border/60 text-muted-foreground"}`}>
          {isOverdue && <AlertCircle className="h-2.5 w-2.5" />}
          {formatShort(task.scheduled_date)}
        </span>
        {role && <RoleBadge role={role} size="xs" />}
      </div>
      <div className="mt-2 flex items-center justify-between gap-1.5">
        <Select value={task.assignee_id ?? ""} onValueChange={(v) => onAssign(v || null)}>
          <SelectTrigger className="h-7 flex-1 text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <Avatar name={nameOf(assignee)} />
              <span className="truncate">{nameOf(assignee)}</span>
            </div>
          </SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.user_id} value={m.user_id}>{nameOf(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={(task.status ?? (task.completed ? "done" : "todo")) as TaskStatus} onValueChange={(v) => onSetStatus(v as TaskStatus)}>
          <SelectTrigger className="h-7 w-8 px-1 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/* ============================================================
   Timeline view (simple Gantt by week)
============================================================ */
function TimelineView({
  tasks, memberById, rolesById, onEdit,
}: {
  tasks: Task[];
  memberById: Map<string, Member>;
  rolesById: Map<string, Role>;
  onEdit: (t: Task) => void;
}) {
  const sorted = useMemo(() => sortByDate(tasks.filter((t) => !!t.scheduled_date)), [tasks]);
  if (sorted.length === 0) {
    return <p className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-6 text-center text-sm text-muted-foreground">Sem datas para exibir.</p>;
  }
  const min = sorted[0].scheduled_date;
  const max = sorted[sorted.length - 1].scheduled_date;
  const minT = new Date(min + "T00:00:00").getTime();
  const maxT = new Date(max + "T00:00:00").getTime();
  const span = Math.max(1, (maxT - minT) / 86400000);
  const today = todayISO();
  const todayT = new Date(today + "T00:00:00").getTime();
  const todayPct = ((todayT - minT) / 86400000 / span) * 100;

  // Track width grows with task count so dense projects get a horizontal scrollbar
  // instead of overlapping labels.
  const trackMinWidth = Math.max(480, Math.min(2400, sorted.length * 80));

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-4 backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>{formatShort(min)}</span>
        <span>{sorted.length} tarefas</span>
        <span>{formatShort(max)}</span>
      </div>
      <div className="flex">
        {/* Fixed title column */}
        <div className="w-[220px] shrink-0 space-y-1.5 pr-2">
          {sorted.map((t) => {
            const role = t.role_id ? rolesById.get(t.role_id) : null;
            return (
              <button
                key={t.id}
                onClick={() => onEdit(t)}
                className="flex h-9 w-full items-center gap-1.5 rounded-md border border-border/40 bg-background/40 px-2 text-left text-xs hover:border-primary/50"
                title={t.title}
              >
                <span className={`truncate ${t.completed ? "line-through text-muted-foreground" : ""}`}>{t.title}</span>
                {role && <RoleBadge role={role} size="xs" />}
              </button>
            );
          })}
        </div>
        {/* Scrollable timeline track */}
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="relative space-y-1.5" style={{ minWidth: `${trackMinWidth}px` }}>
            {todayPct >= 0 && todayPct <= 100 && (
              <div className="pointer-events-none absolute inset-y-0 w-px bg-primary/60" style={{ left: `${todayPct}%` }}>
                <span className="absolute -top-3 -translate-x-1/2 rounded bg-primary px-1 py-0.5 text-[9px] font-semibold text-primary-foreground">hoje</span>
              </div>
            )}
            {sorted.map((t) => {
              const tT = new Date(t.scheduled_date + "T00:00:00").getTime();
              const left = ((tT - minT) / 86400000 / span) * 100;
              const status = (t.status ?? (t.completed ? "done" : "todo")) as TaskStatus;
              const assignee = memberById.get(t.assignee_id ?? "");
              const isOverdue = !t.completed && t.scheduled_date < today;
              const color = t.completed ? "bg-emerald-500/60" : isOverdue ? "bg-overdue" : status === "doing" ? "bg-primary" : "bg-muted-foreground/50";
              return (
                <button
                  key={t.id}
                  onClick={() => onEdit(t)}
                  className="group relative flex h-9 w-full items-center rounded-md border border-border/40 bg-background/40 hover:border-primary/50"
                  title={t.title}
                >
                  <span className="absolute inset-y-1 rounded-sm" style={{ left: `calc(${left}% - 4px)`, width: "8px" }}>
                    <span className={`block h-full w-full rounded-full ${color}`} />
                  </span>
                  <span
                    className="pointer-events-none absolute flex items-center gap-1.5 whitespace-nowrap px-2 text-[10px] text-muted-foreground"
                    style={{ left: `calc(${left}% + 12px)` }}
                  >
                    {assignee && <Avatar name={nameOf(assignee)} />}
                    <span className="tabular-nums">{formatShort(t.scheduled_date)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}


/* ============================================================
   Bits
============================================================ */
function ToggleBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon} {children}
    </button>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary">
      {initials}
    </span>
  );
}

function sortByDate(arr: Task[]) {
  return [...arr].sort(
    (a, b) => a.scheduled_date.localeCompare(b.scheduled_date) || a.position - b.position,
  );
}
