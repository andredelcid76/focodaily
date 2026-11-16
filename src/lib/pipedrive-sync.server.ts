// Pipedrive → Foco task sync, run by the background cron (/api/public/sync/scan-all).
// Moved out of the retired inbox scanner: it only writes tasks, never inbox_suggestions.
import { userToday } from "@/lib/user-timezone";
import { addDays } from "@/lib/date";
import { pipedriveMissingMarks, probePipedriveActivities } from "@/lib/pipedrive-sync-policy";
import {
  CADENCE_ORIGIN,
  buildCadenceGroups,
  isCadenceUrl,
  parseCadenceSubject,
  planCadenceTask,
  type CadenceTaskRow,
} from "@/lib/pipedrive-cadence";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type SourceItem = {
  source: "pipedrive";
  source_id: string;
  source_label: string;
  source_url?: string | null;
  source_date?: string | null;
  text: string;
  title_override?: string | null;
};

async function getPipedriveCreds(userId: string): Promise<{ token: string; domain: string } | null> {
  const { data } = await supabaseAdmin
    .from("pipedrive_connections")
    .select("api_token,domain")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.api_token && data?.domain) {
    return { token: data.api_token as string, domain: data.domain as string };
  }
  return null;
}

const PD_PAGE_LIMIT = 200;
const PD_MAX_PAGES = 25;

/**
 * Reads every page of a Pipedrive /activities list (start/limit until
 * more_items_in_collection is false, bounded by PD_MAX_PAGES). A failed page stops paging;
 * firstStatus is the HTTP status of the first page.
 */
async function fetchPdActivitiesPaged<T>(
  buildUrl: (start: number, limit: number) => string,
  limit = PD_PAGE_LIMIT,
): Promise<{ items: T[]; firstStatus: number }> {
  const items: T[] = [];
  let start = 0;
  let firstStatus = 0;
  for (let page = 0; page < PD_MAX_PAGES; page++) {
    const r = await fetch(buildUrl(start, limit));
    if (page === 0) firstStatus = r.status;
    if (!r.ok) break;
    const j = await r.json();
    items.push(...((j?.data ?? []) as T[]));
    const pg = j?.additional_data?.pagination as
      | { more_items_in_collection?: boolean; next_start?: number }
      | undefined;
    if (!pg?.more_items_in_collection) break;
    start = typeof pg.next_start === "number" ? pg.next_start : start + limit;
  }
  return { items, firstStatus };
}

