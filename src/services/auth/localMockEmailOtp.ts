/**
 * Guarded local-mock email OTP — never used when activeBackend is Firebase.
 * Development OTP is compiled only when every guard below passes.
 */

import { AppError } from "@/domain/errors";
import type { UserProfile } from "@/domain/types";
import { getActiveBackend, getResolvedEnvironment } from "@/config/env";
import { hashEmail, isValidEmailSyntax, normalizeEmail } from "@/utils/emailHash";
import {
  EMAIL_OTP_LOCK_MS,
  EMAIL_OTP_MAX_ATTEMPTS,
  EMAIL_OTP_RESEND_COOLDOWN_MS,
  EMAIL_OTP_TTL_MS,
} from "@/services/auth/emailOtpConstants";
import { createLogger } from "@/utils/logger";

const log = createLogger("auth/localMockEmailOtp");

export interface LocalMockEmailChallenge {
  challengeId: string;
  uid: string;
  normalizedEmail: string;
  version: number;
  /** Never persist plaintext OTP — held in process memory only. */
  code: string;
  issuedAt: number;
  expiresAt: number;
  resendAvailableAt: number;
  incorrectAttempts: number;
  lockUntil: number | null;
  status: "active" | "consumed" | "superseded" | "locked";
}

const challenges = new Map<string, LocalMockEmailChallenge>();
const emailIndex = new Map<string, string>(); // hash -> uid
const byUidActive = new Map<string, string>(); // uid -> challengeId

/**
 * All four must be true — never infer safety from __DEV__ or Expo Go alone.
 */
export function isApprovedLocalMockEmailOtpEnvironment(): boolean {
  const resolved = getResolvedEnvironment();
  if (resolved.getActiveBackend() !== "local-mock") return false;
  if (resolved.effectiveAppMode !== "development") return false;
  if (resolved.bundledAppMode === "production") return false;
  // Explicit opt-in OR classic Metro __DEV__ under local-mock development.
  const isDevBundle =
    typeof __DEV__ !== "undefined"
      ? __DEV__
      : process.env.NODE_ENV !== "production";
  if (process.env.EXPO_PUBLIC_LOCAL_MOCK_EMAIL_OTP !== "1" && !isDevBundle) return false;
  if (getActiveBackend() !== "local-mock") return false;
  return true;
}

function requireLocalMock(): void {
  if (!isApprovedLocalMockEmailOtpEnvironment()) {
    throw new AppError(
      "permission_denied",
      "Local-mock email OTP is not available in this environment."
    );
  }
}

function generateCode(): string {
  // Deterministic only in approved local-mock; never shipped as production secret.
  return "246810";
}

export async function localMockStartEmailOtp(
  uid: string,
  rawEmail: string
): Promise<{
  challengeId: string;
  maskedEmail: string;
  expiresAt: number;
  resendAvailableAt: number;
  version: number;
  sent: boolean;
  devCodeHint: string;
}> {
  requireLocalMock();
  if (!isValidEmailSyntax(rawEmail)) {
    throw new AppError("save_failed", "Enter a valid email address.");
  }
  const normalized = normalizeEmail(rawEmail);
  const hash = hashEmail(normalized);
  const owner = emailIndex.get(hash);
  if (owner && owner !== uid) {
    throw new AppError("email_already_linked", "This email cannot be used. Try a different address.");
  }

  const prevId = byUidActive.get(uid);
  if (prevId) {
    const prev = challenges.get(prevId);
    if (prev && prev.status === "active") {
      if (prev.lockUntil && prev.lockUntil > Date.now() && prev.normalizedEmail === normalized) {
        throw new AppError("permission_denied", "Too many incorrect attempts. Wait 1 hour or use a different email.");
      }
      if (Date.now() < prev.resendAvailableAt && prev.normalizedEmail === normalized) {
        throw new AppError("permission_denied", "Please wait before requesting another code.");
      }
      prev.status = "superseded";
    }
  }

  const now = Date.now();
  const challengeId = `local_email_${uid}_${now}`;
  const version = (prevId ? (challenges.get(prevId)?.version ?? 0) : 0) + 1;
  const code = generateCode();
  const challenge: LocalMockEmailChallenge = {
    challengeId,
    uid,
    normalizedEmail: normalized,
    version,
    code,
    issuedAt: now,
    expiresAt: now + EMAIL_OTP_TTL_MS,
    resendAvailableAt: now + EMAIL_OTP_RESEND_COOLDOWN_MS,
    incorrectAttempts: 0,
    lockUntil: null,
    status: "active",
  };
  challenges.set(challengeId, challenge);
  byUidActive.set(uid, challengeId);
  log.info("local-mock email OTP issued (development-only)", { version, challengeId });

  return {
    challengeId,
    maskedEmail: `${normalized.slice(0, 2)}***@${normalized.split("@")[1] ?? ""}`,
    expiresAt: challenge.expiresAt,
    resendAvailableAt: challenge.resendAvailableAt,
    version,
    sent: true,
    devCodeHint: code,
  };
}

export async function localMockVerifyEmailOtp(
  uid: string,
  challengeId: string,
  code: string,
  applyProfile: (patch: Partial<UserProfile>) => Promise<UserProfile>
): Promise<UserProfile> {
  requireLocalMock();
  const challenge = challenges.get(challengeId);
  if (!challenge || challenge.uid !== uid) {
    throw new AppError("not_found", "Verification expired or not found.");
  }
  if (challenge.status === "consumed") {
    // idempotent
    return applyProfile({});
  }
  if (challenge.status === "superseded") {
    throw new AppError("permission_denied", "That code is no longer valid. Request a new one.");
  }
  if (challenge.status === "locked" || (challenge.lockUntil && challenge.lockUntil > Date.now())) {
    throw new AppError("permission_denied", "Too many incorrect attempts. Wait 1 hour or use a different email.");
  }
  if (challenge.expiresAt < Date.now()) {
    challenge.status = "superseded";
    throw new AppError("permission_denied", "That code has expired. Request a new one.");
  }
  if (code.trim() !== challenge.code) {
    challenge.incorrectAttempts += 1;
    if (challenge.incorrectAttempts >= EMAIL_OTP_MAX_ATTEMPTS) {
      challenge.status = "locked";
      challenge.lockUntil = Date.now() + EMAIL_OTP_LOCK_MS;
      challenge.code = "";
      throw new AppError("permission_denied", "Too many incorrect attempts. Wait 1 hour or use a different email.");
    }
    throw new AppError("invalid_otp", "Incorrect code. Please try again.");
  }

  const hash = hashEmail(challenge.normalizedEmail);
  const owner = emailIndex.get(hash);
  if (owner && owner !== uid) {
    throw new AppError("email_already_linked", "This email cannot be used. Try a different address.");
  }
  emailIndex.set(hash, uid);
  challenge.status = "consumed";
  challenge.code = "";
  const now = Date.now();
  return applyProfile({
    businessEmail: challenge.normalizedEmail,
    normalizedEmail: challenge.normalizedEmail,
    emailHash: hash,
    emailStatus: "verified",
    emailLinkedAt: now,
    emailVerifiedAt: now,
    emailBindingVersion: 1,
    identityUpdatedAt: now,
    emailVerificationLockUntil: null,
  });
}

export function resetLocalMockEmailOtpForTests(): void {
  challenges.clear();
  emailIndex.clear();
  byUidActive.clear();
}
