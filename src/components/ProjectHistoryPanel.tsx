import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  History, UserCog, Pencil, CheckCircle2, RotateCcw, Plus, Flag, ListTodo, Filter,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROJECT_STATUS_LABEL, type ProjectStatus } from "@/hooks/useProjects";

type Profile = { user_id: string; display_name: string | null; email: string | null };

type FeedItem = {
  id: string;
  created_at: string;
  actor_id: string | null;
  kind: "task" | "project";
  action: string; // created|completed|reopened|reassigned|updated|status
  field: string | null;
  old_value: any;
  new_value: any;
  task_id?: string;
  task_title?: string;
};

const FIELD_LABEL: Record<string, string> = {
  title: "título",
  assignee_id: "responsável",
  status: "status",
  scheduled_date: "data",
  duration_minutes: "duração",
  project_id: "projeto",
  category: "categoria",
  description: "descrição",
  completed: "conclusão",
};

function iconFor(item: FeedItem) {
  if (item.kind === "project") return <Flag className="h-3.5 w-3.5 text-amber-500" />;
  if (item.action === "created") return <Plus className="h-3.5 w-3.5" />;
  if (item.action === "completed") return <CheckCircle2 className="h-3.5 w-3.5 text-primary" />;
  if (item.action === "reopened") return <RotateCcw className="h-3.5 w-3.5" />;
  if (item.action === "reassigned" || item.field === "assignee_id") return <UserCog className="h-3.5 w-3.5" />;
  return <Pencil className="h-3.5 w-3.5" />;
}

type FilterKind = "all" | "task" | "project" | "reassigned" | "completed" | "created" | "updated";
type FilterPeriod = "all" | "7d" | "30d";

