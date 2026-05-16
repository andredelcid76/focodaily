import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function db() {
  return supabaseAdmin;
}

export function getUserId(auth: unknown): string {
  const claims = (auth as { claims?: { userId?: string } } | undefined)?.claims;
  if (!claims?.userId) throw new Error("Não autenticado");
  return claims.userId;
}
