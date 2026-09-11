/**
 * Client cache of the latest unverified email OTP challenge for a UID.
 *
 * Authoritative pending state lives in Firestore `pendingEmailVerifications`
 * (Cloud Function `startEmailVerification`). This Map is a session-local
 * reminder of the last successful issue so the UI can resend without inventing
 * a second expiry clock. It is keyed by Firebase UID, never by phone.
 */

import { EMAIL_OTP_TTL_MS } from "./emailOtpConstants";
import {
  decideUnverifiedPendingEmailAction,
  isPendingEmailRecordExpired,
  normalizePendingEmail,
  type UnverifiedPendingEmailAction,
} from "./pendingEmailPolicy";

/** Alias of the server OTP TTL — not a second expiry policy. */
export const PENDING_EMAIL_TTL_MS = EMAIL_OTP_TTL_MS;

export interface ClientPendingEmailVerification {
  uid: string;
  email: string;
  createdAt: number;
  expiresAt: number;
  challengeId?: string;
}

const pendingByUid = new Map<string, ClientPendingEmailVerification>();

export function getPendingEmailVerification(
  uid: string
): ClientPendingEmailVerification | null {
  const row = pendingByUid.get(uid);
  if (!row) return null;
  if (isPendingEmailRecordExpired(row)) {
    pendingByUid.delete(uid);
    return null;
  }
  return row;
}

export function setPendingEmailVerification(
  uid: string,
  record: ClientPendingEmailVerification
): void {
  pendingByUid.set(uid, {
    ...record,
    uid,
    email: normalizePendingEmail(record.email),
  });
}

export function clearPendingEmailVerification(uid: string): void {
  pendingByUid.delete(uid);
}

export function isPendingEmailVerificationExpired(
  record: ClientPendingEmailVerification | null | undefined,
  now = Date.now()
): boolean {
  return isPendingEmailRecordExpired(record, now);
}

/**
 * Align the local cache with replace/resend/fresh before issuing an OTP.
 * Does not talk to the server — `startEmailVerification` is authoritative.
 */
export function preparePendingEmailVerification(
  uid: string,
  submittedEmail: string,
  now = Date.now()
): {
  action: UnverifiedPendingEmailAction;
  previous: ClientPendingEmailVerification | null;
} {
  const previous = pendingByUid.get(uid) ?? null;
  const decision = decideUnverifiedPendingEmailAction({
    submittedEmail,
    pending: previous ? { email: previous.email, expiresAt: previous.expiresAt } : null,
    now,
  });
  if (decision.type === "fresh" || decision.type === "replace") {
    pendingByUid.delete(uid);
  }
  return { action: decision.type, previous };
}

export function rememberIssuedPendingEmailVerification(
  uid: string,
  email: string,
  issued: { challengeId: string; expiresAt?: number }
): void {
  const createdAt = Date.now();
  setPendingEmailVerification(uid, {
    uid,
    email,
    createdAt,
    expiresAt: issued.expiresAt ?? createdAt + EMAIL_OTP_TTL_MS,
    challengeId: issued.challengeId,
  });
}

/** Transient onboarding challenge cache only — never touches verified email. */
export function clearTransientPendingEmailState(uid: string): void {
  clearPendingEmailVerification(uid);
}

export function __resetPendingEmailVerificationForTests(): void {
  pendingByUid.clear();
}