async function fetchPipedrive(userId: string, today: string): Promise<SourceItem[]> {
  const creds = await getPipedriveCreds(userId);
  if (!creds) return [];
  const { token, domain } = creds;
  try {
    const base = `https://${domain}.pipedrive.com/api/v1`;

    // Get the authenticated Pipedrive user id (the token's owner).
    const meR = await fetch(`${base}/users/me?api_token=${token}`);
    if (!meR.ok) {
      console.error("pipedrive /users/me failed", meR.status);
      return [];
    }
    const meJson = await meR.json();
    const pdUserId = meJson?.data?.id as number | undefined;
    if (!pdUserId) {
      console.error("pipedrive: no user id from /users/me");
      return [];
    }

    const startDate = addDays(today, -1);
    const endDate = addDays(today, 21);
    const paged = await fetchPdActivitiesPaged<Activity>(
      (start, limit) =>
        `${base}/activities?user_id=${pdUserId}&done=0&start_date=${startDate}&end_date=${endDate}&start=${start}&limit=${limit}&api_token=${token}`,
      100,
    );
    if (paged.firstStatus < 200 || paged.firstStatus >= 300) {
      console.error("pipedrive activities failed", paged.firstStatus);
      return [];
    }
    type Activity = {
      id: number;
      subject?: string;
      type?: string;
      note?: string | null;
      public_description?: string | null;
      due_date?: string | null;
      due_time?: string | null;
      done?: boolean;
      org_id?: number | null;
      org_name?: string | null;
      person_id?: number | null;
      person_name?: string | null;
      deal_title?: string | null;
      deal_id?: number | null;
      user_id?: number | null;
      assigned_to_user_id?: number | null;
      update_time?: string;
      add_time?: string;
    };
    const allActs = paged.items;
    // Filtros: (1) pendente, (2) atribuída ao usuário conectado, (3) vinculada
    // a deal/org/pessoa, (4) tipo diferente de reunião presencial/online,
    // (5) fora de cadência (agrupada por syncPipedriveCadences) — antes do corte de 60.
    const EXCLUDED_TYPES = new Set([
      "meeting",
      "reunio_online",
      "reuniao_online",
      "reunião_online",
      "reuniao_presencial",
      "reunião_presencial",
      "reunio_presencial",
    ]);
    const acts = allActs.filter((a) => {
      if (a.done) return false;
      const owner = a.assigned_to_user_id ?? a.user_id;
      if (owner !== pdUserId) return false;
      if (!(a.deal_id || a.org_id || a.person_id)) return false;
      const t = (a.type ?? "").toLowerCase();
      if (EXCLUDED_TYPES.has(t)) return false;
      if (parseCadenceSubject(a.subject)) return false;
      return true;
    });
    return acts.slice(0, 60).map((a) => ({
      source: "pipedrive" as const,
      source_id: `activity_${a.id}`,
      source_label: `Pipedrive: ${a.subject ?? a.type ?? "Atividade"}${a.org_name ? ` (${a.org_name})` : a.person_name ? ` (${a.person_name})` : ""}`,
      source_url: `https://${domain}.pipedrive.com/activities/list#dialog/activity/${a.id}`,
      source_date: a.due_date ?? a.update_time ?? a.add_time ?? null,
      text: `Atividade: ${a.subject ?? "—"}\nTipo: ${a.type ?? "—"}\nVencimento: ${a.due_date ?? "—"} ${a.due_time ?? ""}\nDeal: ${a.deal_title ?? "—"}\nOrganização: ${a.org_name ?? "—"}\nPessoa: ${a.person_name ?? "—"}\nNota: ${(a.note ?? a.public_description ?? "").replace(/<[^>]+>/g, "").slice(0, 800)}`,
      title_override: (a.subject ?? "").trim() || null,
    }));
  } catch (e) {
    console.error("pipedrive", e);
    return [];
  }
}


// ─────────────────────────────────────────────────────────────
// Pipedrive → App sync (completion + field changes + deletions)
// Conflict policy: newest update_time wins.
// ─────────────────────────────────────────────────────────────
type PdActivity = {
  id: number;
  subject?: string;
  type?: string;
  note?: string | null;
  public_description?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  duration?: string | null;
  done?: boolean;
  active_flag?: boolean;
  update_time?: string;
  add_time?: string;
  user_id?: number | null;
  assigned_to_user_id?: number | null;
};

/** Same meeting types fetchPipedrive skips when auto-creating tasks. */
const PD_EXCLUDED_TYPES = new Set([
  "meeting",
  "reunio_online",
  "reuniao_online",
  "reunião_online",
  "reuniao_presencial",
  "reunião_presencial",
  "reunio_presencial",
]);

function parsePdDuration(s?: string | null): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const mins = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  return mins > 0 ? mins : null;
}

function stripHtml(s?: string | null): string | null {
  if (!s) return null;
  const out = s.replace(/<[^>]+>/g, "").trim();
  return out.length > 0 ? out : null;
}

function pdActivityUrl(domain: string, id: number): string {
  return `https://${domain}.pipedrive.com/activities/list#dialog/activity/${id}`;
}

function parsePdTime(s?: string): number {
  if (!s) return 0;
  // Pipedrive returns "YYYY-MM-DD HH:MM:SS" in UTC.
  return new Date(s.replace(" ", "T") + "Z").getTime();
}

