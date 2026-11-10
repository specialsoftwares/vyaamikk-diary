/**
 * Free Insights membership filter.
 *
 * Before aggregates/charts/FY/cache/drill-downs, Free accounts only include
 * durable IDs in freeMembershipIds (first 15 free admits). Paid accounts pass
 * rows through unchanged. Deletes stop contribution without freeing a slot
 * (the ID remains in freeMembershipIds; missing records simply yield no fact).
 */

export type FreeMembershipInsightScope =
  | { kind: "paid" }
  | { kind: "free"; freeMembershipIds: readonly string[] }
  | { kind: "unknown" };

export function filterFactsByFreeMembership<T extends { id: string }>(
  rows: readonly T[],
  scope: FreeMembershipInsightScope
): T[] {
  if (scope.kind === "paid") return [...rows];
  if (scope.kind === "unknown") return [];
  const allowed = new Set(scope.freeMembershipIds);
  return rows.filter((row) => allowed.has(row.id));
}

export function filterGrinByFreeMembership<T extends { receiptId: string }>(
  rows: readonly T[],
  scope: FreeMembershipInsightScope
): T[] {
  if (scope.kind === "paid") return [...rows];
  if (scope.kind === "unknown") return [];
  const allowed = new Set(scope.freeMembershipIds);
  return rows.filter((row) => allowed.has(row.receiptId));
}
