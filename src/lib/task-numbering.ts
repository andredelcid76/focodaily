/** Number the complete collection, never the filtered or column-sorted view. */
export function taskNumbers(
  tasks: ReadonlyArray<{ id: string; position: number }>,
  orderByPosition = true,
): Map<string, number> {
  const ordered = orderByPosition
    ? [...tasks].sort((a, b) => a.position - b.position)
    : tasks;
  return new Map(ordered.map((task, index) => [task.id, index + 1]));
}