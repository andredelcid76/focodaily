import { supabaseAdmin } from "@/integrations/supabase/client.server";

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Returns the unsubscribe token for an email address, creating one if needed.
 * Every transactional email must carry this token or the email API rejects it.
 */
export async function getOrCreateUnsubscribeToken(email: string): Promise<string | null> {
  const normalizedEmail = email.toLowerCase().trim();

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("email_unsubscribe_tokens")
    .select("token, used_at")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (lookupError) {
    console.error("Unsubscribe token lookup failed", { error: lookupError.message });
    return null;
  }

  if (existing?.token && !existing.used_at) return existing.token;
  if (existing?.token) return existing.token;

  const token = generateToken();
  const { error: insertError } = await supabaseAdmin
    .from("email_unsubscribe_tokens")
    .upsert({ token, email: normalizedEmail }, { onConflict: "email", ignoreDuplicates: true });

  if (insertError) {
    console.error("Unsubscribe token creation failed", { error: insertError.message });
    return null;
  }

  const { data: stored } = await supabaseAdmin
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", normalizedEmail)
    .maybeSingle();

  return stored?.token ?? null;
}
