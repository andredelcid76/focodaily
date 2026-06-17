import { supabase } from "@/integrations/supabase/client";

export type InboxSuggestion = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  source: "email" | "meeting" | "pipedrive";
  source_id: string;
  source_url: string | null;
  source_label: string | null;
  source_date: string | null;
  suggested_category: "urgent" | "important" | "circumstantial";
  suggested_duration_minutes: number;
  suggested_date: string | null;
  reasoning: string | null;
  status: string;
  created_at: string;
};

export async function fetchInboxSuggestions(userId: string) {
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

  const cutoffISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Auto-cleanup: apaga sugestões já acionadas (descartadas ou aceitas) com mais de 24h
  await supabase
    .from("inbox_suggestions")
    .delete()
    .eq("user_id", userId)
    .neq("status", "pending")
    .lt("acted_at", cutoffISO);

  const { data: history } = await supabase
    .from("inbox_suggestions")
    .select("*")
    .eq("user_id", userId)
    .neq("status", "pending")
    .gte("acted_at", cutoffISO)
    .order("acted_at", { ascending: false })
    .limit(50);

  return {
    suggestions: (data ?? []) as InboxSuggestion[],
    history: (history ?? []) as (InboxSuggestion & { status: string; acted_at: string | null })[],
    state: state ?? null,
  };
}

export async function reactivateSuggestion(id: string, userId: string) {
  const { error } = await supabase
    .from("inbox_suggestions")
    .update({ status: "pending", acted_at: null, accepted_task_id: null })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}


export async function dismissSuggestion(id: string, userId: string) {
  const { error } = await supabase
    .from("inbox_suggestions")
    .update({ status: "dismissed", acted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function acceptSuggestion(input: {
  id: string;
  userId: string;
  task: {
    title: string;
    description: string | null;
    scheduled_date: string;
    duration_minutes: number;
    category: "urgent" | "important" | "circumstantial";
    project_id: string | null;
    role_id: string | null;
    non_negotiable: boolean;
  };
}) {
  const { data: sug, error: sErr } = await supabase
    .from("inbox_suggestions")
    .select("source,source_label,source_url,source_id")
    .eq("id", input.id)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (sErr) throw new Error(sErr.message);

  const insert = {
    user_id: input.userId,
    title: input.task.title,
    description: input.task.description,
    scheduled_date: input.task.scheduled_date,
    original_date: input.task.scheduled_date,
    planned_date: input.task.scheduled_date,
    duration_minutes: input.task.duration_minutes,
    category: input.task.category,
    project_id: input.task.project_id,
    role_id: input.task.role_id,
    non_negotiable: input.task.non_negotiable,
    origin_source: sug?.source ?? null,
    origin_source_label: sug?.source_label ?? null,
    origin_source_url: sug?.source_url ?? null,
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
    .eq("id", input.id)
    .eq("user_id", input.userId);

  // If the suggestion came from an Outlook email, tag the message with the
  // "Foco App" category so future scans skip it. New replies in the same
  // thread arrive as separate messages and will still be picked up.
  const messageId = sug?.source === "email" ? (sug?.source_id as string | undefined) : undefined;
  if (messageId) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (token) {
        await fetch(`${window.location.origin}/api/public/inbox/tag-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ message_id: messageId }),
        });
      }
    } catch (e) {
      console.error("tag-email after accept failed", e);
    }
  }

  return { task_id: task.id };
}

export async function triggerScan(userId: string) {
  const base = window.location.origin;
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Não autenticado");
  const r = await fetch(`${base}/api/public/inbox/scan?user_id=${userId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Scan falhou [${r.status}]: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}