/** Returns false only when excessive 404s aborted this Pipedrive sync; other scan sources continue. */
async function syncPipedriveToApp(userId: string, today: string): Promise<boolean> {
  const creds = await getPipedriveCreds(userId);
  if (!creds) return true;
  const { token, domain } = creds;
  try {
    const base = `https://${domain}.pipedrive.com/api/v1`;
    const meR = await fetch(`${base}/users/me?api_token=${token}`);
    if (!meR.ok) return true;
    const meJson = await meR.json();
    const pdUserId = meJson?.data?.id as number | undefined;
    if (!pdUserId) return true;

    const startDate = addDays(today, -30);
    const endDate = addDays(today, 60);

    const fetchAllActivities = async (done: 0 | 1): Promise<PdActivity[]> =>
      (await fetchPdActivitiesPaged<PdActivity>(
        (start, limit) =>
          `${base}/activities?user_id=${pdUserId}&done=${done}&start_date=${startDate}&end_date=${endDate}&start=${start}&limit=${limit}&api_token=${token}`,
      )).items;
    const [pending, completed] = await Promise.all([fetchAllActivities(0), fetchAllActivities(1)]);
    const all = [...pending, ...completed];
    const seenIds = new Set<number>(all.map((a) => a.id));

    // Load linked tasks once
    const { data: linked } = await supabaseAdmin
      .from("tasks")
      .select(
        "id,origin_source_url,updated_at,title,description,scheduled_date,duration_minutes,completed",
      )
      .eq("user_id", userId)
      .eq("origin_source", "pipedrive")
      // Already-flagged tasks are not probed again, so old 404s never re-trigger the abort.
      .eq("pipedrive_missing", false);
    const linkedList = linked ?? [];
    const linkedByUrl = new Map<string, (typeof linkedList)[number]>();
    for (const t of linkedList) {
      if (t.origin_source_url) linkedByUrl.set(t.origin_source_url as string, t);
    }

    // ── Deletion sync ────────────────────────────────────────
    // For linked tasks whose activity didn't appear in the window, probe the
    // single-activity endpoint. Stage all results before changing any task.
    // Cadence tasks (origin_source 'pipedrive_cadencia') are excluded: the query above only
    // loads 'pipedrive' tasks and the guard below skips cadence URLs, which have no activity id.
    const orphans = linkedList
      .filter((t) => !isCadenceUrl(t.origin_source_url as string | null))
      .map((t) => {
        const url = (t.origin_source_url as string | null) ?? "";
        const m = /\/activity\/(\d+)\b/.exec(url);
        return m ? { task: t, id: parseInt(m[1], 10) } : null;
      })
      .filter((x): x is { task: (typeof linkedList)[number]; id: number } => !!x && !seenIds.has(x.id));

    const { missing, inactive, aborted } = await probePipedriveActivities(
      orphans.slice(0, 30).map(({ task, id }) => ({ taskId: task.id, activityId: id })),
      id => fetch(`${base}/activities/${id}?api_token=${token}`),
    );
    if (aborted) {
      console.error("Pipedrive sync aborted: more than 5 activity lookups returned 404; other scan sources continue.");
      return false;
    }
    // ── Update / completion sync ─────────────────────────────
    for (const a of all) {
      const url = pdActivityUrl(domain, a.id);
      const task = linkedByUrl.get(url);
      if (!task) continue;
      const pdTs = parsePdTime(a.update_time ?? a.add_time);
      const taskTs = task.updated_at ? new Date(task.updated_at as string).getTime() : 0;
      const patch: Record<string, unknown> = {};

      // Completion is always synced from Pipedrive (matches previous behavior).
      if (a.done && !task.completed) {
        patch.completed = true;
        patch.completed_at = new Date().toISOString();
        patch.status = "done";
      } else if (!a.done && task.completed) {
        patch.completed = false;
        patch.completed_at = null;
        patch.status = "todo";
      }

      // Field updates: only when Pipedrive is strictly newer.
      if (pdTs > taskTs) {
        const newTitle = (a.subject ?? "").trim();
        if (newTitle && newTitle !== task.title) patch.title = newTitle;
        const newDesc = stripHtml(a.note ?? a.public_description);
        if ((newDesc ?? null) !== (task.description ?? null)) patch.description = newDesc;
        if (a.due_date && a.due_date !== task.scheduled_date) {
          patch.scheduled_date = a.due_date;
        }
        const dur = parsePdDuration(a.duration);
        if (dur && dur !== task.duration_minutes) patch.duration_minutes = dur;
      }

      if (Object.keys(patch).length > 0) {
        await supabaseAdmin
          .from("tasks")
          .update(patch as never)
          .eq("id", task.id as string);
      }
    }


    for (const { id, patch } of pipedriveMissingMarks({ missing, inactive })) {
      const { error } = await supabaseAdmin.from("tasks").update(patch).eq("id", id);
      if (error) throw error;
    }

    await syncPipedriveCadences(userId, pdUserId, domain, all);
    return true;
  } catch (e) {
    console.error("pipedrive→app sync", e);
    return true;
  }
}

