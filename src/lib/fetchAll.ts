// The database API returns at most 1000 rows per request and silently drops
// the rest. Use this for any list that can grow, so nothing is cut off.
// `build` must return a fresh, ordered query each call (include a unique
// tiebreaker like id so pages don't overlap).
export async function fetchAllRows<T>(
  build: () => { range: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }> },
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}
