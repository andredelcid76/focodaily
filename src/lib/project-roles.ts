/** Project role order used to block self-promotion (matches the database trigger). */
export function projectRoleRank(role: string | null | undefined): number {
  if (role === "admin") return 3;
  if (role === "manager") return 2;
  return 1;
}

/** S11: changing your own role may keep or lower it, never raise it. */
export function isSelfPromotion(actorId: string, targetId: string, currentRole: string | null | undefined, nextRole: string) {
  return actorId === targetId && projectRoleRank(nextRole) > projectRoleRank(currentRole);
}
