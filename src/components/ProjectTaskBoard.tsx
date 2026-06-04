import { useMemo, useRef, useState } from "react";
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
          roles={roles}
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
          onEdit={onEdit}
          onUpdate={onUpdate}
        />
      )}
    </div>
  );
}

/* ============================================================
   Table view
============================================================ */
function TableView({
  tasks, grouping, members, memberById, roles, rolesById, ownerId,
  onEdit, onSetStatus, onUpdate, onToggleComplete, onBulkDelete,
}: {
  tasks: Task[];
  grouping: Grouping;
  members: Member[];
  memberById: Map<string, Member>;
  roles: Role[];
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
  const bulkRole = async (rid: string | null) => {
    await Promise.all(ids.map((id) => onUpdate(id, { role_id: rid } as any)));
    toast.success(rid ? "Papel atualizado" : "Papel removido");
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
   Timeline view — zoomable Gantt with draggable bars
============================================================ */
type Zoom = "day" | "week" | "month" | "quarter";
type TLGroup = "none" | "status" | "assignee";

const ZOOM_PX: Record<Zoom, number> = { day: 56, week: 22, month: 9, quarter: 4 };
const ZOOM_LABEL: Record<Zoom, string> = { day: "Dia", week: "Semana", month: "Mês", quarter: "Trimestre" };

function startOfMonth(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}
function diffDays(a: string, b: string) {
  const at = new Date(a + "T00:00:00").getTime();
  const bt = new Date(b + "T00:00:00").getTime();
  return Math.round((bt - at) / 86400000);
}
function fmtMonth(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}
function fmtDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function TimelineView({
  tasks, memberById, onEdit, onUpdate,
}: {
  tasks: Task[];
  memberById: Map<string, Member>;
  onEdit: (t: Task) => void;
  onUpdate: (id: string, patch: Partial<Task>) => Promise<void> | void;
}) {
  const [zoom, setZoom] = useState<Zoom>("week");
  const [group, setGroup] = useState<TLGroup>("none");
  const topScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  const sorted = useMemo(() => sortByDate(tasks.filter((t) => !!t.scheduled_date)), [tasks]);
  if (sorted.length === 0) {
    return <p className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-6 text-center text-sm text-muted-foreground">Sem datas para exibir.</p>;
  }

  const today = todayISO();
  // Pad range a bit so today line + future drag space are visible
  const rawMin = sorted[0].scheduled_date;
  const rawMax = sorted[sorted.length - 1].scheduled_date;
  const minDate = addDays(rawMin < today ? rawMin : today, -3);
  const maxDate = addDays(rawMax > today ? rawMax : today, 14);
  const totalDays = diffDays(minDate, maxDate) + 1;
  const pxPerDay = ZOOM_PX[zoom];
  const trackWidth = totalDays * pxPerDay;

  // Month markers
  const months: { iso: string; left: number; width: number; label: string }[] = [];
  let cursor = startOfMonth(minDate);
  while (cursor <= maxDate) {
    const [y, m] = cursor.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const startOffset = Math.max(0, diffDays(minDate, cursor));
    const endOffset = Math.min(totalDays, diffDays(minDate, next));
    months.push({
      iso: cursor,
      left: startOffset * pxPerDay,
      width: Math.max(0, (endOffset - startOffset) * pxPerDay),
      label: fmtMonth(cursor),
    });
    cursor = next;
  }

  // Day ticks (only at sensible zooms)
  const showDayTicks = zoom === "day" || zoom === "week";
  const dayTicks: { iso: string; left: number; isToday: boolean; isWeekend: boolean }[] = [];
  if (showDayTicks) {
    for (let i = 0; i < totalDays; i++) {
      const iso = addDays(minDate, i);
      const [y, m, d] = iso.split("-").map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      dayTicks.push({ iso, left: i * pxPerDay, isToday: iso === today, isWeekend: dow === 0 || dow === 6 });
    }
  }

  const todayLeft = diffDays(minDate, today) * pxPerDay;

  // Grouping
  const groups = useMemo(() => {
    if (group === "none") return [{ key: "all", label: "", tasks: sorted }];
    if (group === "status") {
      const order: TaskStatus[] = ["doing", "todo", "done"];
      return order.map((s) => ({
        key: s,
        label: STATUS_LABEL[s],
        tasks: sorted.filter((t) => (t.status ?? (t.completed ? "done" : "todo")) === s),
      })).filter((g) => g.tasks.length > 0);
    }
    // assignee
    const map = new Map<string, Task[]>();
    for (const t of sorted) {
      const aid = (t.assignee_id ?? "__unassigned") as string;
      map.set(aid, [...(map.get(aid) ?? []), t]);
    }
    return Array.from(map.entries()).map(([uid, ts]) => ({
      key: uid,
      label: uid === "__unassigned" ? "Sem responsável" : nameOf(memberById.get(uid)),
      tasks: ts,
    }));
  }, [sorted, group, memberById]);

  // Sync top/bottom horizontal scrollbars
  const onScrollTop = () => {
    if (syncing.current) return;
    syncing.current = true;
    if (bottomScrollRef.current && topScrollRef.current) {
      bottomScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
    syncing.current = false;
  };
  const onScrollBottom = () => {
    if (syncing.current) return;
    syncing.current = true;
    if (topScrollRef.current && bottomScrollRef.current) {
      topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft;
    }
    syncing.current = false;
  };

  const scrollToToday = () => {
    if (!bottomScrollRef.current) return;
    const target = Math.max(0, todayLeft - bottomScrollRef.current.clientWidth / 2);
    bottomScrollRef.current.scrollTo({ left: target, behavior: "smooth" });
    if (topScrollRef.current) topScrollRef.current.scrollLeft = target;
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
        <div className="inline-flex rounded-md border border-border/60 bg-background/40 p-0.5">
          {(Object.keys(ZOOM_PX) as Zoom[]).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                zoom === z ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {ZOOM_LABEL[z]}
            </button>
          ))}
        </div>
        <Select value={group} onValueChange={(v) => setGroup(v as TLGroup)}>
          <SelectTrigger className="h-7 w-40 text-xs">
            <Layers className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem agrupamento</SelectItem>
            <SelectItem value="status">Por status</SelectItem>
            <SelectItem value="assignee">Por responsável</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={scrollToToday}>
          Ir para hoje
        </Button>
        <div className="ml-auto text-[11px] text-muted-foreground">
          {sorted.length} tarefas · {fmtDay(rawMin)} → {fmtDay(rawMax)} · arraste as barras para mudar a data
        </div>
      </div>

      <div className="flex">
        {/* Fixed left column header spacer + titles */}
        <div className="w-[220px] shrink-0 border-r border-border/60">
          <div className="h-12 border-b border-border/60 bg-muted/20 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-end">
            Tarefa
          </div>
          {groups.map((g) => (
            <div key={g.key}>
              {g.label && (
                <div className="border-b border-border/40 bg-background/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.label} · {g.tasks.length}
                </div>
              )}
              {g.tasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onEdit(t)}
                  className="flex h-9 w-full items-center gap-1.5 border-b border-border/30 px-3 text-left text-xs hover:bg-accent/20"
                  title={t.title}
                >
                  <CategoryIcon category={t.category} className="h-3 w-3 shrink-0" />
                  <span className={`truncate ${t.completed ? "line-through text-muted-foreground" : ""}`}>{t.title}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Right column: top scrollbar + header + body */}
        <div className="min-w-0 flex-1">
          {/* TOP scrollbar (mirror) */}
          <div
            ref={topScrollRef}
            onScroll={onScrollTop}
            className="overflow-x-auto overflow-y-hidden"
            style={{ height: 12 }}
          >
            <div style={{ width: trackWidth, height: 1 }} />
          </div>

          {/* Synced header + body share one horizontal scroll */}
          <div
            ref={bottomScrollRef}
            onScroll={onScrollBottom}
            className="overflow-x-auto"
          >
            <div style={{ width: trackWidth }}>
              {/* Header: months + days */}
              <div className="relative h-12 border-b border-border/60 bg-muted/20">
                {/* Month row */}
                <div className="relative h-6 border-b border-border/40">
                  {months.map((mo) => (
                    <div
                      key={mo.iso}
                      className="absolute top-0 flex h-full items-center border-l border-border/40 px-1.5 text-[11px] font-semibold capitalize text-foreground/80"
                      style={{ left: mo.left, width: mo.width }}
                    >
                      {mo.label}
                    </div>
                  ))}
                </div>
                {/* Day row */}
                <div className="relative h-6">
                  {showDayTicks ? (
                    dayTicks.map((d) => {
                      const dd = d.iso.slice(8, 10);
                      const showLabel = zoom === "day" || pxPerDay >= 20;
                      return (
                        <div
                          key={d.iso}
                          className={`absolute top-0 flex h-full items-center justify-center border-l text-[10px] tabular-nums ${
                            d.isToday ? "border-primary/60 text-primary font-semibold" :
                            d.isWeekend ? "border-border/30 text-muted-foreground/60 bg-muted/20" :
                            "border-border/30 text-muted-foreground"
                          }`}
                          style={{ left: d.left, width: pxPerDay }}
                        >
                          {showLabel ? dd : ""}
                        </div>
                      );
                    })
                  ) : (
                    months.map((mo) => (
                      <div
                        key={mo.iso}
                        className="absolute top-0 flex h-full items-center border-l border-border/30 px-1.5 text-[10px] text-muted-foreground"
                        style={{ left: mo.left, width: mo.width }}
                      >
                        &nbsp;
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Rows */}
              <div className="relative">
                {/* Today line */}
                {todayLeft >= 0 && todayLeft <= trackWidth && (
                  <div
                    className="pointer-events-none absolute inset-y-0 z-10 w-px bg-primary/70"
                    style={{ left: todayLeft }}
                  />
                )}
                {/* Weekend stripes (only when day ticks shown) */}
                {showDayTicks && dayTicks.filter((d) => d.isWeekend).map((d) => (
                  <div
                    key={`w-${d.iso}`}
                    className="pointer-events-none absolute inset-y-0 bg-muted/15"
                    style={{ left: d.left, width: pxPerDay }}
                  />
                ))}

                {groups.map((g) => (
                  <div key={g.key}>
                    {g.label && <div className="h-[26px] border-b border-border/40 bg-background/30" />}
                    {g.tasks.map((t) => (
                      <TimelineRow
                        key={t.id}
                        task={t}
                        minDate={minDate}
                        pxPerDay={pxPerDay}
                        trackWidth={trackWidth}
                        today={today}
                        assignee={memberById.get(t.assignee_id ?? "")}
                        onEdit={() => onEdit(t)}
                        onUpdate={onUpdate}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineRow({
  task, minDate, pxPerDay, trackWidth, today, assignee, onEdit, onUpdate,
}: {
  task: Task;
  minDate: string;
  pxPerDay: number;
  trackWidth: number;
  today: string;
  assignee?: Member;
  onEdit: () => void;
  onUpdate: (id: string, patch: Partial<Task>) => Promise<void> | void;
}) {
  const baseLeft = diffDays(minDate, task.scheduled_date) * pxPerDay;
  const [dragOffset, setDragOffset] = useState(0);
  const draggingRef = useRef(false);

  const status = (task.status ?? (task.completed ? "done" : "todo")) as TaskStatus;
  const isOverdue = !task.completed && task.scheduled_date < today;
  const color = task.completed
    ? "bg-emerald-500/70 border-emerald-500/50"
    : isOverdue
    ? "bg-overdue/80 border-overdue"
    : status === "doing"
    ? "bg-primary border-primary/60"
    : "bg-primary/55 border-primary/40";

  // Bar width: derive from duration (min 1 day visual)
  const durationDays = Math.max(1, Math.ceil((task.duration_minutes || 0) / (60 * 8)));
  const barWidth = Math.max(pxPerDay * durationDays, 18);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    let lastDelta = 0;
    draggingRef.current = true;

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      lastDelta = delta;
      setDragOffset(delta);
    };
    const onUp = async () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const days = Math.round(lastDelta / pxPerDay);
      setDragOffset(0);
      // Reset dragging after click handler check
      setTimeout(() => { draggingRef.current = false; }, 0);
      if (days !== 0) {
        const newDate = addDays(task.scheduled_date, days);
        try {
          await onUpdate(task.id, { scheduled_date: newDate } as any);
          toast.success(`Movida para ${fmtDay(newDate)}`);
        } catch (err: any) {
          toast.error(err?.message || "Não foi possível mover");
        }
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onClick = (e: React.MouseEvent) => {
    if (draggingRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onEdit();
  };

  const left = Math.max(0, Math.min(trackWidth - barWidth, baseLeft + dragOffset));

  return (
    <div className="relative h-9 border-b border-border/30">
      <div
        role="button"
        onMouseDown={onMouseDown}
        onClick={onClick}
        title={`${task.title} · ${fmtDay(task.scheduled_date)}${dragOffset !== 0 ? ` → ${fmtDay(addDays(task.scheduled_date, Math.round(dragOffset / pxPerDay)))}` : ""}`}
        className={`group absolute top-1.5 flex h-6 cursor-grab items-center gap-1.5 rounded-md border px-1.5 text-[10px] font-medium text-primary-foreground shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing ${color} ${task.completed ? "opacity-75" : ""}`}
        style={{ left, width: barWidth }}
      >
        {assignee && barWidth >= 40 && <Avatar name={nameOf(assignee)} />}
        <span className="truncate">{barWidth >= 60 ? task.title : ""}</span>
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
