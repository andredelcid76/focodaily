import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, Mail, MailOpen, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { profileInitials, type MiniProfile } from "@/hooks/useProfiles";
import type { NotificationRow } from "@/lib/notificationTypes";

export function NotificationItem({
  n,
  actor,
  onOpen,
  onToggleRead,
  onDelete,
}: {
  n: NotificationRow;
  actor?: MiniProfile;
  onOpen: (n: NotificationRow) => void;
  onToggleRead: (n: NotificationRow) => void;
  onDelete: (n: NotificationRow) => void;
}) {
  const unread = !n.read_at;
  return (
    <div
      className={`group relative flex w-full items-start gap-2.5 border-b border-border/40 px-3 py-2.5 transition-colors hover:bg-muted/40 ${
        unread ? "bg-primary/5" : ""
      }`}
    >
      <button type="button" onClick={() => onOpen(n)} className="flex min-w-0 flex-1 items-start gap-2.5 text-left">
        <div className="relative shrink-0">
          <Avatar className="h-7 w-7">
            {actor?.avatar_url && <AvatarImage src={actor.avatar_url} alt="" />}
            <AvatarFallback className="text-[10px]">{actor ? profileInitials(actor) : "F"}</AvatarFallback>
          </Avatar>
          {unread && <span className="absolute -left-1 top-0 h-2 w-2 rounded-full bg-primary" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`truncate text-xs ${unread ? "font-semibold" : "font-medium"}`}>{n.title}</span>
            {n.group_count > 1 && (
              <span className="shrink-0 rounded bg-muted px-1 text-[10px] tabular-nums text-muted-foreground">
                {n.group_count}×
              </span>
            )}
          </div>
          {n.body && <div className="line-clamp-3 text-xs text-muted-foreground">{n.body}</div>}
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
          </div>
        </div>
      </button>
      <div className="flex shrink-0 flex-col gap-1 opacity-60 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={() => onToggleRead(n)}
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={unread ? "Marcar como lida" : "Marcar como não lida"}
          title={unread ? "Marcar como lida" : "Marcar como não lida"}
        >
          {unread ? <MailOpen className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => onDelete(n)}
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-overdue"
          aria-label="Apagar aviso"
          title="Apagar"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {!unread && <Check className="absolute bottom-2 right-9 h-3 w-3 text-muted-foreground/40" />}
    </div>
  );
}
