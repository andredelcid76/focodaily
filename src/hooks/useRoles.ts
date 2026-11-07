import { useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { retainSharedChannel } from "@/lib/shared-channel";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type Role = Tables<"roles">;

export const ROLE_COLORS = [
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f59e0b", // amber
  "#10b981", // emerald
  "#3b82f6", // blue
  "#ef4444", // red
  "#14b8a6", // teal
  "#a855f7", // purple
];

const EMPTY_ROLES: Role[] = [];

async function fetchRoles(): Promise<Role[]> {
  const { data, error } = await supabase
    .from("roles")
    .select("*")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Shared cache: every screen and shell widget reads the same roles request. */
export function useRoles(userId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["roles", userId] as const, [userId]);
  const query = useQuery({ queryKey, queryFn: fetchRoles, enabled: !!userId });
  const roles = query.data ?? EMPTY_ROLES;
  const loading = query.isPending;

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      await queryClient.fetchQuery({ queryKey, queryFn: fetchRoles, staleTime: 0 });
    } catch {
      // keep the roles already on screen
    }
  }, [queryClient, queryKey, userId]);

  useEffect(() => {
    if (!userId) return;
    const refetch = () => void queryClient.fetchQuery({ queryKey, queryFn: fetchRoles, staleTime: 0 }).catch(() => {});
    return retainSharedChannel(`roles:${userId}`, () => {
      const ch = supabase
        .channel(`roles-rt-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "roles", filter: `user_id=eq.${userId}` }, refetch)
        .subscribe();
      return () => {
        supabase.removeChannel(ch);
      };
    });
  }, [queryClient, queryKey, userId]);

  const createRole = async (data: Omit<TablesInsert<"roles">, "user_id">) => {
    if (!userId) return;
    const { error } = await supabase.from("roles").insert({ ...data, user_id: userId });
    if (error) throw error;
  };

  const updateRole = async (id: string, patch: Partial<Role>) => {
    const { error } = await supabase.from("roles").update(patch).eq("id", id);
    if (error) throw error;
  };

  const deleteRole = async (id: string) => {
    const { error } = await supabase.from("roles").delete().eq("id", id);
    if (error) throw error;
  };

  return { roles, loading, createRole, updateRole, deleteRole, refresh };
}