/**
 * One Foco task per cadence touch (ação × D<n>), refreshed every scan from the same
 * activity window. Completing it in Foco never touches Pipedrive (origin 'pipedrive_cadencia').
 */
async function syncPipedriveCadences(
  userId: string,
  pdUserId: number,
  domain: string,
  activities: PdActivity[],
): Promise<void> {
  try {
    const mine = activities.filter((a) => {
      const owner = a.assigned_to_user_id ?? a.user_id;
      if (owner != null && owner !== pdUserId) return false;
      return !PD_EXCLUDED_TYPES.has((a.type ?? "").toLowerCase());
    });
    const groups = buildCadenceGroups(mine, (id) => pdActivityUrl(domain, id));
    if (groups.length === 0) return;

    const { data: existing, error: loadError } = await supabaseAdmin
      .from("tasks")
      .select("id,origin_source_url,title,description,scheduled_date,duration_minutes,completed,updated_at")
      .eq("user_id", userId)
      .eq("origin_source", CADENCE_ORIGIN)
      .order("created_at", { ascending: true });
    if (loadError) throw loadError;
    const byUrl = new Map<string, CadenceTaskRow>();
    for (const t of existing ?? []) {
      const url = t.origin_source_url as string | null;
      if (url && !byUrl.has(url)) byUrl.set(url, t as unknown as CadenceTaskRow);
    }

    const nowIso = new Date().toISOString();
    for (const group of groups) {
      const plan = planCadenceTask(group, byUrl.get(group.url), userId, nowIso);
      if (!plan) continue;
      const { error } = plan.kind === "insert"
        ? await supabaseAdmin.from("tasks").insert(plan.row as never)
        : await supabaseAdmin.from("tasks").update(plan.patch as never).eq("id", plan.id);
      if (error) console.error("pipedrive cadence task", group.url, error.message);
    }
  } catch (e) {
    console.error("pipedrive cadence sync", e);
  }
}

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Stopwords curtas em pt/en que não ajudam a diferenciar tarefas.
const STOPWORDS = new Set([
  "a","o","as","os","de","da","do","das","dos","e","em","no","na","nos","nas",
  "para","por","com","sem","um","uma","uns","umas","que","se","ao","aos",
  "the","an","of","to","for","in","on","at","and","or","with","by","is","be",
  "responder","enviar","fazer","dar","ver","ler","email","reuniao","reunião",
]);

