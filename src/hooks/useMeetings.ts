import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toISODate } from "@/lib/date";

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

export function meetingDurationMinutes(m: Meeting) {
  if (m.is_all_day) return 0;
  const s = new Date(m.starts_at).getTime();
  const e = new Date(m.ends_at).getTime();
  return Math.max(0, Math.round((e - s) / 60000));
}

export function useMeetings(userId: string) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("meetings")
      .select("*")
      .eq("user_id", userId)
      .order("starts_at", { ascending: true });
    if (error) {
      console.error(error);
      return;
    }
    setMeetings((data ?? []) as Meeting[]);
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [refresh]);

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
