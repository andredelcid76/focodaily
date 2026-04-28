import { useEffect, useState, useCallback } from "react";
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

export function useRoles(userId: string | undefined) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("roles")
      .select("*")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (data) setRoles(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    refresh();
    const ch = supabase
      .channel("roles-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "roles", filter: `user_id=eq.${userId}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, refresh]);

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
