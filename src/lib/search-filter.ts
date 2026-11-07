/** Quote PostgREST values separately from SQL LIKE escaping. */
export function literalSearchPattern(term: string): string {
  const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
  return `"${pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}