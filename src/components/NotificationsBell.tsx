import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, Check, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export function NotificationsBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);

  const unread = items.filter((n) => !n.read_at).length;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, type, title, body, link, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (!cancelled && data) setItems(data as NotificationRow[]);
    };
    load();

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setItems((prev) => [payload.new as NotificationRow, ...prev].slice(0, 30));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const markAllRead = async () => {
    if (!user || unread === 0) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    await supabase
      .from("notifications")
      .update({ read_at: now })
      .is("read_at", null)
      .eq("user_id", user.id);
  };

  const handleClick = async (n: NotificationRow) => {
    if (!n.read_at) {
      const now = new Date().toISOString();
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: now } : x)));
      await supabase.from("notifications").update({ read_at: now }).eq("id", n.id);
    }
    if (n.link) {
      setOpen(false);
      navigate({ to: n.link });
    }
  };

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          aria-label="Notificações"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <span className="text-sm font-medium">Notificações</span>
          {unread > 0 && (
            <button
              onClick={markAllRead}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="h-3 w-3" /> Marcar todas
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              Nenhuma notificação ainda
            </div>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`flex w-full items-start gap-2 border-b border-border/40 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 ${
                  !n.read_at ? "bg-primary/5" : ""
                }`}
              >
                <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                  style={{ opacity: n.read_at ? 0 : 1 }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{n.title}</div>
                  {n.body && (
                    <div className="text-xs text-muted-foreground line-clamp-2">{n.body}</div>
                  )}
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                  </div>
                </div>
                {n.read_at && <Check className="mt-1 h-3 w-3 shrink-0 text-muted-foreground/60" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
