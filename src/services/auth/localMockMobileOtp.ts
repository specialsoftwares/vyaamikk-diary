/**
 * In-process local-mock mobile OTP challenge store (login purpose only).
 */

import { AppError } from "@/domain/errors";
import type { PhoneE164 } from "@/domain/types";
import {
  LOCAL_MOCK_DETERMINISTIC_MOBILE_OTP,
  MOBILE_OTP_LOCK_MS,
  MOBILE_OTP_MAX_ATTEMPTS,
  MOBILE_OTP_MAX_SENDS_PER_HOUR,
  MOBILE_OTP_RESEND_COOLDOWN_MS,
  MOBILE_OTP_TTL_MS,
  type MobileOtpPurpose,
} from "@/services/auth/mobileOtpConstants";
import {
  assertDeterministicLocalMockMobileOtpAllowed,
  isApprovedLocalMockMobileOtpEnvironment,
} from "@/services/auth/localMockMobileOtpGuard";
import type { OtpChallenge } from "@/services/auth/types";

interface MobileChallenge {
  verificationId: string;
  phoneE164: PhoneE164;
  purpose: MobileOtpPurpose;
  version: number;
  code: string;
  issuedAt: number;
  expiresAt: number;
  resendAvailableAt: number;
  incorrectAttempts: number;
  lockUntil: number | null;
  status: "active" | "consumed" | "superseded" | "locked" | "cancelled";
}

const byPhoneActive = new Map<string, string>();
const challenges = new Map<string, MobileChallenge>();
const sendLog = new Map<string, number[]>(); // phone -> timestamps

function requireEnv(): void {
  if (!isApprovedLocalMockMobileOtpEnvironment()) {
    throw new AppError(
      "permission_denied",
      "Local-mock mobile OTP is not available in this environment. Set EXPO_PUBLIC_LOCAL_MOCK_MOBILE_OTP=1."
    );
  }
}

function pruneSends(phone: string, now: number): number[] {
  const hourAgo = now - 3_600_000;
  const next = (sendLog.get(phone) ?? []).filter((t) => t > hourAgo);
  sendLog.set(phone, next);
  return next;
}

export function resetLocalMockMobileOtpForTests(): void {
  byPhoneActive.clear();
  challenges.clear();
  sendLog.clear();
}

export async function localMockStartMobileOtp(
  phoneE164: PhoneE164,
  purpose: MobileOtpPurpose = "login"
): Promise<OtpChallenge & { expiresAt: number; resendAvailableAt: number; version: number }> {
  requireEnv();
  const now = Date.now();
  const sends = pruneSends(phoneE164, now);
  if (sends.length >= MOBILE_OTP_MAX_SENDS_PER_HOUR) {
    const oldest = sends[0]!;
    const unlockAt = oldest + 3_600_000;
    throw new AppError("too_many_attempts", "OTP send limit reached for this number.", null, {
      resendAvailableAt: unlockAt,
      retryAfterSeconds: Math.max(0, Math.ceil((unlockAt - now) / 1000)),
    });
  }

  const prevId = byPhoneActive.get(phoneE164);
  if (prevId) {
    const prev = challenges.get(prevId);
    if (prev && prev.status === "active") {
      if (prev.lockUntil && prev.lockUntil > now) {
        throw new AppError("too_many_attempts", "Too many incorrect attempts. Try again later.", null, {
          lockUntil: prev.lockUntil,
          retryAfterSeconds: Math.max(0, Math.ceil((prev.lockUntil - now) / 1000)),
        });
      }
      if (now < prev.resendAvailableAt) {
        throw new AppError("otp_send_failed", "Resend is not available yet.", null, {
          resendAvailableAt: prev.resendAvailableAt,
          retryAfterSeconds: Math.max(0, Math.ceil((prev.resendAvailableAt - now) / 1000)),
        });
      }
      prev.status = "superseded";
      prev.code = "";
    }
  }

  const version = (prevId ? (challenges.get(prevId)?.version ?? 0) : 0) + 1;
  const verificationId = `local_mobile_${phoneE164}_${now}_v${version}`;
  const challenge: MobileChallenge = {
    verificationId,
    phoneE164,
    purpose,
    version,
    code: LOCAL_MOCK_DETERMINISTIC_MOBILE_OTP,
    issuedAt: now,
    expiresAt: now + MOBILE_OTP_TTL_MS,
    resendAvailableAt: now + MOBILE_OTP_RESEND_COOLDOWN_MS,
    incorrectAttempts: 0,
    lockUntil: null,
    status: "active",
  };
  challenges.set(verificationId, challenge);
  byPhoneActive.set(phoneE164, verificationId);
  sends.push(now);
  sendLog.set(phoneE164, sends);

  return {
    verificationId,
    phoneE164,
    // Never expose OTP in UI — always null.
    devCodeHint: null,
    expiresAt: challenge.expiresAt,
    resendAvailableAt: challenge.resendAvailableAt,
    version,
  };
}

