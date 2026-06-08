/**
 * Pending email verification store (integration seam).
 *
 * Unverified emails must not permanently claim the global email index.
 * Production: Firestore `pendingEmailVerifications` + Cloud Function
 * `verifyAndBindEmail()` with Admin SDK transaction.
 *
 * V1: provider not wired — profile may hold `emailStatus: unverified` locally;
 * index upsert is skipped until `emailStatus === 'verified'`.
 */

import type { PendingEmailVerification } from "@/domain/identityRegistry";

export const PENDING_EMAIL_TTL_MS = 20 * 60 * 1000;

const pendingById = new Map<string, PendingEmailVerification>();

export function createPendingEmailVerification(
  entry: PendingEmailVerification
): void {
  pendingById.set(entry.verificationId, entry);
}

export function getPendingEmailVerification(
  verificationId: string
): PendingEmailVerification | null {
  const row = pendingById.get(verificationId);
  if (!row) return null;
  if (row.expiresAt < Date.now()) {
    pendingById.delete(verificationId);
    return null;
  }
  return row;
}

export function purgeExpiredPendingEmailVerifications(): void {
  const now = Date.now();
  for (const [id, row] of pendingById) {
    if (row.expiresAt < now) pendingById.delete(id);
  }
}
