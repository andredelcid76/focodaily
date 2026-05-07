import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listInboxSuggestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("inbox_suggestions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    const { data: state } = await supabase
      .from("inbox_scan_state")
      .select("last_scan_at,last_status,last_error")
      .eq("user_id", userId)
      .maybeSingle();

    return { suggestions: data ?? [], state: state ?? null };
  });

export const dismissInboxSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("inbox_suggestions")
      .update({ status: "dismissed", acted_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const acceptSchema = z.object({
  id: z.string().uuid(),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  category: z.enum(["urgent", "important", "circumstantial"]).optional(),
  project_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(300).optional(),
});

export const acceptInboxSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => acceptSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: sug, error: sErr } = await supabase
      .from("inbox_suggestions")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!sug) throw new Error("Sugestão não encontrada");

    const insert = {
      user_id: userId,
      title: data.title ?? sug.title,
      description: sug.description ?? null,
      scheduled_date: data.scheduled_date,
      original_date: data.scheduled_date,
      planned_date: data.scheduled_date,
      duration_minutes: data.duration_minutes ?? sug.suggested_duration_minutes ?? 30,
      category: data.category ?? sug.suggested_category ?? "important",
      project_id: data.project_id ?? null,
    };
    const { data: task, error: tErr } = await supabase
      .from("tasks")
      .insert(insert as never)
      .select("id")
      .single();
    if (tErr) throw new Error(tErr.message);

    await supabase
      .from("inbox_suggestions")
      .update({ status: "accepted", accepted_task_id: task.id, acted_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", userId);

    return { ok: true, task_id: task.id };
  });

export const triggerInboxScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const url = `${process.env.SUPABASE_URL?.replace(".supabase.co", "")}`; // not used
    void url;
    const base = process.env.PUBLIC_BASE_URL ?? "https://focodaily.lovable.app";
    const r = await fetch(`${base}/api/public/inbox/scan?user_id=${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-token": process.env.SUPABASE_SERVICE_ROLE_KEY ?? "" },
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`Scan failed [${r.status}]: ${text.slice(0, 300)}`);
    return JSON.parse(text);
  });

export const getPipedriveStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // We use shared env tokens so just return whether they're configured.
    // No per-user secret needed for v1.
    return { configured: true };
  });
