import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, CheckCheck, Eraser } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useProfiles } from "@/hooks/useProfiles";
import { useNotificationActions, useRecentNotifications } from "@/hooks/useNotifications";
import { NotificationItem } from "@/components/NotificationItem";
import { FILTER_GROUPS } from "@/lib/notificationTypes";

export function NotificationsBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const [group, setGroup] = useState("all");
  const { items, setItems, unreadCount } = useRecentNotifications(user?.id, { toastOnNew: true });
  const actions = useNotificationActions(user?.id, setItems);
  const profiles = useProfiles(items.map((n) => n.actor_id));

  const visible = useMemo(() => {
    const types = FILTER_GROUPS.find((g) => g.value === group)?.types;
    return items.filter((n) => (tab === "all" || !n.read_at) && (!types || types.includes(n.type)));
  }, [items, tab, group]);

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label="Notificações">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <span className="text-sm font-medium">Notificações</span>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button
                onClick={actions.markAllRead}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <CheckCheck className="h-3 w-3" /> Marcar todas
              </button>
            )}
            <button
              onClick={actions.clearRead}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              title="Apagar as já lidas"
            >
              <Eraser className="h-3 w-3" /> Limpar lidas
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1 border-b border-border/60 px-2 py-1.5">
          {(["unread", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-2 py-1 text-xs ${tab === t ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t === "unread" ? `Não lidas${unreadCount ? ` (${unreadCount})` : ""}` : "Todas"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 border-b border-border/60 px-2 py-1.5">
          {FILTER_GROUPS.map((g) => (
            <button
              key={g.value}
              onClick={() => setGroup(g.value)}
              className={`rounded-full border px-2 py-0.5 text-[11px] ${
                group === g.value
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {visible.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              {tab === "unread" ? "Tudo em dia por aqui" : "Nenhuma notificação"}
            </div>
          ) : (
            visible.map((n) => (
              <NotificationItem
                key={n.id}
                n={n}
                actor={n.actor_id ? profiles.get(n.actor_id) : undefined}
                onOpen={(x) => {
                  setOpen(false);
                  actions.open(x, (to) => navigate({ to }));
                }}
                onToggleRead={actions.toggleRead}
                onDelete={actions.remove}
              />
            ))
          )}
        </div>
        <div className="border-t border-border/60 px-3 py-2 text-center">
          <Link
            to="/notificacoes"
            onClick={() => setOpen(false)}
            className="text-xs text-primary hover:underline"
          >
            Ver todas e preferências
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
