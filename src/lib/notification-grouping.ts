import type { NotificationRow } from "./notificationTypes";

export type NotificationEntry =
  | { kind: "task"; key: string; taskId: string; latest: NotificationRow; items: NotificationRow[]; unreadCount: number }
  | { kind: "single"; key: string; latest: NotificationRow };

/** Call with already-filtered notifications; never change database group_count. */
export function groupNotifications(items: NotificationRow[]): NotificationEntry[] {
  const entries: NotificationEntry[] = [];
  const groups = new Map<string, Extract<NotificationEntry, { kind: "task" }>>();
  const sorted = [...items].sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
  for (const n of sorted) {
    if (!n.task_id) {
      entries.push({ kind: "single", key: `notification:${n.id}`, latest: n });
      continue;
    }
    let group = groups.get(n.task_id);
    if (!group) {
      group = { kind: "task", key: `task:${n.task_id}`, taskId: n.task_id, latest: n, items: [], unreadCount: 0 };
      groups.set(n.task_id, group);
      entries.push(group);
    }
    group.items.push(n);
    if (!n.read_at) group.unreadCount++;
  }
  return entries;
}