import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function db() {
  return supabaseAdmin;
}

export function getUserId(auth: unknown): string {
  const claims = (auth as { claims?: { sub?: string; userId?: string } } | undefined)?.claims;
  const userId = claims?.sub ?? claims?.userId;
  if (!userId) throw new Error("Não autenticado");
  return userId;
}
