import { timingSafeEqual } from "node:crypto";

export function cronSecretMatches(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Also bootstraps the database scheduler after its first authenticated call. */
export async function authenticateCron(request: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (!cronSecretMatches(request.headers.get("x-cron-secret"), secret)) return false;
  if (!secret) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("cron_credentials").upsert({ id: 1, secret });
  if (error) throw new Error("Não foi possível configurar o agendador.");
  return true;
}