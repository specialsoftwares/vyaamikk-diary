/**
 * Phone-challenge authentication invariant
 * ---------------------------------------
 * A CURRENT phone challenge is verified ONLY when authentication success is
 * proven for THAT challenge.
 *
 * NOT sufficient alone:
 * - native currentUser merely exists
 * - AuthProvider is signed_in
 * - some user has phoneE164
 * - code was sent (onCodeSent)
 * - a previous phone login succeeded
 * - a restored stale Firebase session exists
 *
 * Required association:
 * - current attemptId
 * - current verificationId / challenge
 * - current challenge phoneE164
 * - authentication established after the challenge was started
 * - authenticated phoneNumber (E.164) matches challenge.phoneE164
 * - event belongs to the active challenge lifecycle
 * - post-auth continuation has not already run (caller / in-flight refs)
 *
 * preSendUid capture ordering (nativePhoneAuth.startNativePhoneOtp):
 *   1) await clearStaleNativeAuthForFreshChallenge()  // existing signOut path
 *   2) preSend = snapshotNativeAuthState()            // AFTER clear
 *   3) startedAtMs / signInWithPhoneNumber / store challenge
 *
 * For a successful fresh challenge, preSendUid is therefore null. UID inequality
 * is NOT the security proof. Instant verification is proven by challenge scope +
 * post-start auth + matching phone. The residual check
 * `preSendUid && preSendUid === currentUid` only rejects an uncleared stale
 * session (clear failed); a legitimate returning account may reuse the same
 * Firebase UID when preSendUid is null after clear.
 */

import { normalizePhoneE164 } from "@/utils/mobileHash";

/** Digits-only form for equality (handles "+91 64208 35745" vs "+916420835745"). */
function e164Comparable(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return "";
  try {
    // normalizePhoneE164 preserves spaces when input already starts with "+".
    const normalized = normalizePhoneE164(trimmed);
    const digits = normalized.replace(/\D/g, "");
    return digits.length >= 8 ? digits : "";
  } catch {
    const digits = trimmed.replace(/\D/g, "");
    return digits.length >= 8 ? digits : "";
  }
}

/** Canonical E.164 equality for challenge vs Firebase Auth phone. */
export function phonesMatchE164(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (a == null || b == null) return false;
  const left = e164Comparable(String(a));
  const right = e164Comparable(String(b));
  if (!left || !right) return false;
  return left === right;
}

export type PhoneChallengeAutoVerifyRecord = {
  attemptId: string;
  verificationId: string;
  challengePhoneE164: string;
  authenticatedUid: string;
  /** Epoch ms when the challenge send started (before signInWithPhoneNumber). */
  challengeStartedAtMs: number;
  /** Epoch ms when the matching auth event was observed. */
  authenticatedAtMs: number;
};

export type EvaluateAutoVerifyInput = {
  challenge: {
    attemptId: string;
    verificationId: string;
    phoneE164: string;
    startedAtMs: number;
  };
  /**
   * UID present after clearStaleNativeAuthForFreshChallenge and before send.
   * Null on a successful fresh challenge. Non-null only if stale clear left a user.
   */
  preSendUid: string | null;
  /** Current native Firebase user after/during post-send observation. */
  currentUid: string | null;
  currentPhoneE164: string | null;
  observedAtMs: number;
};

/**
 * Decide whether a native auth user proves THIS challenge via post-send
 * instant verification (not a pre-existing stale session).
 */
export function evaluatePostSendAutoVerification(
  input: EvaluateAutoVerifyInput
): PhoneChallengeAutoVerifyRecord | null {
  const { challenge, preSendUid, currentUid, currentPhoneE164, observedAtMs } = input;
  if (!currentUid) return null;
  // Residual stale only: uncleared pre-send user still present. Not a same-UID ban —
  // returning accounts may keep the same Firebase UID when preSendUid is null after clear.
  if (preSendUid != null && preSendUid === currentUid) return null;
  if (!phonesMatchE164(currentPhoneE164, challenge.phoneE164)) return null;
  if (observedAtMs < challenge.startedAtMs) return null;

  return {
    attemptId: challenge.attemptId,
    verificationId: challenge.verificationId,
    challengePhoneE164: challenge.phoneE164,
    authenticatedUid: currentUid,
    challengeStartedAtMs: challenge.startedAtMs,
    authenticatedAtMs: observedAtMs,
  };
}

/** Empty-code confirm is allowed only with a matching auto-verify marker. */
export function emptyCodeConfirmAllowed(args: {
  challengeVerificationId: string;
  challengePhoneE164: string;
  challengeAttemptId: string;
  marker: PhoneChallengeAutoVerifyRecord | null | undefined;
  currentUid: string | null;
  currentPhoneE164: string | null;
}): boolean {
  const { marker } = args;
  if (!marker) return false;
  if (marker.verificationId !== args.challengeVerificationId) return false;
  if (marker.attemptId !== args.challengeAttemptId) return false;
  if (!phonesMatchE164(marker.challengePhoneE164, args.challengePhoneE164)) return false;
  if (!args.currentUid || args.currentUid !== marker.authenticatedUid) return false;
  if (!phonesMatchE164(args.currentPhoneE164, args.challengePhoneE164)) return false;
  return true;
}

export const AUTH_PHONE_CHALLENGE_MISMATCH = "AUTH_PHONE_CHALLENGE_MISMATCH" as const;
