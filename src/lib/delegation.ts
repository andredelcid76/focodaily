/**
 * S10: people I may delegate to / see the e-mail of — me, verified colleagues on the
 * company domain, or anyone who shares a project with me. The database trigger
 * enforce_delegation_scope applies the same rule to every write.
 */
type RpcClient = { rpc: (fn: "delegable_user_ids") => PromiseLike<{ data: unknown; error: { message: string } | null }> };

export async function delegableUserIds(client: unknown): Promise<Set<string>> {
  const { data, error } = await (client as RpcClient).rpc("delegable_user_ids");
  if (error) throw new Error(error.message);
  return new Set(
    ((data ?? []) as unknown[])
      .map((row) => (typeof row === "string" ? row : (row as { delegable_user_ids?: string })?.delegable_user_ids))
      .filter((id): id is string => !!id),
  );
}

/** Keeps the person listed but hides the e-mail of anyone outside the delegation scope. */
export function maskOutsideScope<T extends { user_id: string; email?: string | null }>(people: T[], allowed: ReadonlySet<string>) {
  return people.map((p) => ({ ...p, email: allowed.has(p.user_id) ? p.email ?? null : null, can_delegate: allowed.has(p.user_id) }));
}
