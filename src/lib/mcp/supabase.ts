import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

function getAccessToken(auth: unknown): string {
  const token = (auth as { token?: string } | undefined)?.token;
  if (!token) throw new Error("Não autenticado");
  return token;
}

export function db(auth: unknown) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Variáveis do backend ausentes para autenticação MCP");
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${getAccessToken(auth)}`,
      },
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
