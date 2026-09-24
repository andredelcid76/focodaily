import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCheck, Eraser, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfiles } from "@/hooks/useProfiles";
import { useNotificationActions } from "@/hooks/useNotifications";
import { NotificationItem } from "@/components/NotificationItem";
import { NotificationPreferencesCard } from "@/components/NotificationPreferencesCard";
import { FILTER_GROUPS, NOTIFICATION_SELECT, type NotificationRow } from "@/lib/notificationTypes";

export const Route = createFileRoute("/notificacoes")({
  head: () => ({
    meta: [
      { title: "Notificações | Focou" },
      { name: "description", content: "Histórico completo dos seus avisos de tarefas, comentários e menções, com preferências de entrega." },
      { property: "og:title", content: "Notificações | Focou" },
      { property: "og:description", content: "Todos os seus avisos do Focou em um só lugar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <NotificationsPage />
    </AppShell>
  ),
});

const PAGE = 50;

function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [group, setGroup] = useState("all");
  const actions = useNotificationActions(user?.id, setItems);
  const profiles = useProfiles(items.map((n) => n.actor_id));

  const fetchPage = useCallback(
    async (offset: number) => {
      if (!user) return;
      setLoading(true);
      let q = supabase
        .from("notifications")
        .select(NOTIFICATION_SELECT)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE - 1);
      const types = FILTER_GROUPS.find((g) => g.value === group)?.types;
      if (types) q = q.in("type", types);
      if (onlyUnread) q = q.is("read_at", null);
      const { data } = await q;
      const rows = (data ?? []) as NotificationRow[];
      setItems((prev) => (offset === 0 ? rows : [...prev, ...rows]));
      setHasMore(rows.length === PAGE);
      setLoading(false);
    },
    [user, group, onlyUnread],
  );

  useEffect(() => {
    fetchPage(0);
  }, [fetchPage]);

  const unread = useMemo(() => items.filter((n) => !n.read_at).length, [items]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Notificações</h1>
        <p className="text-sm text-muted-foreground">Tudo o que aconteceu nas suas tarefas e nas que você delegou.</p>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
          <div className="flex gap-1">
            <button
              onClick={() => setOnlyUnread(false)}
              className={`rounded-md px-2 py-1 text-xs ${!onlyUnread ? "bg-muted font-medium" : "text-muted-foreground"}`}
            >
              Todas
            </button>
            <button
              onClick={() => setOnlyUnread(true)}
              className={`rounded-md px-2 py-1 text-xs ${onlyUnread ? "bg-muted font-medium" : "text-muted-foreground"}`}
            >
              Não lidas
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTER_GROUPS.map((g) => (
              <button
                key={g.value}
                onClick={() => setGroup(g.value)}
                className={`rounded-full border px-2 py-0.5 text-[11px] ${
                  group === g.value ? "border-primary/40 bg-primary/10" : "border-border/60 text-muted-foreground"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={actions.markAllRead} disabled={!unread}>
              <CheckCheck className="mr-1 h-3 w-3" /> Marcar todas
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={actions.clearRead}>
              <Eraser className="mr-1 h-3 w-3" /> Limpar lidas
            </Button>
          </div>
        </div>
        {items.length === 0 && !loading ? (
          <div className="px-3 py-12 text-center text-sm text-muted-foreground">Nenhuma notificação por aqui.</div>
        ) : (
          items.map((n) => (
            <NotificationItem
              key={n.id}
              n={n}
              actor={n.actor_id ? profiles.get(n.actor_id) : undefined}
              onOpen={(x) => actions.open(x, (to) => navigate({ to }))}
              onToggleRead={actions.toggleRead}
              onDelete={actions.remove}
            />
          ))
        )}
        {(hasMore || loading) && items.length > 0 && (
          <div className="p-3 text-center">
            <Button variant="outline" size="sm" disabled={loading} onClick={() => fetchPage(items.length)}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Carregar mais"}
            </Button>
          </div>
        )}
      </Card>

      <NotificationPreferencesCard />
    </div>
  );
}