function titleTokens(s: string): Set<string> {
  const n = normalizeTitle(s);
  if (!n) return new Set();
  return new Set(n.split(" ").filter((w) => w.length >= 3 && !STOPWORDS.has(w)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** True when `title` looks like a duplicate of any known entry: exact
 * normalized match, substring containment, or token-Jaccard ≥ 0.65. */
function isDuplicateTitle(
  title: string,
  knownNorms: Set<string>,
  knownTokenSets: Array<Set<string>>,
): boolean {
  const norm = normalizeTitle(title);
  if (!norm) return true;
  if (knownNorms.has(norm)) return true;
  for (const existing of knownNorms) {
    if (norm.length >= 8 && existing.length >= 8 && (existing.includes(norm) || norm.includes(existing))) {
      return true;
    }
  }
  const tokens = titleTokens(title);
  if (tokens.size >= 2) {
    for (const other of knownTokenSets) {
      if (other.size >= 2 && jaccard(tokens, other) >= 0.65) return true;
    }
  }
  return false;
}

/**
 * Pulls Pipedrive completions/updates/deletions into linked tasks, refreshes cadence
 * tasks, then auto-creates one task per new standalone activity (dedup by link and title).
 */
export async function syncPipedriveForUser(userId: string) {
  const today = await userToday(supabaseAdmin, userId);
  // An aborted update sync changes no Pipedrive-linked tasks; new activities are still created.
  const pipedriveSyncAborted = !await syncPipedriveToApp(userId, today);
  const items = await fetchPipedrive(userId, today);
  const aborted = pipedriveSyncAborted ? { pipedrive_sync_aborted: true } : {};
  if (items.length === 0) return { user_id: userId, scanned: 0, created: 0, ...aborted };

  const sourceUrls = items.map((it) => it.source_url).filter(Boolean) as string[];
  const linkedUrls = new Set<string>();
  if (sourceUrls.length > 0) {
    const { data: linkedTasks } = await supabaseAdmin
      .from("tasks")
      .select("origin_source_url")
      .eq("user_id", userId)
      .in("origin_source_url", sourceUrls);
    for (const t of linkedTasks ?? []) {
      if (t.origin_source_url) linkedUrls.add(t.origin_source_url as string);
    }
  }
  const fresh = items.filter((it) => !(it.source_url && linkedUrls.has(it.source_url)));
  if (fresh.length === 0) return { user_id: userId, scanned: 0, created: 0, ...aborted };

  // Avoid duplicating things the user already has open.
  const { data: openTasks } = await supabaseAdmin
    .from("tasks")
    .select("title")
    .eq("user_id", userId)
    .eq("completed", false)
    .order("scheduled_date", { ascending: false })
    .limit(300);
  const openTitles = (openTasks ?? []).map((t) => (t.title as string) ?? "").filter(Boolean);
  const openTitleSet = new Set(openTitles.map(normalizeTitle));
  const openTokenSets: Array<Set<string>> = openTitles.map(titleTokens).filter((s) => s.size > 0);
  const registerKnown = (title: string) => {
    const n = normalizeTitle(title);
    if (!n) return;
    openTitleSet.add(n);
    const toks = titleTokens(title);
    if (toks.size > 0) openTokenSets.push(toks);
  };

  let created = 0;
  for (const it of fresh) {
    // Cadence touches are grouped into one task per (ação, D) by syncPipedriveCadences.
    if (parseCadenceSubject(it.title_override)) continue;
    const title = (it.title_override ?? "").trim() || it.source_label || "Atividade Pipedrive";
    if (isDuplicateTitle(title, openTitleSet, openTokenSets)) continue;
    const scheduledDate = it.source_date ? String(it.source_date).slice(0, 10) : today;
    const { error } = await supabaseAdmin.from("tasks").insert({
      user_id: userId,
      title,
      description: null,
      category: "important",
      scheduled_date: scheduledDate,
      duration_minutes: 30,
      origin_source: "pipedrive",
      origin_source_label: it.source_label,
      origin_source_url: it.source_url,
    } as never);
    if (!error) {
      created++;
      registerKnown(title);
    } else {
      console.error("auto-create pipedrive task", error.message);
    }
  }
  return { user_id: userId, scanned: fresh.length, created, ...aborted };
}
