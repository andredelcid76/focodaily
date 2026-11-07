import { addDays } from "./date";

export type AnalyticsPeriod = "today" | "yesterday" | "7d" | "30d" | "90d" | "all";

/**
 * Database window for analytics_summary: [start, end] inclusive (end open when null; everything
 * when start is null). The daily series starts at seriesStart (14 days of context for single days).
 */
export function analyticsWindow(period: AnalyticsPeriod, today: string) {
  if (period === "all") return { start: null, end: null, seriesStart: null } as const;
  if (period === "today") return { start: today, end: today, seriesStart: addDays(today, -13) };
  if (period === "yesterday") {
    const y = addDays(today, -1);
    return { start: y, end: y, seriesStart: addDays(today, -13) };
  }
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const start = addDays(today, -days + 1);
  return { start, end: null, seriesStart: start };
}

export type AnalyticsSummary = {
  today: string;
  kpis: { total: number; done: number; overdue: number; postponed: number; critical: number; total_postpones: number; minutes: number; done_minutes: number };
  by_role: Array<{ role_id: string | null; total: number; concluidas: number; adiadas: number; minutos: number }>;
  by_project: Array<{ project_id: string; total: number; concluidas: number; adiadas: number; criticas: number; minutos: number }>;
  by_category: Array<{ category: string; total: number; concluidas: number; minutos: number }>;
  by_priority: Array<{ priority: number; total: number }>;
  top_postponed: Array<{ id: string; title: string; project_id: string | null; role_id: string | null; scheduled_date: string | null; completed: boolean; postpone_count: number }>;
  daily: Array<{ day: string; concluidas: number; minutos_concluidos: number; planejadas: number; minutos_planejados: number; criadas: number; adiadas: number }>;
};

type Named = { id: string; name: string; color: string };
const NO_ROLE = { name: "Sem papel", color: "#64748b" };

/** Roles the viewer cannot see fold into "Sem papel", like the per-task view did. */
export function rolesBreakdown(rows: AnalyticsSummary["by_role"], rolesById: ReadonlyMap<string, Named>) {
  const map = new Map<string, { name: string; color: string; total: number; concluidas: number; adiadas: number; minutos: number }>();
  for (const row of rows) {
    const role = row.role_id ? rolesById.get(row.role_id) : undefined;
    const key = role?.id ?? "sem";
    const entry = map.get(key) ?? { name: role?.name ?? NO_ROLE.name, color: role?.color ?? NO_ROLE.color, total: 0, concluidas: 0, adiadas: 0, minutos: 0 };
    entry.total += row.total;
    entry.concluidas += row.concluidas;
    entry.adiadas += row.adiadas;
    entry.minutos += row.minutos;
    map.set(key, entry);
  }
  return Array.from(map.values()).filter((x) => x.total > 0).sort((a, b) => b.total - a.total);
}

/** Top 10 visible projects by volume. */
export function projectsBreakdown(rows: AnalyticsSummary["by_project"], projectsById: ReadonlyMap<string, Named>) {
  return rows
    .flatMap((row) => {
      const p = projectsById.get(row.project_id);
      return p ? [{ ...row, name: p.name, color: p.color }] : [];
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
}
