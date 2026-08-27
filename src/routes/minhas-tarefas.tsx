import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Circle,
  ListTodo,
  Lock,
  Search,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AppShell } from "@/components/AppShell";
import { CategoryIcon } from "@/components/CategoryBadge";
import { TaskCompleteButton } from "@/components/TaskCompleteButton";
import { formatShort, todayISO } from "@/lib/date";
import { listMyAssignedTasks, type MyTaskRow } from "@/lib/myTasks.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useRoles } from "@/hooks/useRoles";
import { useProjects, type Project } from "@/hooks/useProjects";
import { TaskDialog, type RecurrenceScope } from "@/components/TaskDialog";
import type { Task } from "@/hooks/useTasks";
import { useTaskDependencies, blockingPredecessorTitles } from "@/hooks/useTaskDependencies";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link2, PauseCircle } from "lucide-react";
import { TaskListRow, TaskListHeader, type TaskSortKey } from "@/components/TaskListRow";
import { useTaskColumns } from "@/hooks/useTaskColumns";
import { ColumnSettingsPopover } from "@/components/ColumnSettingsPopover";
import { useStickyState, setSerialize, setDeserialize } from "@/hooks/useStickyState";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";

export const Route = createFileRoute("/minhas-tarefas")({
  component: () => (
    <AppShell>
      <MyTasksPage />
    </AppShell>
  ),
  head: () => ({ meta: [{ title: "Tarefas · Focou" }] }),
});

type SortKey = "title" | "kind" | "project" | "role" | "scheduled_date" | "status" | "category" | "duration";
type SortDir = "asc" | "desc";

const STATUS_LABEL: Record<MyTaskRow["status"], string> = {
  todo: "A fazer",
  doing: "Em andamento",
  done: "Concluída",
};
const STATUS_CLS: Record<MyTaskRow["status"], string> = {
  todo: "bg-muted text-muted-foreground border-border",
  doing: "bg-primary/10 text-primary border-primary/30",
  done: "bg-primary/15 text-primary border-primary/30",
};
const CAT_LABEL: Record<MyTaskRow["category"], string> = {
  urgent: "Urgente",
  important: "Importante",
  circumstantial: "Circunstancial",
};

function MyTasksPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const { roles } = useRoles(userId);
  const { projects } = useProjects(userId);
  const fetchTasks = useServerFn(listMyAssignedTasks);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["my-assigned-tasks"],
    queryFn: () => fetchTasks(),
    staleTime: 30_000,
  });

  const today = todayISO();
  const tasks = data?.tasks ?? [];
  const { deps } = useTaskDependencies(userId);
  const blockedByMap = useMemo(() => {
    const taskMap = new Map(tasks.map((t) => [t.id, { title: t.title, completed: t.completed }]));
    const m = new Map<string, string[]>();
    for (const t of tasks) {
      const blockers = blockingPredecessorTitles(t.id, deps, taskMap);
      if (blockers.length > 0) m.set(t.id, blockers);
    }
    return m;
  }, [tasks, deps]);

  const confirmIfBlocked = (id: string): boolean => {
    const blockers = blockedByMap.get(id);
    if (!blockers || blockers.length === 0) return true;
    return window.confirm(
      `Esta tarefa está aguardando: ${blockers.join(", ")}. Concluir mesmo assim?`,
    );
  };

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  const openTask = async (id: string) => {
    setOpening(id);
    const { data: row, error } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
    setOpening(null);
    if (error || !row) {
      toast.error(error?.message ?? "Não foi possível abrir a tarefa.");
      return;
    }
    setEditingTask(row as Task);
    setDialogOpen(true);
  };

  // Ensure the task's project is available in the dialog selector even when
  // the user is only an assignee (not the owner) of the project.
  const projectsForDialog = useMemo<Project[]>(() => {
    if (!editingTask?.project_id) return projects;
    if (projects.some((p) => p.id === editingTask.project_id)) return projects;
    const fromRow = tasks.find((t) => t.id === editingTask.id);
    const proj = fromRow?.project;
    if (!proj) return projects;
    return [
      ...projects,
      {
        id: proj.id,
        name: proj.name,
        color: proj.color ?? "#8b5cf6",
        icon: proj.icon ?? "folder",
      } as Project,
    ];
  }, [projects, editingTask, tasks]);

  const handleSave = async (
    patch: Partial<Task>,
    _scope?: RecurrenceScope,
  ) => {
    if (!editingTask) return;
    const { error } = await supabase.from("tasks").update(patch).eq("id", editingTask.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Tarefa atualizada");
    refetch();
  };

  const handleDelete = async () => {
    if (!editingTask) return;
    const { error } = await supabase.from("tasks").delete().eq("id", editingTask.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Tarefa excluída");
    setDialogOpen(false);
    refetch();
  };

  const handleDialogToggleComplete = async () => {
    if (!editingTask) return;
    const next = !editingTask.completed;
    if (next && !confirmIfBlocked(editingTask.id)) return;
    const { error } = await supabase
      .from("tasks")
      .update({
        completed: next,
        completed_at: next ? new Date().toISOString() : null,
        status: next ? "done" : "todo",
      })
      .eq("id", editingTask.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refetch();
  };


  const P = { storage: "local" as const };
  const taskColumns = useTaskColumns("tasks-table-columns-v1");
  const [search, setSearch] = useStickyState("mt.search", "", P);
  const [statusFilter, setStatusFilter] = useStickyState<"all" | MyTaskRow["status"]>("mt.status", "all", P);
  const [ownerFilter, setOwnerFilter] = useStickyState<"all" | "mine" | "others">("mt.owner", "all", P);
  const [kindFilter, setKindFilter] = useStickyState<"all" | "personal" | "project">("mt.kind", "all", P);
  const [projectFilter, setProjectFilter] = useStickyState<string>("mt.project", "all", P);
  const [projectStatusFilter, setProjectStatusFilter] = useStickyState<
    "all" | "active_only" | "in_progress" | "active" | "paused" | "not_started" | "finished"
  >("mt.projectStatus", "all", P);
  const [roleFilter, setRoleFilter] = useStickyState<string>("mt.role", "all", P);
  const [categoryFilter, setCategoryFilter] = useStickyState<"all" | MyTaskRow["category"]>("mt.category", "all", P);
  const [hideDone, setHideDone] = useStickyState("mt.hideDone", true, P);
  const [dateRange, setDateRange] = useStickyState<
    "all" | "overdue" | "today" | "tomorrow" | "week" | "next7" | "month" | "next30" | "no_date" | "custom"
  >("mt.dateRange", "all", P);
  const [customFrom, setCustomFrom] = useStickyState<string>("mt.customFrom", "", P);
  const [customTo, setCustomTo] = useStickyState<string>("mt.customTo", "", P);
  const [sortKey, setSortKey] = useStickyState<SortKey>("mt.sortKey", "scheduled_date", P);
  const [sortDir, setSortDir] = useStickyState<SortDir>("mt.sortDir", "asc", P);
  const [selected, setSelected] = useStickyState<Set<string>>("mt.selected", new Set<string>(), {
    serialize: setSerialize,
    deserialize: setDeserialize,
  });
  const [bulkDate, setBulkDate] = useState("");

  const dateBounds = useMemo(() => {
    const [y, m, d] = today.split("-").map(Number);
    const base = new Date(y, m - 1, d);
    const fmt = (dt: Date) => {
      const yy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      const dd = String(dt.getDate()).padStart(2, "0");
      return `${yy}-${mm}-${dd}`;
    };
    const addD = (n: number) => {
      const dt = new Date(base);
      dt.setDate(dt.getDate() + n);
      return fmt(dt);
    };
    const day = base.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const monday = new Date(base);
    monday.setDate(monday.getDate() + diffToMon);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    const monthStart = new Date(base.getFullYear(), base.getMonth(), 1);
    const monthEnd = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    return {
      today,
      tomorrow: addD(1),
      next7: addD(7),
      next30: addD(30),
      weekStart: fmt(monday),
      weekEnd: fmt(sunday),
      monthStart: fmt(monthStart),
      monthEnd: fmt(monthEnd),
    };
  }, [today]);

  const projectOptions = useMemo(() => {
    const m = new Map<string, { id: string; name: string; color: string | null }>();
    for (const t of tasks) if (t.project) m.set(t.project.id, t.project);
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);

  const roleOptions = useMemo(() => {
    const m = new Map<string, { id: string; name: string; color: string }>();
    for (const t of tasks) if (t.role) m.set(t.role.id, t.role);
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (hideDone && t.completed) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      // Owner-based primary toggle: minhas = own/delegated; outros = shared
      if (ownerFilter === "mine" && t.kind === "shared") return false;
      if (ownerFilter === "others" && t.kind !== "shared") return false;
      if (kindFilter === "personal" && t.project_id) return false;
      if (kindFilter === "project" && !t.project_id) return false;
      if (projectFilter !== "all") {
        if (projectFilter === "__none" ? !!t.project_id : t.project?.id !== projectFilter) return false;
      }
      if (projectStatusFilter !== "all") {
        const ps = t.project?.status ?? null;
        if (projectStatusFilter === "active_only") {
          if (ps === "paused" || ps === "finished") return false;
        } else {
          if (ps !== projectStatusFilter) return false;
        }
      }
      if (roleFilter !== "all") {
        if (roleFilter === "__none" ? !!t.role_id : t.role?.id !== roleFilter) return false;
      }
      if (q && !t.title.toLowerCase().includes(q) && !(t.project?.name ?? "").toLowerCase().includes(q))
        return false;
      // date range
      if (dateRange !== "all") {
        const sd = t.scheduled_date;
        if (dateRange === "no_date") {
          if (sd) return false;
        } else if (!sd) {
          return false;
        } else {
          const b = dateBounds;
          switch (dateRange) {
            case "overdue":
              if (!(sd < b.today && !t.completed && t.project?.status !== "paused")) return false;
              break;

            case "today":
              if (sd !== b.today) return false;
              break;
            case "tomorrow":
              if (sd !== b.tomorrow) return false;
              break;
            case "week":
              if (sd < b.weekStart || sd > b.weekEnd) return false;
              break;
            case "next7":
              if (sd < b.today || sd > b.next7) return false;
              break;
            case "month":
              if (sd < b.monthStart || sd > b.monthEnd) return false;
              break;
            case "next30":
              if (sd < b.today || sd > b.next30) return false;
              break;
            case "custom":
              if (customFrom && sd < customFrom) return false;
              if (customTo && sd > customTo) return false;
              break;
          }
        }
      }
      return true;
    });
  }, [tasks, search, statusFilter, categoryFilter, ownerFilter, kindFilter, projectFilter, projectStatusFilter, roleFilter, hideDone, dateRange, customFrom, customTo, dateBounds]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const v = (() => {
        switch (sortKey) {
          case "title":
            return a.title.localeCompare(b.title);
          case "kind":
            return a.kind.localeCompare(b.kind);
          case "project":
            return (a.project?.name ?? "~").localeCompare(b.project?.name ?? "~");
          case "role":
            return (a.role?.name ?? "~").localeCompare(b.role?.name ?? "~");
          case "scheduled_date":
            return a.scheduled_date.localeCompare(b.scheduled_date);
          case "status":
            return a.status.localeCompare(b.status);
          case "category":
            return a.category.localeCompare(b.category);
          case "duration":
            return a.duration_minutes - b.duration_minutes;
        }
      })();
      return v * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const stats = useMemo(() => {
    const open = filtered.filter((t) => !t.completed);
    const isSuspended = (t: MyTaskRow) => t.project?.status === "paused" && !t.completed;
    return {
      total: filtered.length,
      open: open.length,
      overdue: open.filter((t) => t.scheduled_date < today && !isSuspended(t)).length,
      due: open.filter((t) => t.scheduled_date === today && !isSuspended(t)).length,
      delegated: filtered.filter((t) => t.kind === "delegated").length,
    };
  }, [filtered, today]);


  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const allVisibleSelected = sorted.length > 0 && sorted.every((t) => selected.has(t.id));
  const someVisibleSelected = sorted.some((t) => selected.has(t.id));

  const toggleSelectAll = () => {
    const next = new Set(selected);
    if (allVisibleSelected) sorted.forEach((t) => next.delete(t.id));
    else sorted.forEach((t) => next.add(t.id));
    setSelected(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const updateOne = async (
    id: string,
    patch: { status?: MyTaskRow["status"]; completed?: boolean; completed_at?: string | null },
  ) => {
    const { error } = await supabase.from("tasks").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  };

  const toggleComplete = async (t: MyTaskRow) => {
    const next = !t.completed;
    if (next && !confirmIfBlocked(t.id)) return;
    await updateOne(t.id, {
      completed: next,
      completed_at: next ? new Date().toISOString() : null,
      status: next ? "done" : "todo",
    });
    refetch();
  };

  const setStatus = async (t: MyTaskRow, status: MyTaskRow["status"]) => {
    if (status === "done" && !t.completed && !confirmIfBlocked(t.id)) return;
    const patch: Parameters<typeof updateOne>[1] = { status };
    if (status === "done") {
      patch.completed = true;
      patch.completed_at = new Date().toISOString();
    } else if (t.completed) {
      patch.completed = false;
      patch.completed_at = null;
    }
    await updateOne(t.id, patch);
    refetch();
  };

  const bulkStatus = async (status: MyTaskRow["status"]) => {
    if (selected.size === 0) return;
    let ids = Array.from(selected);
    if (status === "done") {
      const blocked = ids
        .map((id) => ({ id, blockers: blockedByMap.get(id) }))
        .filter((x) => x.blockers && x.blockers.length > 0);
      if (blocked.length > 0) {
        const ok = window.confirm(
          `${blocked.length} tarefa(s) selecionada(s) estão bloqueadas por dependências. Concluir todas mesmo assim?`,
        );
        if (!ok) ids = ids.filter((id) => !blockedByMap.get(id)?.length);
        if (ids.length === 0) return;
      }
    }
    const patch: Parameters<typeof updateOne>[1] = { status };
    if (status === "done") {
      patch.completed = true;
      patch.completed_at = new Date().toISOString();
    } else {
      patch.completed = false;
      patch.completed_at = null;
    }
    const { error } = await supabase.from("tasks").update(patch).in("id", ids);
    if (error) toast.error(error.message);
    else {
      toast.success(`${ids.length} tarefa(s) atualizada(s)`);
      setSelected(new Set());
      refetch();
    }
  };

  const [bulkKey, setBulkKey] = useState(0);
  const bulkPatch = async (patch: Partial<Task>, label: string) => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from("tasks").update(patch).in("id", ids);
    if (error) toast.error(error.message);
    else {
      toast.success(`${label} atualizado em ${ids.length} tarefa(s)`);
      setBulkKey((k) => k + 1);
      refetch();
    }
  };

  const headerSortKey: TaskSortKey | null =
    sortKey === "scheduled_date" ? "due"
    : sortKey === "title" || sortKey === "project" || sortKey === "role" || sortKey === "status" || sortKey === "duration"
      ? sortKey
      : null;

  const handleHeaderSort = (k: TaskSortKey) => {
    if (k === "position") return;
    toggleSort(k === "due" ? "scheduled_date" : (k as SortKey));
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Excluir ${selected.size} tarefa(s)? Apenas as suas serão removidas.`)) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from("tasks").delete().in("id", ids);
    if (error) toast.error(error.message);
    else {
      toast.success("Tarefas excluídas");
      setSelected(new Set());
      refetch();
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <ListTodo className="h-3.5 w-3.5" /> Visão macro
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Tarefas</h1>
            <p className="text-sm text-muted-foreground">
              Suas tarefas pessoais e em projetos — e, opcionalmente, as de colegas em projetos compartilhados.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <StatCard label="Total" value={stats.total} />
            <StatCard label="Abertas" value={stats.open} />
            <StatCard label="Hoje" value={stats.due} tone={stats.due > 0 ? "primary" : "default"} />
            <StatCard label="Atrasadas" value={stats.overdue} tone={stats.overdue > 0 ? "danger" : "default"} />
            <StatCard label="Delegadas" value={stats.delegated} />
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card/40 px-3 py-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tarefa ou projeto…"
            className="h-9 pl-8 text-sm"
          />
        </div>

        <Select value={ownerFilter} onValueChange={(v) => setOwnerFilter(v as typeof ownerFilter)}>
          <SelectTrigger className="h-9 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="mine">Minhas</SelectItem>
            <SelectItem value="others">De outros</SelectItem>
          </SelectContent>
        </Select>

        <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as typeof kindFilter)}>
          <SelectTrigger className="h-9 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Origem (todas)</SelectItem>
            <SelectItem value="personal">Pessoais</SelectItem>
            <SelectItem value="project">De projeto</SelectItem>
          </SelectContent>
        </Select>

        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="h-9 w-40 text-xs"><SelectValue placeholder="Projeto" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos projetos</SelectItem>
            <SelectItem value="__none">Sem projeto</SelectItem>
            {projectOptions.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={projectStatusFilter}
          onValueChange={(v) => setProjectStatusFilter(v as typeof projectStatusFilter)}
        >
          <SelectTrigger className="h-9 w-48 text-xs"><SelectValue placeholder="Status do projeto" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Projeto: todos status</SelectItem>
            <SelectItem value="active_only">Sem pausados/finalizados</SelectItem>
            <SelectItem value="in_progress">Projeto: em andamento</SelectItem>
            <SelectItem value="active">Projeto: ativo</SelectItem>
            <SelectItem value="paused">Projeto: pausado</SelectItem>
            <SelectItem value="not_started">Projeto: não iniciado</SelectItem>
            <SelectItem value="finished">Projeto: finalizado</SelectItem>
          </SelectContent>
        </Select>

        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-9 w-36 text-xs"><SelectValue placeholder="Papel" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos papéis</SelectItem>
            <SelectItem value="__none">Sem papel</SelectItem>
            {roleOptions.map((r) => (
              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="h-9 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="todo">A fazer</SelectItem>
            <SelectItem value="doing">Em andamento</SelectItem>
            <SelectItem value="done">Concluída</SelectItem>
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as typeof categoryFilter)}>
          <SelectTrigger className="h-9 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            <SelectItem value="urgent">Urgente</SelectItem>
            <SelectItem value="important">Importante</SelectItem>
            <SelectItem value="circumstantial">Circunstancial</SelectItem>
          </SelectContent>
        </Select>

        <Select value={dateRange} onValueChange={(v) => setDateRange(v as typeof dateRange)}>
          <SelectTrigger className="h-9 w-40 text-xs"><SelectValue placeholder="Período" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Qualquer data</SelectItem>
            <SelectItem value="overdue">Atrasadas</SelectItem>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="tomorrow">Amanhã</SelectItem>
            <SelectItem value="week">Esta semana</SelectItem>
            <SelectItem value="next7">Próximos 7 dias</SelectItem>
            <SelectItem value="month">Este mês</SelectItem>
            <SelectItem value="next30">Próximos 30 dias</SelectItem>
            <SelectItem value="no_date">Sem data</SelectItem>
            <SelectItem value="custom">Personalizado…</SelectItem>
          </SelectContent>
        </Select>

        {dateRange === "custom" && (
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-9 w-[140px] text-xs"
            />
            <span className="text-xs text-muted-foreground">até</span>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-9 w-[140px] text-xs"
            />
          </div>
        )}

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

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-primary">{selected.size} selecionada(s)</span>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => bulkStatus("todo")}>
                A fazer
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => bulkStatus("doing")}>
                Em andamento
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => bulkStatus("done")}>
                <CheckCircle2 className="mr-1 h-3 w-3" /> Concluir
              </Button>
              <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={bulkDelete}>
                <Trash2 className="mr-1 h-3 w-3" /> Excluir
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelected(new Set())}>
                Limpar
              </Button>
            </div>
          </div>
          <div key={bulkKey} className="flex flex-wrap items-center gap-1.5 border-t border-primary/20 pt-2">
            <span className="text-muted-foreground">Alterar em massa:</span>
            <Select onValueChange={(v) => bulkPatch({ project_id: v === "__none" ? null : v }, "Projeto")}>
              <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="Projeto…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Sem projeto</SelectItem>
                {projects.filter((p) => (p as any).status !== "finished").map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select onValueChange={(v) => bulkPatch({ role_id: v === "__none" ? null : v }, "Papel")}>
              <SelectTrigger className="h-7 w-36 text-xs"><SelectValue placeholder="Papel…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Sem papel</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select onValueChange={(v) => bulkPatch({ category: v as Task["category"] }, "Categoria")}>
              <SelectTrigger className="h-7 w-36 text-xs"><SelectValue placeholder="Categoria…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="urgent">Urgente</SelectItem>
                <SelectItem value="important">Importante</SelectItem>
                <SelectItem value="circumstantial">Circunstancial</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Input
                type="date"
                value={bulkDate}
                onChange={(e) => setBulkDate(e.target.value)}
                className="h-7 w-[140px] text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={!bulkDate}
                onClick={() => bulkPatch({ scheduled_date: bulkDate }, "Data")}
              >
                Mover data
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar + list */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Clique na linha para selecionar. Arraste a borda do cabeçalho para ajustar a largura.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={toggleSelectAll}>
            {allVisibleSelected ? "Desmarcar todas" : "Selecionar todas"}
          </Button>
          <ColumnSettingsPopover
            columns={taskColumns.columns}
            onToggleVisible={taskColumns.toggleVisible}
            onReorder={taskColumns.reorder}
            onReset={taskColumns.reset}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card/40">
        <div className="md:min-w-[980px]">
          <TaskListHeader
            sortKey={headerSortKey}
            sortDir={sortDir}
            onSort={handleHeaderSort}
            columns={taskColumns.columns}
            gridTemplate={taskColumns.gridTemplate}
            onResizeColumn={(key, px) => taskColumns.setWidth(key, `${Math.round(px)}px`)}
            onReorderColumn={taskColumns.reorder}
          />
          <div className="flex flex-col gap-1.5 p-2">
            {isLoading ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
            ) : sorted.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {tasks.length === 0 ? "Nenhuma tarefa ainda." : "Nenhum resultado com os filtros atuais."}
              </p>
            ) : (
              <DndContext>
                <SortableContext items={sorted.map((t) => t.id)}>
                  {sorted.map((t, i) => {
                    const suspended = !t.completed && t.project?.status === "paused";
                    const overdue = !t.completed && !suspended && t.scheduled_date < today;
                    return (
                      <TaskListRow
                        key={t.id}
                        task={rowToTask(t)}
                        role={t.role as any}
                        project={(t.project as any) ?? null}
                        index={i + 1}
                        isOverdue={overdue}
                        onToggle={() => toggleComplete(t)}
                        onEdit={() => openTask(t.id)}
                        selected={selected.has(t.id)}
                        onSelectToggle={() => toggleOne(t.id)}
                        blockedBy={blockedByMap.get(t.id)}
                        columns={taskColumns.columns}
                        gridTemplate={taskColumns.gridTemplate}
                      />
                    );
                  })}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>
      </div>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setEditingTask(null);
        }}
        defaultDate={editingTask?.scheduled_date ?? today}
        task={editingTask}
        roles={roles}
        projects={projectsForDialog}
        onSave={handleSave}
        onDelete={editingTask ? handleDelete : undefined}
        onToggleComplete={editingTask ? handleDialogToggleComplete : undefined}
      />
    </div>
  );
}

function SortHead({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <TableHead>
      <button
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-50" />
        )}
      </button>
    </TableHead>
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

function rowToTask(t: MyTaskRow): Task {
  return {
    ...(t as unknown as Task),
    recurrence: "none",
    recurrence_parent_id: null,
    followup_count: 0,
    postpone_count: 0,
    time_spent_seconds: 0,
  } as Task;
}
