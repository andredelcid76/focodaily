import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("id,user_id,email,display_name,avatar_url,timezone,locale,onboarded_at,created_at,updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { profile: data };
  });

const updateSchema = z.object({
  display_name: z.string().min(1).max(120).optional(),
  avatar_url: z.string().url().max(500).nullable().optional(),
  timezone: z.string().min(1).max(60).optional(),
  locale: z.string().min(2).max(10).optional(),
});

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.display_name !== undefined) patch.display_name = data.display_name;
    if (data.avatar_url !== undefined) patch.avatar_url = data.avatar_url;
    if (data.timezone !== undefined) patch.timezone = data.timezone;
    if (data.locale !== undefined) patch.locale = data.locale;

    const { error } = await supabase
      .from("profiles")
      .update(patch as never)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { display_name?: string; project_name?: string; first_tasks?: string[] }) =>
    z.object({
      display_name: z.string().min(1).max(120).optional(),
      project_name: z.string().min(1).max(120).optional(),
      first_tasks: z.array(z.string().min(1).max(200)).max(10).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    if (data.display_name) {
      await supabase.from("profiles").update({ display_name: data.display_name } as never).eq("user_id", userId);
    }

    let projectId: string | null = null;
    if (data.project_name?.trim()) {
      const { data: proj, error: projErr } = await supabase
        .from("projects")
        .insert({ user_id: userId, name: data.project_name.trim() } as never)
        .select("id")
        .single();
      if (projErr) throw new Error(projErr.message);
      projectId = proj.id as string;
    }

    if (data.first_tasks?.length) {
      const today = new Date().toISOString().slice(0, 10);
      const rows = data.first_tasks
        .map((t) => t.trim())
        .filter(Boolean)
        .map((title, i) => ({
          user_id: userId,
          title,
          scheduled_date: today,
          original_date: today,
          planned_date: today,
          position: i,
          project_id: projectId,
        }));
      if (rows.length > 0) {
        const { error } = await supabase.from("tasks").insert(rows as never);
        if (error) throw new Error(error.message);
      }
    }

    const { error: upErr } = await supabase
      .from("profiles")
      .update({ onboarded_at: new Date().toISOString() } as never)
      .eq("user_id", userId);
    if (upErr) throw new Error(upErr.message);

    return { ok: true, project_id: projectId };
  });
