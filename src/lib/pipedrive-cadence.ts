// Pipedrive prospecting cadences → one Foco task per touch (ação × D<n>).
// Pure helpers so the grouping/patch rules can be tested without the network.

export const CADENCE_ORIGIN = "pipedrive_cadencia";
export const CADENCE_URL_PREFIX = "pipedrive-cadencia://";
export const CADENCE_FOOTER =
  "Baixa de cada contato é no Pipedrive; concluir esta tarefa no Foco não mexe no Pipedrive.";

const CADENCE_RE = /^(\d+)\s·\sD(\d+)\s·\s(.+?)\s·\s(.+)$/;

export type CadenceParts = { acao: string; d: number; toque: string; pessoa: string };

/** "83 · D3 · M1 — a dor · Henrique Ribeiro (Abbott)" → parts; null when the subject is not a cadence touch. */
export function parseCadenceSubject(subject?: string | null): CadenceParts | null {
  const m = CADENCE_RE.exec((subject ?? "").trim());
  if (!m) return null;
  return { acao: String(parseInt(m[1], 10)), d: parseInt(m[2], 10), toque: m[3].trim(), pessoa: m[4].trim() };
}

export const cadenceUrl = (acao: string, d: number) => `${CADENCE_URL_PREFIX}${acao}/D${d}`;
export const isCadenceUrl = (url?: string | null) => !!url && url.startsWith(CADENCE_URL_PREFIX);

/** 5 min per open contact, rounded up to a multiple of 15, never below 15. */
export function cadenceDurationMinutes(openCount: number): number {
  return Math.max(15, Math.ceil((5 * openCount) / 15) * 15);
}

export type CadenceActivity = {
  id: number;
  subject?: string;
  done?: boolean;
  due_date?: string | null;
  update_time?: string;
  add_time?: string;
};

export type CadenceGroup = {
  acao: string;
  d: number;
  url: string;
  label: string;
  title: string;
  description: string;
  openCount: number;
  /** Earliest due_date among open activities (null when none is open). */
  scheduledDate: string | null;
  durationMinutes: number;
  allDone: boolean;
  /** Newest Pipedrive update_time in the group (ms since epoch, UTC). */
  latestUpdateMs: number;
};

function parsePdTime(s?: string): number {
  if (!s) return 0;
  // Pipedrive returns "YYYY-MM-DD HH:MM:SS" in UTC.
  const t = new Date(s.replace(" ", "T") + "Z").getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Groups cadence activities by (acao, D). Activities whose subject does not match are ignored. */
export function buildCadenceGroups(
  activities: CadenceActivity[],
  activityUrl: (id: number) => string,
): CadenceGroup[] {
  const buckets = new Map<string, { acao: string; d: number; items: Array<{ a: CadenceActivity; p: CadenceParts }> }>();
  const seen = new Set<number>();
  for (const a of activities) {
    if (seen.has(a.id)) continue; // pagination can repeat an id
    const p = parseCadenceSubject(a.subject);
    if (!p) continue;
    seen.add(a.id);
    const key = `${p.acao}/${p.d}`;
    const b = buckets.get(key) ?? { acao: p.acao, d: p.d, items: [] };
    b.items.push({ a, p });
    buckets.set(key, b);
  }

  const groups: CadenceGroup[] = [];
  for (const { acao, d, items } of buckets.values()) {
    const counts = new Map<string, number>();
    for (const { p } of items) counts.set(p.toque, (counts.get(p.toque) ?? 0) + 1);
    const toque = [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], "pt-BR"))[0][0];

    const open = items.filter(({ a }) => !a.done);
    const done = items.filter(({ a }) => a.done);
    const byPessoa = (x: { p: CadenceParts }, y: { p: CadenceParts }) => x.p.pessoa.localeCompare(y.p.pessoa, "pt-BR");
    const lines = [
      ...[...open].sort(byPessoa).map(({ a, p }) => `☐ ${p.pessoa} — ${activityUrl(a.id)}`),
      ...[...done].sort(byPessoa).map(({ p }) => `☑ ${p.pessoa}`),
    ];
    const dues = open.map(({ a }) => (a.due_date ?? "").slice(0, 10)).filter(Boolean).sort();

    groups.push({
      acao,
      d,
      url: cadenceUrl(acao, d),
      label: `Pipedrive · cadência da ação ${acao}`,
      title: `${acao} · D${d} · ${toque} — ${open.length} contatos`,
      description: [...lines, "", CADENCE_FOOTER].join("\n"),
      openCount: open.length,
      scheduledDate: dues[0] ?? null,
      durationMinutes: cadenceDurationMinutes(open.length),
      allDone: open.length === 0,
      latestUpdateMs: Math.max(0, ...items.map(({ a }) => parsePdTime(a.update_time ?? a.add_time))),
    });
  }
  return groups;
}

export type CadenceTaskRow = {
  id: string;
  title: string | null;
  description: string | null;
  scheduled_date: string | null;
  duration_minutes: number | null;
  completed: boolean | null;
  updated_at: string | null;
};

export type CadencePlan =
  | { kind: "insert"; row: Record<string, unknown> }
  | { kind: "update"; id: string; patch: Record<string, unknown> }
  | null;

/**
 * Decides what one scan does with a group:
 * - open activities and no task → create;
 * - task exists → refresh description; title/duration only while contacts remain open;
 *   move the date only when Pipedrive changed after the task;
 * - every activity done → complete the task if still open (title/duration frozen); a task completed in Foco is never reopened.
 * Groups whose activities all vanished are never passed here, so their task is left untouched.
 */
export function planCadenceTask(
  group: CadenceGroup,
  task: CadenceTaskRow | undefined,
  userId: string,
  nowIso: string,
): CadencePlan {
  if (!task) {
    if (group.openCount === 0 || !group.scheduledDate) return null;
    return {
      kind: "insert",
      row: {
        user_id: userId,
        title: group.title,
        description: group.description,
        category: "important",
        scheduled_date: group.scheduledDate,
        duration_minutes: group.durationMinutes,
        project_id: null,
        origin_source: CADENCE_ORIGIN,
        origin_source_label: group.label,
        origin_source_url: group.url,
      },
    };
  }

  const patch: Record<string, unknown> = {};
  if (group.description !== (task.description ?? "")) patch.description = group.description;
  // With every contact done, title and duration stay frozen at their last open-state values.
  if (group.openCount > 0) {
    if (group.title !== task.title) patch.title = group.title;
    if (group.durationMinutes !== task.duration_minutes) patch.duration_minutes = group.durationMinutes;
  }

  const taskMs = task.updated_at ? new Date(task.updated_at).getTime() : 0;
  if (group.scheduledDate && group.scheduledDate !== task.scheduled_date && group.latestUpdateMs > taskMs) {
    patch.scheduled_date = group.scheduledDate;
  }

  if (group.allDone && !task.completed) {
    patch.completed = true;
    patch.status = "done";
    patch.completed_at = nowIso;
  }

  return Object.keys(patch).length > 0 ? { kind: "update", id: task.id, patch } : null;
}
