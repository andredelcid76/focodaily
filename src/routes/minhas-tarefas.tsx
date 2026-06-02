import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CheckCircle2, Circle, Clock, FolderKanban, Layers, ListTodo, Lock, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryIcon } from "@/components/CategoryBadge";
import { formatShort, todayISO } from "@/lib/date";
import { listMyAssignedTasks, type MyTaskRow } from "@/lib/myTasks.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/minhas-tarefas")({
  component: MyTasksPage,
  head: () => ({
    meta: [{ title: "Minhas tarefas · Focou" }],
  }),
});

type Grouping = "project" | "due" | "status" | "none";

const STATUS_LABEL: Record<MyTaskRow["status"], string> = {
  todo: "A fazer",
  doing: "Em andamento",
  done: "Concluída",
};
const STATUS_COLOR: Record<MyTaskRow["status"], string> = {
  todo: "bg-muted text-muted-foreground border-border",
  doing: "bg-primary/10 text-primary border-primary/30",
  done: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
};

function MyTasksPage() {
  const fetchTasks = useServerFn(listMyAssignedTasks);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["my-assigned-tasks"],
    queryFn: () => fetchTasks(),
    staleTime: 30_000,
  });

  const [search, setSearch] = useState("");
  const [grouping, setGrouping] = useState<Grouping>("project");
  const [hideDone, setHideDone] = useState(true);

  const today = todayISO();
  const tasks = data?.tasks ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = tasks;
    if (hideDone) arr = arr.filter((t) => !t.completed);
    if (q) arr = arr.filter((t) => t.title.toLowerCase().includes(q) || (t.project?.name ?? "").toLowerCase().includes(q));
    return arr;
  }, [tasks, search, hideDone]);

  const groups = useMemo(() => buildGroups(filtered, grouping, today), [filtered, grouping, today]);

  const stats = useMemo(() => {
    const open = tasks.filter((t) => !t.completed);
    const overdue = open.filter((t) => t.scheduled_date < today).length;
    const due = open.filter((t) => t.scheduled_date === today).length;
    const projects = new Set(tasks.filter((t) => t.project).map((t) => t.project!.id)).size;
    return { open: open.length, overdue, due, projects };
  }, [tasks, today]);

  const updateStatus = async (t: MyTaskRow, status: MyTaskRow["status"]) => {
    const patch: Record<string, unknown> = { status };
    if (status === "done") {
      patch.completed = true;
      patch.completed_at = new Date().toISOString();
    } else if (t.completed) {
      patch.completed = false;
      patch.completed_at = null;
    }
    const { error } = await supabase.from("tasks").update(patch).eq("id", t.id);
    if (error) toast.error(error.message);
    else refetch();
  };

  const toggleComplete = async (t: MyTaskRow) => {
    const next = !t.completed;
    const { error } = await supabase
      .from("tasks")
      .update({
        completed: next,
        completed_at: next ? new Date().toISOString() : null,
        status: next ? "done" : "todo",
      })
      .eq("id", t.id);
    if (error) toast.error(error.message);
    else refetch();
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <ListTodo className="h-3.5 w-3.5" /> Visão macro
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Minhas tarefas</h1>
            <p className="text-sm text-muted-foreground">
              Tarefas delegadas a você em todos os projetos.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label="Abertas" value={stats.open} />
            <StatCard label="Vencem hoje" value={stats.due} tone={stats.due > 0 ? "primary" : "default"} />
            <StatCard label="Atrasadas" value={stats.overdue} tone={stats.overdue > 0 ? "danger" : "default"} />
            <StatCard label="Projetos" value={stats.projects} />
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card/40 px-3 py-2 backdrop-blur-sm">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tarefa ou projeto…"
            className="h-9 pl-8 text-sm"
          />
        </div>
        <Select value={grouping} onValueChange={(v) => setGrouping(v as Grouping)}>
          <SelectTrigger className="h-9 w-44 text-xs">
            <Layers className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="project">Por projeto</SelectItem>
            <SelectItem value="due">Por prazo</SelectItem>
            <SelectItem value="status">Por status</SelectItem>
            <SelectItem value="none">Sem agrupamento</SelectItem>
          </SelectContent>
        </Select>
        <button
          onClick={() => setHideDone((v) => !v)}
          className={`h-9 rounded-md border px-3 text-xs font-medium transition-colors ${
            hideDone
              ? "border-border/60 bg-background text-muted-foreground hover:text-foreground"
              : "border-primary/40 bg-primary/10 text-primary"
          }`}
        >
          {hideDone ? "Mostrar concluídas" : "Ocultar concluídas"}
        </button>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-10 text-center text-sm text-muted-foreground">
          Carregando…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {tasks.length === 0
              ? "Nenhuma tarefa delegada a você ainda."
              : "Nenhum resultado com os filtros atuais."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section
              key={g.key}
              className="overflow-hidden rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm"
            >
              <header className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-3 py-2 text-xs">
                <div className="flex items-center gap-2 font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.projectColor && (
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: g.projectColor }}
                    />
                  )}
                  <span>{g.label}</span>
                  <span className="text-muted-foreground/60">· {g.tasks.length}</span>
                </div>
                {g.projectId && (
                  <Link
                    to="/projetos/$id"
                    params={{ id: g.projectId }}
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                  >
                    <FolderKanban className="h-3 w-3" />
                    Abrir projeto
                  </Link>
                )}
              </header>
              <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_8rem_10rem_8.5rem] items-center gap-3 border-b border-border/60 bg-background/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span />
                <span>Tarefa</span>
                <span>Vencimento</span>
                <span>Projeto</span>
                <span>Status</span>
              </div>
              {g.tasks.map((t) => (
                <Row
                  key={t.id}
                  task={t}
                  today={today}
                  onToggle={() => toggleComplete(t)}
                  onStatus={(s) => updateStatus(t, s)}
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  task,
  today,
  onToggle,
  onStatus,
}: {
  task: MyTaskRow;
  today: string;
  onToggle: () => void;
  onStatus: (s: MyTaskRow["status"]) => void;
}) {
  const isOverdue = !task.completed && task.scheduled_date < today;
  return (
    <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_8rem_10rem_8.5rem] items-center gap-3 border-b border-border/40 px-3 py-2 hover:bg-accent/20">
      <button
        onClick={onToggle}
        className={`text-muted-foreground/50 hover:text-emerald-500 ${task.completed ? "text-emerald-500" : ""}`}
        title={task.completed ? "Reabrir" : "Concluir"}
      >
        {task.completed ? (
          <CheckCircle2 className="h-4 w-4 fill-emerald-500/20" />
        ) : (
          <Circle className="h-4 w-4" />
        )}
      </button>

      <Link
        to="/projetos/$id"
        params={{ id: task.project_id ?? "" }}
        className="min-w-0 text-left"
      >
        <div className="flex items-center gap-1.5">
          <CategoryIcon category={task.category} className="h-3 w-3 shrink-0" />
          {task.non_negotiable && !task.completed && <Lock className="h-3 w-3 shrink-0 text-overdue" />}
          <span className={`truncate text-sm ${task.completed ? "text-muted-foreground line-through" : ""}`}>
            {task.title}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
          {task.duration_minutes > 0 && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" /> {task.duration_minutes}min
            </span>
          )}
          {task.delegated_by_name && (
            <span className="truncate">delegada por {task.delegated_by_name}</span>
          )}
        </div>
      </Link>

      <span
        className={`tabular-nums text-xs ${
          isOverdue ? "font-medium text-overdue" : "text-muted-foreground"
        }`}
      >
        {formatShort(task.scheduled_date)}
      </span>

      <div className="flex min-w-0 items-center gap-1.5 text-xs">
        {task.project ? (
          <>
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: task.project.color ?? "#888" }}
            />
            <span className="truncate">{task.project.name}</span>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>

      <Select value={task.status} onValueChange={(v) => onStatus(v as MyTaskRow["status"])}>
        <SelectTrigger className={`h-7 text-xs ${STATUS_COLOR[task.status]}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(STATUS_LABEL) as MyTaskRow["status"][]).map((s) => (
            <SelectItem key={s} value={s}>
              {STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "primary" | "danger";
}) {
  const toneCls =
    tone === "danger"
      ? "border-overdue/40 bg-overdue/10 text-overdue"
      : tone === "primary"
        ? "border-primary/40 bg-primary/10 text-primary"
        : "border-border/60 bg-card/40 text-foreground";
  return (
    <div className={`rounded-xl border px-3 py-2 ${toneCls}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="font-display text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

type Group = {
  key: string;
  label: string;
  tasks: MyTaskRow[];
  projectId?: string;
  projectColor?: string | null;
};

function buildGroups(tasks: MyTaskRow[], grouping: Grouping, today: string): Group[] {
  if (grouping === "none") {
    return [{ key: "all", label: "Todas", tasks: sortTasks(tasks) }];
  }
  if (grouping === "project") {
    const map = new Map<string, Group>();
    for (const t of tasks) {
      const key = t.project?.id ?? "__none";
      const label = t.project?.name ?? "Sem projeto";
      if (!map.has(key)) {
        map.set(key, {
          key,
          label,
          tasks: [],
          projectId: t.project?.id,
          projectColor: t.project?.color,
        });
      }
      map.get(key)!.tasks.push(t);
    }
    return Array.from(map.values())
      .map((g) => ({ ...g, tasks: sortTasks(g.tasks) }))
      .sort((a, b) => b.tasks.length - a.tasks.length);
  }
  if (grouping === "status") {
    const order: MyTaskRow["status"][] = ["doing", "todo", "done"];
    return order
      .map((s) => ({
        key: s,
        label: STATUS_LABEL[s],
        tasks: sortTasks(tasks.filter((t) => t.status === s)),
      }))
      .filter((g) => g.tasks.length > 0);
  }
  // due
  const buckets: Record<string, MyTaskRow[]> = {
    overdue: [],
    today: [],
    week: [],
    later: [],
    done: [],
  };
  const week = addDaysISO(today, 7);
  for (const t of tasks) {
    if (t.completed) buckets.done.push(t);
    else if (t.scheduled_date < today) buckets.overdue.push(t);
    else if (t.scheduled_date === today) buckets.today.push(t);
    else if (t.scheduled_date <= week) buckets.week.push(t);
    else buckets.later.push(t);
  }
  return [
    { key: "overdue", label: "Atrasadas", tasks: sortTasks(buckets.overdue) },
    { key: "today", label: "Hoje", tasks: sortTasks(buckets.today) },
    { key: "week", label: "Próximos 7 dias", tasks: sortTasks(buckets.week) },
    { key: "later", label: "Mais tarde", tasks: sortTasks(buckets.later) },
    { key: "done", label: "Concluídas", tasks: sortTasks(buckets.done) },
  ].filter((g) => g.tasks.length > 0);
}

function sortTasks(arr: MyTaskRow[]) {
  return [...arr].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
}

function addDaysISO(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
