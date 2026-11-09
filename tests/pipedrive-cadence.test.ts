import { describe, expect, it } from "bun:test";
import {
  CADENCE_FOOTER,
  buildCadenceGroups,
  cadenceDurationMinutes,
  isCadenceUrl,
  parseCadenceSubject,
  planCadenceTask,
  type CadenceActivity,
  type CadenceTaskRow,
} from "../src/lib/pipedrive-cadence";

const url = (id: number) => `https://anpla.pipedrive.com/activities/list#dialog/activity/${id}`;
const act = (id: number, subject: string, extra: Partial<CadenceActivity> = {}): CadenceActivity => ({
  id, subject, done: false, due_date: "2026-11-12", update_time: "2026-11-09 10:00:00", ...extra,
});

describe("pipedrive cadence", () => {
  it("parses the cadence subject format", () => {
    expect(parseCadenceSubject("83 · D3 · M1 — a dor · Henrique Ribeiro (Abbott)")).toEqual({
      acao: "83", d: 3, toque: "M1 — a dor", pessoa: "Henrique Ribeiro (Abbott)",
    });
    expect(parseCadenceSubject("83 · D7 · Ligação 1 · Thiago Galan (GE HealthCare)")?.pessoa).toBe("Thiago Galan (GE HealthCare)");
  });

  it("leaves non-cadence subjects alone", () => {
    expect(parseCadenceSubject("83 · Onda 0 · Ligação Carlos Escaliante (Abbott)")).toBeNull();
    expect(parseCadenceSubject("Ligar para Carlos")).toBeNull();
    expect(parseCadenceSubject(null)).toBeNull();
  });

  it("rounds duration to 5 min per open contact, multiple of 15, minimum 15", () => {
    expect(cadenceDurationMinutes(0)).toBe(15);
    expect(cadenceDurationMinutes(1)).toBe(15);
    expect(cadenceDurationMinutes(4)).toBe(30);
    expect(cadenceDurationMinutes(18)).toBe(90);
  });

  it("builds one group per (ação, D) with open count, earliest open date and most frequent touch name", () => {
    const groups = buildCadenceGroups([
      act(1, "83 · D3 · M1 — a dor · Henrique Ribeiro (Abbott)", { due_date: "2026-11-14" }),
      act(2, "83 · D3 · M1 — a dor · Ana Souza (GE)", { due_date: "2026-11-12" }),
      act(3, "83 · D3 · M1 · Bruno Lima (Abbott)", { done: true, due_date: "2026-11-10" }),
      act(4, "83 · D7 · Ligação 1 · Thiago Galan (GE HealthCare)"),
      act(5, "83 · Onda 0 · Ligação Carlos Escaliante (Abbott)"),
    ], url);
    expect(groups.map((g) => g.url).sort()).toEqual(["pipedrive-cadencia://83/D3", "pipedrive-cadencia://83/D7"]);
    const d3 = groups.find((g) => g.d === 3)!;
    expect(d3.title).toBe("83 · D3 · M1 — a dor — 2 contatos");
    expect(d3.scheduledDate).toBe("2026-11-12");
    expect(d3.durationMinutes).toBe(15);
    expect(d3.label).toBe("Pipedrive · cadência da ação 83");
    expect(d3.description.split("\n")).toEqual([
      `☐ Ana Souza (GE) — ${url(2)}`,
      `☐ Henrique Ribeiro (Abbott) — ${url(1)}`,
      "☑ Bruno Lima (Abbott)",
      "",
      CADENCE_FOOTER,
    ]);
  });

  it("creates a task for a new group with open activities, never as 'pipedrive'", () => {
    const [g] = buildCadenceGroups([act(1, "83 · D3 · M1 — a dor · Ana (GE)")], url);
    const plan = planCadenceTask(g, undefined, "u1", "2026-11-09T12:00:00Z");
    expect(plan?.kind).toBe("insert");
    const row = plan!.kind === "insert" ? plan!.row : {};
    expect(row.origin_source).toBe("pipedrive_cadencia");
    expect(row.origin_source_url).toBe("pipedrive-cadencia://83/D3");
    expect(row.category).toBe("important");
    expect(row.project_id).toBeNull();
    expect(isCadenceUrl(row.origin_source_url as string)).toBe(true);
  });

  it("does not create a task when every activity is already done", () => {
    const [g] = buildCadenceGroups([act(1, "83 · D3 · M1 · Ana (GE)", { done: true })], url);
    expect(planCadenceTask(g, undefined, "u1", "now")).toBeNull();
  });

  const task = (extra: Partial<CadenceTaskRow> = {}): CadenceTaskRow => ({
    id: "t1", title: "old", description: "old", scheduled_date: "2026-11-20", duration_minutes: 15,
    completed: false, updated_at: "2026-11-09T09:00:00Z", ...extra,
  });

  it("moves the date only when Pipedrive changed after the task", () => {
    const [g] = buildCadenceGroups([act(1, "83 · D3 · M1 · Ana (GE)", { update_time: "2026-11-09 10:00:00" })], url);
    const newer = planCadenceTask(g, task({ updated_at: "2026-11-09T09:00:00Z" }), "u1", "now");
    expect(newer?.kind === "update" && newer.patch.scheduled_date).toBe("2026-11-12");
    const userMoved = planCadenceTask(g, task({ updated_at: "2026-11-09T11:00:00Z" }), "u1", "now");
    expect(userMoved?.kind === "update" && "scheduled_date" in userMoved.patch).toBe(false);
    expect(userMoved?.kind === "update" && userMoved.patch.title).toBe("83 · D3 · M1 — 1 contatos");
  });

  it("completes the task when every activity is done", () => {
    const [g] = buildCadenceGroups([act(1, "83 · D3 · M1 · Ana (GE)", { done: true })], url);
    const plan = planCadenceTask(g, task(), "u1", "2026-11-09T12:00:00Z");
    expect(plan?.kind === "update" && plan.patch).toMatchObject({ completed: true, status: "done", completed_at: "2026-11-09T12:00:00Z" });
  });

  it("never reopens a task the user completed in Foco", () => {
    const [g] = buildCadenceGroups([act(1, "83 · D3 · M1 · Ana (GE)")], url);
    const plan = planCadenceTask(g, task({ completed: true }), "u1", "now");
    const patch = plan?.kind === "update" ? plan.patch : {};
    expect("completed" in patch).toBe(false);
    expect("status" in patch).toBe(false);
  });

  it("writes nothing when the task already matches", () => {
    const [g] = buildCadenceGroups([act(1, "83 · D3 · M1 · Ana (GE)")], url);
    const same = task({ title: g.title, description: g.description, duration_minutes: g.durationMinutes, scheduled_date: g.scheduledDate });
    expect(planCadenceTask(g, same, "u1", "now")).toBeNull();
  });
});
