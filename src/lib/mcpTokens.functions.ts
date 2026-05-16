import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function generateToken(): { raw: string; hash: string; prefix: string } {
  const raw = "foco_" + randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(raw).digest("hex");
  const prefix = raw.slice(0, 12);
  return { raw, hash, prefix };
}

export const listMcpTokens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("mcp_tokens")
      .select("id, label, token_prefix, created_at, last_used_at, revoked_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { tokens: data ?? [] };
  });

export const createMcpToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ label: z.string().min(1).max(80) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { raw, hash, prefix } = generateToken();
    const { data: row, error } = await supabaseAdmin
      .from("mcp_tokens")
      .insert({
        user_id: context.userId,
        label: data.label,
        token_hash: hash,
        token_prefix: prefix,
      } as never)
      .select("id, label, token_prefix, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { token: raw, record: row };
  });

export const revokeMcpToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("mcp_tokens")
      .update({ revoked_at: new Date().toISOString() } as never)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMcpToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("mcp_tokens")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
