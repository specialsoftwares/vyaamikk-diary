/**
 * The worker hold is outside the database a restore would replace.
 * Unset means running, so the current deletion sweep is unchanged.
 */

export type PrivilegedWorker = "deletion" | "billing" | "was_not_me";

export function workerHoldFromEnv(env: NodeJS.ProcessEnv = process.env): "stopped" | "running" {
  return env.RESTORE_WORKER_HOLD === "stopped" ? "stopped" : "running";
}

export function privilegedWorkerMayRead(worker: PrivilegedWorker, env: NodeJS.ProcessEnv = process.env): boolean {
  void worker;
  return workerHoldFromEnv(env) === "running";
}

/**
 * What each exception can do while ordinary client traffic is closed.
 * None of these recreate diary, credit, purchase-order, or pack documents.
 */
export const PRIVILEGED_WORKER_EFFECT = {
  deletion:
    "A stopped hold returns before any user or job read. A running sweep deletes an account already in the deletion queue. It does not create business documents.",
  billing:
    "A stopped hold returns before Firestore is opened. A running cycle reads the billing queue and store receipts. It does not write diary content, and an erased uid is not a billing candidate.",
  was_not_me:
    "A stopped hold returns before any read. A running report updates only the was-not-me token and the new-device event time. It does not recreate business documents.",
} as const;

const BUSINESS_COLLECTIONS = new Set([
  "entries",
  "professionalPacks",
  "letterheadDocs",
  "customerCreditRecords",
  "purchaseOrders",
]);

/** Outside authority list. Unset is empty, so the current queue is unchanged. Do not copy this from a restored primary. */
export function erasedBillingUidsFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.RESTORE_ERASED_UIDS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

/** Billing candidates lose erased uids. The erased list comes from the outside authority, not the restored primary. */
export function excludeErasedBillingUids(ids: readonly string[], erasedUids: readonly string[]): string[] {
  const erased = new Set(erasedUids);
  return ids.filter((id) => !erased.has(id));
}

export function workerWritesBusinessData(collections: readonly string[]): boolean {
  return collections.some((name) => BUSINESS_COLLECTIONS.has(name));
}
