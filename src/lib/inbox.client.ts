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

  return { suggestions: (data ?? []) as InboxSuggestion[], state: state ?? null };
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
  scheduled_date: string;
  project_id: string | null;
  title: string;
}) {
  const { data: sug, error: sErr } = await supabase
    .from("inbox_suggestions")
    .select("*")
    .eq("id", input.id)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (sErr) throw new Error(sErr.message);
  if (!sug) throw new Error("Sugestão não encontrada");

  const insert = {
    user_id: input.userId,
    title: input.title,
    description: sug.description ?? null,
    scheduled_date: input.scheduled_date,
    original_date: input.scheduled_date,
    planned_date: input.scheduled_date,
    duration_minutes: sug.suggested_duration_minutes ?? 30,
    category: sug.suggested_category ?? "important",
    project_id: input.project_id,
  };
  const { data: task, error: tErr } = await supabase
    .from("tasks")
    .insert(insert)
    .select("id")
    .single();
  if (tErr) throw new Error(tErr.message);

  await supabase
    .from("inbox_suggestions")
    .update({ status: "accepted", accepted_task_id: task.id, acted_at: new Date().toISOString() })
    .eq("id", input.id)
    .eq("user_id", input.userId);

  return { task_id: task.id };
}

export async function triggerScan(userId: string) {
  const base = window.location.origin;
  const r = await fetch(`${base}/api/public/inbox/scan?user_id=${userId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Scan falhou [${r.status}]: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}
