import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { validTimezone, todayISO } from "./date";

export async function userTimezone(client: SupabaseClient<Database>, userId: string): Promise<string> {
  const { data, error } = await client.from("profiles").select("timezone").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return validTimezone(data?.timezone);
}
export async function userToday(client: SupabaseClient<Database>, userId: string): Promise<string> {
  return todayISO(await userTimezone(client, userId));
}