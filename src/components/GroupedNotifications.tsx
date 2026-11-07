import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronDown, ChevronUp, Mail, MailOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationItem } from "@/components/NotificationItem";
import type { MiniProfile } from "@/hooks/useProfiles";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { groupNotifications, type NotificationEntry } from "@/lib/notification-grouping";
import type { NotificationRow } from "@/lib/notificationTypes";

type Props = {
  items: NotificationRow[];
  profiles: Map<string, MiniProfile>;
  onOpen: (n: NotificationRow) => void;
  onToggleRead: (n: NotificationRow) => void;
  onDelete: (n: NotificationRow) => void;
  onReadGroup: (taskId: string, read: boolean) => Promise<void>;
  onDeleteGroup: (taskId: string) => Promise<void>;
};

export function GroupedNotifications(props: Props) {
  const entries = useMemo(() => groupNotifications(props.items), [props.items]);
  const taskIds = entries.flatMap((entry) => entry.kind === "task" ? [entry.taskId] : []).sort();
  const { data: titles } = useQuery({
    queryKey: ["notification-task-titles", taskIds],
    enabled: taskIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const rows: { id: string; title: string }[] = [];
      for (let i = 0; i < taskIds.length; i += 100) {
        const ids = taskIds.slice(i, i + 100);
        rows.push(...await fetchAllRows<{ id: string; title: string }>(() =>
          supabase.from("tasks").select("id,title").in("id", ids).order("id"),
        ));
      }
      return new Map(rows.map((row) => [row.id, row.title]));
    },
  });

  return entries.map((entry) => entry.kind === "single" ? (
    <NotificationItem key={entry.key} n={entry.latest}
      actor={entry.latest.actor_id ? props.profiles.get(entry.latest.actor_id) : undefined}
      onOpen={props.onOpen} onToggleRead={props.onToggleRead} onDelete={props.onDelete} />
  ) : (
    <TaskNotificationGroup key={entry.key} entry={entry} title={titles?.get(entry.taskId) ?? "Tarefa"} {...props} />
  ));
}

function TaskNotificationGroup({ entry, title, ...props }: Props & {
  entry: Extract<NotificationEntry, { kind: "task" }>;
  title: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); } finally { setBusy(false); }
  };
  const unread = entry.unreadCount > 0;
  const displayed = expanded ? entry.items : entry.items.slice(0, 1);

  return (
    <section className="border-b border-border/60" aria-label={`Notificações de ${title}`}>
      <div className="flex items-start gap-1 px-3 pt-2.5 pb-1">
        <Button variant="ghost" disabled={busy}
          className="h-auto min-w-0 flex-1 justify-start gap-2 whitespace-normal px-0 py-1 text-left hover:bg-transparent"
          onClick={() => run(async () => {
            await props.onReadGroup(entry.taskId, true);
            props.onOpen({ ...entry.latest, read_at: new Date().toISOString() });
          })}>
          <span className="min-w-0 flex-1">
            <span className="block break-words text-xs font-semibold">{title}</span>
            <span className="block text-[10px] font-normal text-muted-foreground">
              {formatDistanceToNow(new Date(entry.latest.created_at), { addSuffix: true, locale: ptBR })}
            </span>
          </span>
          {unread && <span className="shrink-0 rounded-full bg-primary/10 px-1.5 text-[10px] tabular-nums text-primary"
            aria-label={`${entry.unreadCount} não lidas`}>{entry.unreadCount}</span>}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground" disabled={busy}
          title={unread ? "Marcar grupo como lido" : "Marcar grupo como não lido"}
          aria-label={unread ? "Marcar grupo como lido" : "Marcar grupo como não lido"}
          onClick={() => run(() => props.onReadGroup(entry.taskId, unread))}>
          {unread ? <MailOpen /> : <Mail />}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-overdue" disabled={busy}
          title="Apagar grupo" aria-label="Apagar grupo" onClick={() => run(() => props.onDeleteGroup(entry.taskId))}>
          <Trash2 />
        </Button>
      </div>
      {displayed.map((n) => <NotificationItem key={n.id} n={n} compact taskTitle={title}
        actor={n.actor_id ? props.profiles.get(n.actor_id) : undefined}
        onOpen={props.onOpen} onToggleRead={props.onToggleRead} onDelete={props.onDelete} />)}
      {entry.items.length > 1 && (
        <Button variant="ghost" size="sm" className="mb-1 ml-3 h-6 gap-1 px-1 text-[11px] text-muted-foreground"
          aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
          {expanded ? <ChevronUp /> : <ChevronDown />}
          {expanded ? "Ver menos" : `Ver mais ${entry.items.length - 1}`}
        </Button>
      )}
    </section>
  );
}