export function ProjectHistoryPanel({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [filterKind, setFilterKind] = useState<FilterKind>("all");
  const [filterUser, setFilterUser] = useState<string>("all");
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1. Tasks in project
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title")
        .eq("project_id", projectId);

      const taskMap = new Map<string, string>();
      (tasks ?? []).forEach((t: any) => taskMap.set(t.id, t.title));
      const taskIds = Array.from(taskMap.keys());

      // 2. Task activities
      let taskActivity: any[] = [];
      if (taskIds.length) {
        const { data } = await supabase
          .from("task_activity")
          .select("*")
          .in("task_id", taskIds)
          .order("created_at", { ascending: false })
          .limit(500);
        taskActivity = data ?? [];
      }

      // 3. Project status history
      const { data: statusHist } = await supabase
        .from("project_status_history")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(200);

      const feed: FeedItem[] = [
        ...taskActivity.map((r: any) => ({
          id: `t_${r.id}`,
          created_at: r.created_at,
          actor_id: r.actor_id,
          kind: "task" as const,
          action: r.action,
          field: r.field,
          old_value: r.old_value,
          new_value: r.new_value,
          task_id: r.task_id,
          task_title: taskMap.get(r.task_id) ?? "Tarefa",
        })),
        ...(statusHist ?? []).map((h: any) => ({
          id: `p_${h.id}`,
          created_at: h.created_at,
          actor_id: h.user_id,
          kind: "project" as const,
          action: "status",
          field: "status",
          old_value: h.from_status,
          new_value: h.to_status,
        })),
      ].sort((a, b) => b.created_at.localeCompare(a.created_at));

      if (cancelled) return;
      setItems(feed);

      // 4. Load profiles
      const ids = new Set<string>();
      for (const it of feed) {
        if (it.actor_id) ids.add(it.actor_id);
        if (it.field === "assignee_id") {
          if (typeof it.old_value === "string") ids.add(it.old_value);
          if (typeof it.new_value === "string") ids.add(it.new_value);
        }
      }
      if (ids.size) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, display_name, email")
          .in("user_id", Array.from(ids));
        if (!cancelled && profs) {
          const map: Record<string, Profile> = {};
          for (const p of profs) map[p.user_id] = p as Profile;
          setProfiles(map);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const nameOf = (uid: string | null | undefined) => {
    if (!uid) return "Sem responsável";
    const p = profiles[uid];
    return p?.display_name || p?.email || "Usuário";
  };

  const describe = (it: FeedItem): React.ReactNode => {
    const who = <strong className="text-foreground">{nameOf(it.actor_id)}</strong>;
    if (it.kind === "project") {
      const from = it.old_value ? PROJECT_STATUS_LABEL[it.old_value as ProjectStatus] : null;
      const to = PROJECT_STATUS_LABEL[it.new_value as ProjectStatus] ?? String(it.new_value);
      return (
        <>
          {who} {from ? <>mudou status do projeto de <strong>{from}</strong> para <strong>{to}</strong></> : <>definiu status inicial: <strong>{to}</strong></>}
        </>
      );
    }
    const taskLabel = <em className="text-foreground/80">"{it.task_title}"</em>;
    if (it.action === "created") return <>{who} criou {taskLabel}</>;
    if (it.action === "completed") return <>{who} concluiu {taskLabel}</>;
    if (it.action === "reopened") return <>{who} reabriu {taskLabel}</>;
    if (it.action === "reassigned" || it.field === "assignee_id") {
      const from = nameOf(typeof it.old_value === "string" ? it.old_value : null);
      const to = nameOf(typeof it.new_value === "string" ? it.new_value : null);
      return <>{who} reatribuiu {taskLabel} de <strong>{from}</strong> para <strong>{to}</strong></>;
    }
    const label = FIELD_LABEL[it.field ?? ""] ?? it.field ?? "campo";
    if (it.field === "description") return <>{who} atualizou a descrição de {taskLabel}</>;
    if (it.old_value != null && it.new_value != null) {
      return <>{who} mudou {label} de {taskLabel}: {String(it.old_value).replace(/"/g, "")} → {String(it.new_value).replace(/"/g, "")}</>;
    }
    return <>{who} atualizou {label} de {taskLabel}</>;
  };

  const userOptions = useMemo(() => {
    const ids = new Set<string>();
    (items ?? []).forEach((i) => i.actor_id && ids.add(i.actor_id));
    return Array.from(ids).map((id) => ({ id, name: nameOf(id) }));
  }, [items, profiles]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const now = Date.now();
    return items.filter((i) => {
      if (filterUser !== "all" && i.actor_id !== filterUser) return false;
      if (filterKind !== "all") {
        if (filterKind === "task" && i.kind !== "task") return false;
        if (filterKind === "project" && i.kind !== "project") return false;
        if (filterKind === "reassigned" && !(i.action === "reassigned" || i.field === "assignee_id")) return false;
        if (filterKind === "completed" && i.action !== "completed") return false;
        if (filterKind === "created" && i.action !== "created") return false;
        if (filterKind === "updated" && i.action !== "updated") return false;
      }
      if (filterPeriod !== "all") {
        const days = filterPeriod === "7d" ? 7 : 30;
        if (now - new Date(i.created_at).getTime() > days * 86400_000) return false;
      }
      return true;
    });
  }, [items, filterKind, filterUser, filterPeriod]);

  if (!items) {
    return <p className="text-sm text-muted-foreground">Carregando histórico…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> Filtros:
        </div>
        <Select value={filterKind} onValueChange={(v) => setFilterKind(v as FilterKind)}>
          <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas ações</SelectItem>
            <SelectItem value="task">Só tarefas</SelectItem>
            <SelectItem value="project">Só projeto</SelectItem>
            <SelectItem value="reassigned">Reatribuições</SelectItem>
            <SelectItem value="completed">Conclusões</SelectItem>
            <SelectItem value="created">Criações</SelectItem>
            <SelectItem value="updated">Edições</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterUser} onValueChange={setFilterUser}>
          <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas pessoas</SelectItem>
            {userOptions.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPeriod} onValueChange={(v) => setFilterPeriod(v as FilterPeriod)}>
          <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo período</SelectItem>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} evento{filtered.length === 1 ? "" : "s"}</span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum evento encontrado com esses filtros.</p>
      ) : (
        <ul className="space-y-1.5">
          {filtered.map((it) => (
            <li key={it.id} className="flex items-start gap-2 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-xs">
              <span className="mt-0.5 text-muted-foreground shrink-0">{iconFor(it)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-foreground/90 break-words">{describe(it)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {formatDistanceToNow(new Date(it.created_at), { addSuffix: true, locale: ptBR })}
                  <span className="mx-1">·</span>
                  {new Date(it.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
