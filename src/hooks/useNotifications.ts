import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { NOTIFICATION_SELECT, openTaskGlobally, type NotificationRow } from "@/lib/notificationTypes";

/** Ações comuns sobre avisos (usadas no sininho e na página). */
export function useNotificationActions(
  userId: string | undefined,
  setItems: React.Dispatch<React.SetStateAction<NotificationRow[]>>,
) {
  const open = useCallback(
    async (n: NotificationRow, navigate?: (to: string) => void) => {
      if (!n.read_at) {
        const now = new Date().toISOString();
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: now } : x)));
        await supabase.from("notifications").update({ read_at: now }).eq("id", n.id);
      }
      if (n.task_id) {
        openTaskGlobally(n.task_id, { comments: n.type === "task_comment" || n.type === "task_mention" });
      } else if (n.link && navigate) {
        navigate(n.link);
      }
    },
    [setItems],
  );

  const toggleRead = useCallback(
    async (n: NotificationRow) => {
      const next = n.read_at ? null : new Date().toISOString();
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: next } : x)));
      await supabase.from("notifications").update({ read_at: next }).eq("id", n.id);
    },
    [setItems],
  );

  const remove = useCallback(
    async (n: NotificationRow) => {
      setItems((prev) => prev.filter((x) => x.id !== n.id));
      await supabase.from("notifications").delete().eq("id", n.id);
    },
    [setItems],
  );

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    await supabase.from("notifications").update({ read_at: now }).is("read_at", null).eq("user_id", userId);
  }, [userId, setItems]);

  const clearRead = useCallback(async () => {
    if (!userId) return;
    setItems((prev) => prev.filter((n) => !n.read_at));
    await supabase.from("notifications").delete().not("read_at", "is", null).eq("user_id", userId);
  }, [userId, setItems]);

  return { open, toggleRead, remove, markAllRead, clearRead };
}

/** Últimos avisos + contador de não lidos, sempre sincronizados em tempo real. */
export function useRecentNotifications(userId: string | undefined, opts?: { toastOnNew?: boolean }) {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const toastRef = useRef(opts?.toastOnNew ?? false);

  const refreshCount = useCallback(async () => {
    if (!userId) return;
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null)
      .eq("user_id", userId);
    setUnreadCount(count ?? 0);
  }, [userId]);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("notifications")
      .select(NOTIFICATION_SELECT)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(40);
    if (data) setItems(data as NotificationRow[]);
    refreshCount();
  }, [userId, refreshCount]);

  useEffect(() => {
    if (!userId) return;
    load();
    const channel = supabase
      .channel(`notifications:${userId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const n = payload.new as NotificationRow;
            setItems((prev) => [n, ...prev.filter((x) => x.id !== n.id)].slice(0, 40));
            if (toastRef.current && !n.read_at) {
              toast(n.title, {
                description: n.body ?? undefined,
                action: n.task_id
                  ? {
                      label: "Abrir",
                      onClick: () =>
                        openTaskGlobally(n.task_id!, {
                          comments: n.type === "task_comment" || n.type === "task_mention",
                        }),
                    }
                  : undefined,
              });
            }
          } else if (payload.eventType === "UPDATE") {
            const n = payload.new as NotificationRow;
            setItems((prev) => {
              const rest = prev.filter((x) => x.id !== n.id);
              return [n, ...rest].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 40);
            });
          } else if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: string }).id;
            if (id) setItems((prev) => prev.filter((x) => x.id !== id));
          }
          refreshCount();
        },
      )
      .subscribe();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [userId, load, refreshCount]);

  // Mantém o contador coerente com as ações locais.
  useEffect(() => {
    refreshCount();
  }, [items, refreshCount]);

  return { items, setItems, unreadCount, reload: load };
}
