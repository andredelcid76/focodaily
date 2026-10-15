import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";
import { z } from "zod";

const Body = z.object({
  task_id: z.string().uuid(),
  event: z.enum(["prompt", "stop"]),
});

const RATE_MS = 10_000;

const notFound = () => Response.json({ ok: false }, { status: 404 });

export const Route = createFileRoute("/api/public/claude-heartbeat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const header = request.headers.get("authorization") ?? "";
        const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
        if (!token) return Response.json({ ok: false }, { status: 401 });

        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return Response.json({ ok: false }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const hash = createHash("sha256").update(token).digest("hex");
        const { data: tok } = await supabaseAdmin
          .from("mcp_tokens")
          .select("id, user_id, revoked_at")
          .eq("token_hash", hash)
          .maybeSingle();
        if (!tok || tok.revoked_at) return Response.json({ ok: false }, { status: 401 });
        const userId = tok.user_id as string;

        await supabaseAdmin
          .from("mcp_tokens")
          .update({ last_used_at: new Date().toISOString() } as never)
          .eq("id", tok.id);

        const { data: task } = await supabaseAdmin
          .from("tasks")
          .select("id, user_id, assignee_id, completed, status, claude_started_at, claude_last_activity_at")
          .eq("id", body.task_id)
          .maybeSingle();
        if (!task || task.completed || (task.user_id !== userId && task.assignee_id !== userId)) {
          return notFound();
        }

        const last = task.claude_last_activity_at ? new Date(task.claude_last_activity_at).getTime() : 0;
        if (task.status === "in_progress" && Date.now() - last < RATE_MS) {
          return Response.json({ ok: true, status: task.status });
        }

        const now = new Date().toISOString();
        const patch: Record<string, unknown> = { claude_last_activity_at: now };
        if (task.status !== "in_progress") {
          patch.status = "in_progress";
          if (!task.claude_started_at) patch.claude_started_at = now;
        }

        // Escreve como o dono do token: current_actor_id() lê x-foco-actor-id → sem notificação.
        const { db } = await import("@/lib/mcp/supabase");
        const { data: upd, error } = await db({ claims: { sub: userId } })
          .from("tasks")
          .update(patch as never)
          .eq("id", task.id)
          .select("status")
          .maybeSingle();
        if (error) return Response.json({ ok: false }, { status: 500 });
        return Response.json({ ok: true, status: (upd as { status?: string } | null)?.status ?? "in_progress" });
      },
    },
  },
});
