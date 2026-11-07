import { expect, test } from "bun:test";
import { groupNotifications } from "../src/lib/notification-grouping";
import type { NotificationRow } from "../src/lib/notificationTypes";

function notification(id: string, taskId: string | null, minute: number, read = false, type = "task_updated"): NotificationRow {
  return { id, task_id: taskId, created_at: `2026-11-07T04:${minute}:00Z`, read_at: read ? "2026-11-07T05:00:00Z" : null,
    type, title: "Aviso", body: null, actor_id: null, link: null, group_count: 3 };
}
const rows = [notification("old", "a", 10), notification("system", null, 25), notification("recent", "a", 30, true), notification("b", "b", 20)];

test("one block per task ordered by latest notification with standalone notices interleaved", () => {
  const groups = groupNotifications(rows);
  expect(groups.map((g) => g.key)).toEqual(["task:a", "notification:system", "task:b"]);
  const first = groups[0];
  expect(first.kind).toBe("task");
  if (first.kind !== "task") throw new Error("Expected task group");
  expect(first.items.map((n) => n.id)).toEqual(["recent", "old"]);
  expect(first.unreadCount).toBe(1);
});

test("unread filter runs before grouping and changes the latest visible notification", () => {
  const groups = groupNotifications(rows.filter((n) => !n.read_at));
  expect(groups.map((g) => g.key)).toEqual(["notification:system", "task:b", "task:a"]);
  expect(groups[2].latest.id).toBe("old");
});

test("type filters exclude other notifications before grouping", () => {
  const items = [...rows, notification("comment", "a", 35, false, "task_comment")];
  const groups = groupNotifications(items.filter((n) => n.type === "task_comment"));
  expect(groups.length).toBe(1);
  expect(groups[0].latest.id).toBe("comment");
});

test("unread totals count rows, not groups or group_count; input stays unchanged", () => {
  const items = [notification("one", "a", 10), notification("two", "a", 20), notification("three", "b", 30, true)];
  const groups = groupNotifications(items);
  expect(groups.reduce((sum, g) => sum + (g.kind === "task" ? g.unreadCount : Number(!g.latest.read_at)), 0)).toBe(2);
  expect(items.map((n) => n.id)).toEqual(["one", "two", "three"]);
  expect(items.map((n) => n.group_count)).toEqual([3, 3, 3]);
});

test("notifications without task_id remain distinct even when types match", () => {
  expect(groupNotifications([notification("one", null, 10), notification("two", null, 20)]).map((g) => g.key))
    .toEqual(["notification:two", "notification:one"]);
});