import { useCallback, useEffect, useMemo } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { addDays, startOfWeek, toISODate } from "@/lib/date";

export type Meeting = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  scheduled_date: string;
  source: string;
  external_id: string | null;
  web_link: string | null;
  color: string;
  is_all_day: boolean;
};

const EMPTY: Meeting[] = [];

export function meetingDurationMinutes(m: Meeting) {
  if (m.is_all_day) return 0;
  const s = new Date(m.starts_at).getTime();
  const e = new Date(m.ends_at).getTime();
  return Math.max(0, Math.round((e - s) / 60000));
}

/** Cached meeting windows: one Monday–Sunday week per key, shared by Hoje, Semana and Agenda. */
export function meetingWeekWindow(iso: string) {
  const from = startOfWeek(iso);
  return { from, to: addDays(from, 6) };
}

function meetingsQueryOptions(userId: string, range: { from: string; to: string } | null) {
  return {
    queryKey: ["meetings", userId, range?.from ?? "all", range?.to ?? "all"] as const,
    queryFn: async () => {
      const { fetchAllRows } = await import("@/lib/fetchAll");
      return fetchAllRows<Meeting>(() => {
        let q = supabase.from("meetings").select("*").eq("user_id", userId);
        if (range) q = q.gte("scheduled_date", range.from).lte("scheduled_date", range.to);
        return q.order("starts_at", { ascending: true }).order("id", { ascending: true }) as never;
      });
    },
    enabled: !!userId,
  };
}

/**
 * Meetings for the user. With `aroundDate`, only that date's week is read (neighbour
 * weeks are prefetched so moving between days never shows an empty list); without it,
 * every meeting is read (project page, which links any meeting).
 */
export function useMeetings(userId: string, aroundDate?: string) {
  const queryClient = useQueryClient();
  const range = useMemo(() => (aroundDate ? meetingWeekWindow(aroundDate) : null), [aroundDate]);
  const query = useQuery({ ...meetingsQueryOptions(userId, range), placeholderData: keepPreviousData });
  const meetings = query.data ?? EMPTY;
  const loading = query.isPending;

  useEffect(() => {
    if (!userId || !range) return;
    for (const offset of [-7, 7]) {
      void queryClient.prefetchQuery(meetingsQueryOptions(userId, meetingWeekWindow(addDays(range.from, offset))));
    }
  }, [queryClient, userId, range]);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["meetings", userId] });
  }, [queryClient, userId]);

  const meetingsByDay = useCallback(
    (iso: string) => meetings.filter((m) => m.scheduled_date === iso),
    [meetings]
  );

  const createMeeting = useCallback(
    async (payload: {
      title: string;
      description?: string | null;
      location?: string | null;
      starts_at: string;
      ends_at: string;
      is_all_day?: boolean;
    }) => {
      const scheduled_date = toISODate(new Date(payload.starts_at));
      const { error } = await supabase.from("meetings").insert({
        user_id: userId,
        title: payload.title,
        description: payload.description ?? null,
        location: payload.location ?? null,
        starts_at: payload.starts_at,
        ends_at: payload.ends_at,
        scheduled_date,
        source: "manual",
        is_all_day: payload.is_all_day ?? false,
      });
      if (error) throw error;
      await refresh();
    },
    [userId, refresh]
  );

  const updateMeeting = useCallback(
    async (id: string, patch: Partial<Meeting>) => {
      const next = { ...patch };
      if (patch.starts_at) next.scheduled_date = toISODate(new Date(patch.starts_at));
      const { error } = await supabase.from("meetings").update(next).eq("id", id);
      if (error) throw error;
      await refresh();
    },
    [refresh]
  );

  const deleteMeeting = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("meetings").delete().eq("id", id);
      if (error) throw error;
      await refresh();
    },
    [refresh]
  );

  return useMemo(
    () => ({ meetings, loading, meetingsByDay, createMeeting, updateMeeting, deleteMeeting, refresh }),
    [meetings, loading, meetingsByDay, createMeeting, updateMeeting, deleteMeeting, refresh]
  );
}
