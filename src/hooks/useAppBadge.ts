import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/**
 * Keeps the installed PWA app icon badge (taskbar / home screen) in sync with
 * the number of unread notifications. No-op on browsers without the Badging API.
 */
export function useAppBadge() {
  const { user } = useAuth();

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (!nav.setAppBadge) return;

    if (!user) {
      nav.clearAppBadge?.().catch(() => {});
      return;
    }

    let cancelled = false;

    const apply = (count: number) => {
      if (cancelled) return;
      if (count > 0) nav.setAppBadge?.(count).catch(() => {});
      else nav.clearAppBadge?.().catch(() => {});
    };

    const load = async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null)
        .eq("user_id", user.id);
      apply(count ?? 0);
    };
    load();

    const channel = supabase
      .channel(`app-badge:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          load();
        },
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
      nav.clearAppBadge?.().catch(() => {});
    };
  }, [user]);
}
