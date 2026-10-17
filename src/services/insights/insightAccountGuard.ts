/**
 * Hide insight results the moment the signed-in account is not the account
 * that produced them. Comparison only — no record text.
 */

export function maskedInsightData<T>(
  loadedUserId: string | null | undefined,
  requestedUserId: string | null | undefined,
  requestedUeid: string | null | undefined,
  data: T | null
): T | null {
  if (!requestedUserId || !requestedUeid) return null;
  if (!loadedUserId || loadedUserId !== requestedUserId) return null;
  return data;
}

/** Goods-receipt reads must use the session already open for this account. */
export function grinSessionMatchesAccount(
  sessionOwnerUid: string | null | undefined,
  requestedUserId: string | null | undefined
): boolean {
  if (!sessionOwnerUid || !requestedUserId) return false;
  return sessionOwnerUid === requestedUserId;
}
