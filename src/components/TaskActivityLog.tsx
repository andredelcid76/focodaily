import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { History, UserCog, Pencil, CheckCircle2, RotateCcw, Plus } from "lucide-react";

type ActivityRow = {
  id: string;
  actor_id: string | null;
  action: string;
  field: string | null;
  old_value: any;
  new_value: any;
  created_at: string;
};

type Profile = { user_id: string; display_name: string | null; email: string | null };

const FIELD_LABEL: Record<string, string> = {
  title: "título",
  assignee_id: "responsável",
  status: "status",
  scheduled_date: "data",
  duration_minutes: "duração (min)",
  project_id: "projeto",
  category: "categoria",
  description: "descrição",
  completed: "conclusão",
};

function iconFor(action: string, field: string | null) {
  if (action === "created") return <Plus className="h-3.5 w-3.5" />;
  if (action === "completed") return <CheckCircle2 className="h-3.5 w-3.5 text-primary" />;
  if (action === "reopened") return <RotateCcw className="h-3.5 w-3.5" />;
  if (action === "reassigned" || field === "assignee_id") return <UserCog className="h-3.5 w-3.5" />;
  return <Pencil className="h-3.5 w-3.5" />;
}

export function TaskActivityLog({ taskId }: { taskId: string }) {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("task_activity")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (cancelled || !data) return;
      setRows(data as ActivityRow[]);

      const ids = new Set<string>();
      for (const r of data) {
        if (r.actor_id) ids.add(r.actor_id);
        if (r.field === "assignee_id") {
          if (typeof r.old_value === "string") ids.add(r.old_value);
          if (typeof r.new_value === "string") ids.add(r.new_value);
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

    const channel = supabase
      .channel(`task_activity_${taskId}_${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "task_activity", filter: `task_id=eq.${taskId}` },
        (payload) => {
          setRows((prev) => [payload.new as ActivityRow, ...(prev ?? [])]);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [taskId]);

  const displayName = (uid: string | null | undefined) => {
    if (!uid) return "Sem responsável";
    const p = profiles[uid];
    return p?.display_name || p?.email || "Usuário";
  };

  const describe = (r: ActivityRow): string => {
    const who = displayName(r.actor_id);
    if (r.action === "created") return `${who} criou a tarefa`;
    if (r.action === "completed") return `${who} concluiu a tarefa`;
    if (r.action === "reopened") return `${who} reabriu a tarefa`;
    if (r.action === "reassigned" || r.field === "assignee_id") {
      const from = displayName(typeof r.old_value === "string" ? r.old_value : null);
      const to = displayName(typeof r.new_value === "string" ? r.new_value : null);
      return `${who} reatribuiu de ${from} para ${to}`;
    }
    const label = FIELD_LABEL[r.field ?? ""] ?? r.field ?? "campo";
    if (r.field === "description") return `${who} atualizou a descrição`;
    if (r.old_value != null && r.new_value != null) {
      return `${who} mudou ${label}: ${String(r.old_value).replace(/"/g, "")} → ${String(r.new_value).replace(/"/g, "")}`;
    }
    return `${who} atualizou ${label}`;
  };

  if (!rows) {
    return (
      <div className="text-xs text-muted-foreground">Carregando histórico…</div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">Nenhuma alteração registrada ainda.</div>
    );
  }

  const visible = expanded ? rows : rows.slice(0, 5);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        <History className="h-3.5 w-3.5" /> Histórico
      </div>
      <ul className="space-y-1.5">
        {visible.map((r) => (
          <li key={r.id} className="flex items-start gap-2 text-xs">
            <span className="mt-0.5 text-muted-foreground">{iconFor(r.action, r.field)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-foreground/90 break-words">{describe(r)}</p>
              <p className="text-[10px] text-muted-foreground">
                {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {rows.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-primary hover:underline"
        >
          {expanded ? "Mostrar menos" : `Mostrar mais (${rows.length - 5})`}
        </button>
      )}
    </div>
  );
}
