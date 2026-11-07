import { expect, test } from "bun:test";
import { todayISO, dateInTimezone, setBrowserTimezone } from "../src/lib/date";
import { literalSearchPattern } from "../src/lib/search-filter";
import { allowPipedriveSweep, pipedriveMissingMarks, probePipedriveActivities } from "../src/lib/pipedrive-sync-policy";
import { historyDays } from "../src/lib/analysis-history";
import { applyTaskChange, applyProjectSnapshot, changesTaskScope, isTaskIdLoaded, replayTaskChanges, scopeTaskChange, setLoadedTaskIds, taskSubscriptionFilters, taskQueryKeys, rememberOptimisticTask, matchesOptimisticTask } from "../src/lib/task-live-state";
import { dependenciesBySuccessor } from "../src/lib/dependency-status";
import type { Task } from "../src/hooks/useTasks";

test("22h in Brasilia keeps the same calendar day despite next-day UTC", () => {
  expect(todayISO("America/Sao_Paulo", new Date("2026-11-08T01:00:00Z"))).toBe("2026-11-07");
});
test("profile timezone and invalid-timezone fallback govern calendar dates", () => {
  expect(dateInTimezone(new Date("2026-11-08T01:00:00Z"), "Asia/Tokyo")).toBe("2026-11-08");
  expect(dateInTimezone(new Date("2026-11-08T01:00:00Z"), "invalid")).toBe("2026-11-07");
  setBrowserTimezone("Asia/Tokyo");
  expect(dateInTimezone(new Date("2026-11-08T01:00:00Z"))).toBe("2026-11-08");
  setBrowserTimezone(null);
});
test("global search quotes comma and parentheses as one literal filter value", () => {
  expect(literalSearchPattern("Revisar, proposta (final)")).toBe('"%Revisar, proposta (final)%"');
});
test("global search escapes percent, underscores, quotes and backslashes", () => {
  expect(literalSearchPattern('50%_"')).toBe('"%50\\\\%\\\\_\\"%"');
  expect(literalSearchPattern('a\\b')).toBe('"%a\\\\\\\\b%"');
});
test("six 404s abort a Pipedrive sweep; five can mark missing without deleting", () => {
  expect(allowPipedriveSweep(5)).toBe(true);
  expect(allowPipedriveSweep(6)).toBe(false);
});
test("Pipedrive preflight discards staged updates/deletions on the sixth 404", async () => {
  const activities = Array.from({ length: 7 }, (_, i) => ({ taskId: String(i), activityId: i }));
  const result = await probePipedriveActivities(activities, async id => id === 0 ? Response.json({ data: { active_flag: false } }) : new Response(null, { status: 404 }));
  expect(result).toEqual({ aborted: true, missing: [], inactive: [] });
});
test("Pipedrive five 404s only flag missing; confirmed inactive remains separate", async () => {
  const activities = Array.from({ length: 6 }, (_, i) => ({ taskId: String(i), activityId: i }));
  const result = await probePipedriveActivities(activities, async id => id === 0 ? Response.json({ data: { active_flag: false } }) : new Response(null, { status: 404 }));
  expect(result).toEqual({ aborted: false, missing: ["1", "2", "3", "4", "5"], inactive: ["0"] });
});
test("all-history day buckets include events older than 60 days and future dates", () => {
  const dates = historyDays("2026-11-07", ["2026-01-01", "2026-11-10"]);
  expect(dates[0]).toBe("2026-01-01");
  expect(dates.at(-1)).toBe("2026-11-10");
  expect(dates).toContain("2026-04-01");
});
const task = { id: "one", user_id: "me", title: "Original", status: "todo", project_id: "shared" } as Task;
test("live insert/update/delete apply by id without downloading the collection", () => {
  const initial = [task];
  const updated = applyTaskChange(initial, { eventType: "UPDATE", new: { id: "one", title: "Edited" }, old: {} });
  expect(updated[0].title).toBe("Edited");
  expect(applyTaskChange(updated, { eventType: "UPDATE", new: { id: "one", title: "Edited" }, old: {} })).toBe(updated);
  const added = applyTaskChange(updated, { eventType: "INSERT", new: { ...task, id: "two" }, old: {} });
  expect(added).toHaveLength(2);
  expect(applyTaskChange(added, { eventType: "DELETE", new: {}, old: { id: "one" } }).map(t => t.id)).toEqual(["two"]);
});
test("filters cover owner, assignee and shared project independently", () => {
  expect(taskSubscriptionFilters("me", ["shared", "shared"])).toEqual(["user_id=eq.me", "assignee_id=eq.me", "project_id=eq.shared"]);
});
test("live events arriving during a read replay over its stale snapshot", () => {
  expect(replayTaskChanges([task], [{ eventType: "UPDATE", new: { id: "one", title: "External MCP" }, old: {} }])[0].title).toBe("External MCP");
});
test("primary-key-only deletes re-read the hydrated lists (windows drop the row from the payload)", () => {
  expect(taskQueryKeys({ eventType: "DELETE", new: {}, old: { id: "one" } })).toContainEqual(["tasks", "delegated"]);
});
test("same-user MCP changes do not match unrelated optimistic fields", () => {
  rememberOptimisticTask("one", { title: "Local" });
  expect(matchesOptimisticTask({ eventType: "UPDATE", new: { ...task, title: "MCP" }, old: {} })).toBe(false);
  expect(matchesOptimisticTask({ eventType: "UPDATE", new: { ...task, title: "Local" }, old: {} })).toBe(true);
  expect(matchesOptimisticTask({ eventType: "UPDATE", new: { ...task, title: "Local" }, old: {} })).toBe(false);
});
test("invalidation never clears task windows globally", () => {
  expect(taskQueryKeys({ eventType: "UPDATE", new: { project_id: "new" }, old: { project_id: "old" } })).toEqual([["my-assigned-tasks"], ["tasks", "delegated"], ["dependency-status"]]);
});
test("dependency select builds indexed successors once", () => {
  const rows = [{ successor_id: "a", lag_days: 1, predecessor: null }, { successor_id: "b", lag_days: 0, predecessor: null }, { successor_id: "a", lag_days: 2, predecessor: null }];
  expect(dependenciesBySuccessor(rows).get("a")).toEqual([rows[0], rows[2]]);
});
test("deactivated Pipedrive activities are flagged like 404s, never deleted", () => {
  expect(pipedriveMissingMarks({ missing: ["a"], inactive: ["b"] })).toEqual([
    { id: "a", patch: { pipedrive_missing: true, pipedrive_missing_reason: "Pipedrive activity lookup returned HTTP 404; task preserved." } },
    { id: "b", patch: { pipedrive_missing: true, pipedrive_missing_reason: "atividade desativada no Pipedrive" } },
  ]);
});
test("up to 20 projects keep one filter each; more use grouped in-lists of up to 100", () => {
  const twenty = Array.from({ length: 20 }, (_, i) => `p${String(i).padStart(3, "0")}`);
  expect(taskSubscriptionFilters("me", twenty)).toHaveLength(22);
  const many = Array.from({ length: 150 }, (_, i) => `p${String(i).padStart(3, "0")}`);
  const filters = taskSubscriptionFilters("me", many);
  expect(filters).toHaveLength(4);
  expect(filters[2]).toBe(`project_id=in.(${many.slice(0, 100).join(",")})`);
  expect(filters[3]).toBe(`project_id=in.(${many.slice(100).join(",")})`);
});
test("an update reassigning a task away from me outside my projects becomes a removal", () => {
  const projects = new Set(["shared"]);
  const away = scopeTaskChange({ eventType: "UPDATE", new: { id: "one", user_id: "alice", assignee_id: "bob", project_id: "other" }, old: { id: "one" } }, "me", projects);
  expect(away).toEqual({ eventType: "DELETE", new: {}, old: { id: "one" } });
  const stillShared = scopeTaskChange({ eventType: "UPDATE", new: { id: "one", user_id: "alice", assignee_id: "bob", project_id: "shared" }, old: { id: "one" } }, "me", projects);
  expect(stillShared.eventType).toBe("UPDATE");
});
test("my own reassignment or project move refreshes list queries instead of patching them", () => {
  expect(changesTaskScope({ eventType: "UPDATE", new: { ...task, assignee_id: "bob" }, old: { ...task, assignee_id: "me" } })).toBe(true);
  expect(changesTaskScope({ eventType: "UPDATE", new: { ...task, title: "x" }, old: task })).toBe(false);
});
test("project snapshot adds newly visible tasks and drops ones no longer readable", () => {
  const mine = { ...task, id: "mine", project_id: "p" } as Task;
  const gone = { ...task, id: "gone", user_id: "alice", project_id: "p" } as Task;
  const other = { ...task, id: "other", project_id: "q" } as Task;
  const added = { ...task, id: "added", user_id: "alice", project_id: "p" } as Task;
  const result = applyProjectSnapshot([mine, gone, other], { eventType: "PROJECT_SNAPSHOT", projectId: "p", rows: [mine, added] });
  expect(result.map(t => t.id).sort()).toEqual(["added", "mine", "other"]);
});
test("deletes and comments are only acted on for tasks a screen has loaded", () => {
  const owner = Symbol("screen");
  setLoadedTaskIds(owner, new Set(["one"]));
  expect(isTaskIdLoaded("one")).toBe(true);
  expect(isTaskIdLoaded("unknown")).toBe(false);
  expect(applyTaskChange([task], { eventType: "DELETE", new: {}, old: { id: "unknown" } })).toEqual([task]);
  setLoadedTaskIds(owner, null);
  expect(isTaskIdLoaded("one")).toBe(false);
});