export async function localMockConfirmMobileOtp(
  challenge: OtpChallenge,
  code: string,
  purpose: MobileOtpPurpose = "login"
): Promise<void> {
  requireEnv();
  assertDeterministicLocalMockMobileOtpAllowed(code.trim());

  const stored = challenges.get(challenge.verificationId);
  if (!stored || stored.status === "cancelled" || stored.status === "superseded") {
    throw new AppError("invalid_otp", "Incorrect OTP. Please try again.");
  }
  if (stored.purpose !== purpose) {
    throw new AppError("invalid_otp", "Incorrect OTP. Please try again.");
  }
  if (stored.phoneE164 !== challenge.phoneE164) {
    throw new AppError("invalid_otp", "Incorrect OTP. Please try again.");
  }
  if (stored.status === "consumed") {
    throw new AppError("otp_expired", "OTP expired. Please request a new code.");
  }
  const now = Date.now();
  if (stored.lockUntil && stored.lockUntil > now) {
    throw new AppError("too_many_attempts", "Too many incorrect attempts. Try again later.", null, {
      lockUntil: stored.lockUntil,
      retryAfterSeconds: Math.max(0, Math.ceil((stored.lockUntil - now) / 1000)),
    });
  }
  if (now > stored.expiresAt || stored.status === "locked") {
    stored.status = "locked";
    throw new AppError("otp_expired", "OTP expired. Please request a new code.");
  }
  if (code.trim() !== stored.code) {
    stored.incorrectAttempts += 1;
    const remaining = Math.max(0, MOBILE_OTP_MAX_ATTEMPTS - stored.incorrectAttempts);
    if (stored.incorrectAttempts >= MOBILE_OTP_MAX_ATTEMPTS) {
      stored.status = "locked";
      stored.lockUntil = now + MOBILE_OTP_LOCK_MS;
      stored.code = "";
      throw new AppError(
        "too_many_attempts",
        `Too many incorrect attempts. Try again in ${Math.ceil(MOBILE_OTP_LOCK_MS / 60_000)} minutes.`,
        null,
        {
          lockUntil: stored.lockUntil,
          retryAfterSeconds: Math.ceil(MOBILE_OTP_LOCK_MS / 1000),
        }
      );
    }
    throw new AppError("invalid_otp", `Incorrect OTP. ${remaining} attempts remaining.`);
  }
  stored.status = "consumed";
  stored.code = "";
}

export function localMockCancelMobileOtp(phoneE164: string): void {
  const id = byPhoneActive.get(phoneE164);
  if (!id) return;
  const c = challenges.get(id);
  if (c) {
    c.status = "cancelled";
    c.code = "";
  }
  byPhoneActive.delete(phoneE164);
}

export function __peekLocalMockMobileChallengeForTests(verificationId: string): MobileChallenge | undefined {
  return challenges.get(verificationId);
}
