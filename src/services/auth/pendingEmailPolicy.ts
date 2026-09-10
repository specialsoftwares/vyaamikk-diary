/**
 * Pure policy for unverified pending-email replacement.
 *
 * Authoritative OTP expiry is the server-issued challenge `expiresAt`
 * (EMAIL_OTP_TTL_MS = 15 minutes). This module does not introduce a second clock.
 */

export type UnverifiedPendingEmailAction = "fresh" | "resend" | "replace";

export interface PendingEmailPolicyRecord {
  email: string;
  expiresAt: number;
}

export function normalizePendingEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function emailsMatchForPending(a: string, b: string): boolean {
  return normalizePendingEmail(a) === normalizePendingEmail(b);
}

export function isPendingEmailRecordExpired(
  record: { expiresAt: number } | null | undefined,
  now = Date.now()
): boolean {
  if (!record) return true;
  return record.expiresAt <= now;
}

export function decideUnverifiedPendingEmailAction(input: {
  submittedEmail: string;
  pending: PendingEmailPolicyRecord | null;
  now?: number;
}): { type: UnverifiedPendingEmailAction } {
  const now = input.now ?? Date.now();
  if (!input.pending) return { type: "fresh" };
  if (isPendingEmailRecordExpired(input.pending, now)) return { type: "fresh" };
  if (emailsMatchForPending(input.pending.email, input.submittedEmail)) {
    return { type: "resend" };
  }
  return { type: "replace" };
}

export function pickActivePendingForPolicy<
  T extends { normalizedEmail: string; expiresAt: number; status: string },
>(challenges: T[], submittedNormalized: string, now: number): T | null {
  const active = challenges.filter((c) => c.status === "active");
  if (active.length === 0) return null;
  const submitted = normalizePendingEmail(submittedNormalized);
  const same = active.find((c) => c.normalizedEmail === submitted);
  if (same) return same;
  const unexpiredOther = active.find(
    (c) => c.normalizedEmail !== submitted && c.expiresAt > now
  );
  return unexpiredOther ?? active[0] ?? null;
}

export function shouldEnforceResendCooldown(
  action: UnverifiedPendingEmailAction,
  pending: { resendAvailableAt: number; expiresAt: number } | null,
  now: number
): boolean {
  if (action !== "resend" || !pending) return false;
  if (pending.expiresAt <= now) return false;
  return now < pending.resendAvailableAt;
}

/** Unverified onboarding may write temporary pending email fields. Verified email must not. */
export function shouldWriteUnverifiedPendingUserFields(
  currentVerifiedNormalized: string
): boolean {
  return currentVerifiedNormalized.trim() === "";
}

/**
 * emailBindings.status is "verified".
 * emailIndex.status is account status ("active") and must NOT be treated as verified email.
 */
export function isAuthoritativeVerifiedEmailOwnership(data: {
  status?: string;
  emailStatus?: string;
}): boolean {
  return data.status === "verified" || data.emailStatus === "verified";
}

export function shouldClearTransientPendingEmailAfterPhoneAuth(user: {
  emailStatus?: string | null;
  emailVerifiedAt?: number | null;
  normalizedEmail?: string | null;
  businessEmail?: string | null;
}): boolean {
  const email = (user.normalizedEmail ?? user.businessEmail ?? "").trim();
  if (!email || !email.includes("@")) return true;
  if (user.emailStatus !== "verified") return true;
  if (user.emailVerifiedAt == null || user.emailVerifiedAt <= 0) return true;
  return false;
}
