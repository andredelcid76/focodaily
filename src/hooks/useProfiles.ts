import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MiniProfile = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

/**
 * Batch-fetches mini profiles for a list of user IDs.
 * Uses the "collaborator profiles" RLS policy to read them.
 */
export function useProfiles(userIds: (string | null | undefined)[]) {
  const ids = Array.from(new Set(userIds.filter((x): x is string => !!x))).sort();
  const key = ids.join(",");

  const { data } = useQuery({
    queryKey: ["mini-profiles", key],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id,display_name,email,avatar_url")
        .in("user_id", ids);
      if (error) return [] as MiniProfile[];
      return (data ?? []) as MiniProfile[];
    },
  });

  const map = new Map<string, MiniProfile>();
  (data ?? []).forEach((p) => map.set(p.user_id, p));
  return map;
}

export function profileInitials(p?: MiniProfile | null): string {
  if (!p) return "?";
  const name = p.display_name ?? p.email ?? "";
  const parts = name.split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
