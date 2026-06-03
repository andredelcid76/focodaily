import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

export function db(auth?: unknown) {
  const claims = (auth as { claims?: { sub?: string; userId?: string } } | undefined)?.claims;
  const actorId = claims?.sub ?? claims?.userId ?? "";

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Variáveis do backend ausentes para o MCP");
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: {
      headers: actorId ? { "x-foco-actor-id": actorId } : undefined,
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function adminDb() {
  return supabaseAdmin;
}

export function getUserId(auth: unknown): string {
  const claims = (auth as { claims?: { sub?: string; userId?: string } } | undefined)?.claims;
  const userId = claims?.sub ?? claims?.userId;
  if (!userId) throw new Error("Não autenticado");
  return userId;
}
