import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ACTIVITY_URL_RE = /\/activity\/(\d+)\b/;

export const syncTaskCompletionToPipedrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { task_id: string; done: boolean }) =>
    z.object({ task_id: z.string().uuid(), done: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: task } = await supabase
      .from("tasks")
      .select("id,origin_source,origin_source_url")
      .eq("id", data.task_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!task) return { ok: false, reason: "not-found" };
    if (task.origin_source !== "pipedrive" || !task.origin_source_url) {
      return { ok: false, reason: "not-pipedrive" };
    }
    const m = (task.origin_source_url as string).match(ACTIVITY_URL_RE);
    if (!m) return { ok: false, reason: "no-activity-id" };
    const activityId = m[1];

    const token = process.env.PIPEDRIVE_API_TOKEN;
    const domain = process.env.PIPEDRIVE_DOMAIN;
    if (!token || !domain) return { ok: false, reason: "no-credentials" };

    const r = await fetch(
      `https://${domain}.pipedrive.com/api/v1/activities/${activityId}?api_token=${token}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: data.done ? 1 : 0 }),
      },
    );
    if (!r.ok) {
      const txt = await r.text();
      console.error("pipedrive PUT failed", r.status, txt.slice(0, 200));
      return { ok: false, status: r.status };
    }
    return { ok: true };
  });
