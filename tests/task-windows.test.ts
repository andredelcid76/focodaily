import { describe, expect, it } from "bun:test";
import { applyChangeToWindow, isDelegatedRow, taskInWindow, taskWindowFromKey, taskWindowKey, windowCoversDate } from "../src/lib/task-windows";
import type { Task } from "../src/hooks/useTasks";

const today = "2026-11-07";
const row = (over: Partial<Task>): Task =>
  ({ id: "t1", user_id: "me", title: "Tarefa", scheduled_date: today, completed: false, status: "todo", project_id: null, assignee_id: "me", position: 0, completed_at: null, ...over }) as Task;
const day = { kind: "day", date: today } as const;
const week = { kind: "week", start: "2026-11-02" } as const;

describe("window keys", () => {
  it("use the agreed shapes", () => {
    expect(taskWindowKey(day)).toEqual(["tasks", "day", today]);
    expect(taskWindowKey(week)).toEqual(["tasks", "week", "2026-11-02"]);
    expect(taskWindowKey({ kind: "project", projectId: "p1" })).toEqual(["tasks", "project", "p1"]);
    expect(taskWindowFromKey(["tasks", "delegated"])).toBeNull();
  });
});

describe("Hoje window", () => {
  it("holds the day, open overdue tasks and tasks in progress", () => {
    expect(taskInWindow(row({}), day, today)).toBe(true);
    expect(taskInWindow(row({ scheduled_date: "2026-11-01" }), day, today)).toBe(true);
    expect(taskInWindow(row({ scheduled_date: "2026-11-20", status: "in_progress" }), day, today)).toBe(true);
  });
  it("leaves out finished overdue tasks, other days and undated backlog", () => {
    expect(taskInWindow(row({ scheduled_date: "2026-11-01", completed: true }), day, today)).toBe(false);
    expect(taskInWindow(row({ scheduled_date: "2026-11-09" }), day, today)).toBe(false);
    expect(taskInWindow(row({ scheduled_date: null }), day, today)).toBe(false);
  });
});

describe("live payloads enter and leave windows", () => {
  it("moving a task to tomorrow removes it from Hoje and adds it to the week", () => {
    const moved = { eventType: "UPDATE", new: { id: "t1", scheduled_date: "2026-11-08" }, old: {} } as const;
    expect(applyChangeToWindow([row({})], moved, day, today)).toEqual([]);
    const full = { eventType: "UPDATE", new: row({ scheduled_date: "2026-11-08" }), old: {} } as const;
    expect(applyChangeToWindow([], full, week, today).map((t) => t.scheduled_date)).toEqual(["2026-11-08"]);
  });
  it("a delete removes the row everywhere it was", () => {
    expect(applyChangeToWindow([row({})], { eventType: "DELETE", new: {}, old: { id: "t1" } }, day, today)).toEqual([]);
  });
  it("a partial patch for a row the window never held is ignored", () => {
    expect(applyChangeToWindow([], { eventType: "UPDATE", new: { id: "t9", title: "x" }, old: {} }, day, today)).toEqual([]);
  });
  it("a project snapshot drops rows no longer readable and adds new ones", () => {
    const list = [row({ id: "a", project_id: "p" }), row({ id: "b", project_id: "p" })];
    const next = applyChangeToWindow(list, { eventType: "PROJECT_SNAPSHOT", projectId: "p", rows: [row({ id: "c", project_id: "p" })] }, day, today);
    expect(next.map((t) => t.id)).toEqual(["c"]);
  });
});

describe("covered dates and Delegadas membership", () => {
  it("only day and week windows vouch for a whole date", () => {
    expect(windowCoversDate(week, "2026-11-08")).toBe(true);
    expect(windowCoversDate({ kind: "project", projectId: "p" }, today)).toBe(false);
  });
  it("Delegadas holds tasks delegated to me or by me, not my own undelegated tasks", () => {
    expect(isDelegatedRow({ user_id: "boss", assignee_id: "me" }, "me")).toBe(true);
    expect(isDelegatedRow({ user_id: "me", assignee_id: "colleague" }, "me")).toBe(true);
    expect(isDelegatedRow({ user_id: "me", assignee_id: "me" }, "me")).toBe(false);
    expect(isDelegatedRow({ user_id: "me", assignee_id: null }, "me")).toBe(false);
  });
});
