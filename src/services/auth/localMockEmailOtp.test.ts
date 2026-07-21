import assert from "node:assert/strict";

import {
  assertDeterministicLocalMockOtpAllowed,
  isApprovedLocalMockEmailOtpEnvironment,
  localMockStartEmailOtp,
  localMockVerifyEmailOtp,
  resetLocalMockEmailOtpForTests,
  __peekLocalMockChallengeForTests,
} from "./localMockEmailOtp";
import {
  LEGACY_LOCAL_MOCK_EMAIL_OTP,
  LOCAL_MOCK_DETERMINISTIC_EMAIL_OTP,
  EMAIL_OTP_RESEND_COOLDOWN_MS,
} from "./emailOtpConstants";
import { __setRuntimeSignalsForTests } from "@/config/env";
import type { UserProfile } from "@/domain/types";
import { DEFAULT_PDF_BRANDING } from "@/domain/types";
import { remainingSecondsUntil } from "@/utils/otpCountdownFormat";

async function apply(patch: Partial<UserProfile>): Promise<UserProfile> {
  return {
    uid: "u1",
    ueid: "VYD-2026-TEST01",
    phoneE164: "+919876543210",
    displayName: "T",
    salutation: null,
    businessName: null,
    workType: null,
    designation: null,
    businessEmail: null,
    language: "en",
    profileCompletedAt: null,
    ueidReleasedAt: null,
    onboardingIntroSeenAt: null,
    profileLogo: null,
    pdfBranding: { ...DEFAULT_PDF_BRANDING },
    lastLoginAt: Date.now(),
    previousLoginAt: null,
    lastActiveAt: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
    status: "active",
    ...patch,
  };
}

async function main() {
  assert.equal(LOCAL_MOCK_DETERMINISTIC_EMAIL_OTP, "000000");
  assert.equal(LEGACY_LOCAL_MOCK_EMAIL_OTP, "246810");

  resetLocalMockEmailOtpForTests();
  __setRuntimeSignalsForTests({
    appOwnership: "expo",
    isDev: true,
    platform: "ios",
  });

  // Without explicit flag — must refuse (no __DEV__ bypass).
  delete process.env.EXPO_PUBLIC_LOCAL_MOCK_EMAIL_OTP;
  assert.equal(isApprovedLocalMockEmailOtpEnvironment(), false);
  let blocked = false;
  try {
    await localMockStartEmailOtp("u1", "a@b.co");
  } catch {
    blocked = true;
  }
  assert.equal(blocked, true, "mock OTP must require EXPO_PUBLIC_LOCAL_MOCK_EMAIL_OTP=1");

  process.env.EXPO_PUBLIC_LOCAL_MOCK_EMAIL_OTP = "1";
  assert.equal(isApprovedLocalMockEmailOtpEnvironment(), true);

  // Deterministic OTP guard rejects outside env even if somehow called.
  delete process.env.EXPO_PUBLIC_LOCAL_MOCK_EMAIL_OTP;
  let guardBlocked = false;
  try {
    assertDeterministicLocalMockOtpAllowed(LOCAL_MOCK_DETERMINISTIC_EMAIL_OTP);
  } catch {
    guardBlocked = true;
  }
  assert.equal(guardBlocked, true, "production/shared mode must never accept 000000");
  process.env.EXPO_PUBLIC_LOCAL_MOCK_EMAIL_OTP = "1";
  assertDeterministicLocalMockOtpAllowed(LOCAL_MOCK_DETERMINISTIC_EMAIL_OTP);

  {
    const start = await localMockStartEmailOtp("u1", "owner@example.com");
    assert.equal(start.devCodeHint, LOCAL_MOCK_DETERMINISTIC_EMAIL_OTP);
    assert.ok(start.resendAvailableAt > Date.now());
    assert.ok(start.expiresAt > start.resendAvailableAt);
    const remaining = remainingSecondsUntil(start.resendAvailableAt);
    assert.ok(remaining >= 29 && remaining <= 30, `resend begins ~30s, got ${remaining}`);

    let legacyRejected = false;
    try {
      await localMockVerifyEmailOtp("u1", start.challengeId, LEGACY_LOCAL_MOCK_EMAIL_OTP, apply);
    } catch {
      legacyRejected = true;
    }
    assert.equal(legacyRejected, true, "legacy 246810 must be rejected");

    let arbitraryRejected = false;
    try {
      await localMockVerifyEmailOtp("u1", start.challengeId, "111111", apply);
    } catch {
      arbitraryRejected = true;
    }
    assert.equal(arbitraryRejected, true);

    const ok = await localMockVerifyEmailOtp(
      "u1",
      start.challengeId,
      LOCAL_MOCK_DETERMINISTIC_EMAIL_OTP,
      apply
    );
    assert.equal(ok.emailStatus, "verified");
  }

  {
    // Resend invalidates previous OTP + bumps version
    resetLocalMockEmailOtpForTests();
    process.env.EXPO_PUBLIC_LOCAL_MOCK_EMAIL_OTP = "1";
    const first = await localMockStartEmailOtp("u3", "resend@example.com");
    const firstId = first.challengeId;
    assert.equal(first.version, 1);
    // Force cooldown elapsed
    const peeked = __peekLocalMockChallengeForTests(firstId)!;
    peeked.resendAvailableAt = Date.now() - 1;

    const second = await localMockStartEmailOtp("u3", "resend@example.com");
    assert.notEqual(second.challengeId, firstId);
    assert.equal(second.version, 2);
    assert.equal(__peekLocalMockChallengeForTests(firstId)?.status, "superseded");
    assert.equal(__peekLocalMockChallengeForTests(firstId)?.code, "");

    let oldRejected = false;
    try {
      await localMockVerifyEmailOtp("u3", firstId, LOCAL_MOCK_DETERMINISTIC_EMAIL_OTP, apply);
    } catch {
      oldRejected = true;
    }
    assert.equal(oldRejected, true);

    const profile = await localMockVerifyEmailOtp(
      "u3",
      second.challengeId,
      LOCAL_MOCK_DETERMINISTIC_EMAIL_OTP,
      apply
    );
    assert.equal(profile.normalizedEmail, "resend@example.com");
  }

  {
    // Cooldown returns authoritative resendAvailableAt; failed resend does not rotate
    resetLocalMockEmailOtpForTests();
    process.env.EXPO_PUBLIC_LOCAL_MOCK_EMAIL_OTP = "1";
    const start = await localMockStartEmailOtp("u4", "cool@example.com");
    const beforeId = start.challengeId;
    let cooldown = false;
    let until: number | null = null;
    let retry: number | null = null;
    try {
      await localMockStartEmailOtp("u4", "cool@example.com");
    } catch (e) {
      cooldown = true;
      if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "email_otp_cooldown") {
        const details = (e as { details?: { resendAvailableAt?: number; retryAfterSeconds?: number } })
          .details;
        until = Number(details?.resendAvailableAt);
        retry = Number(details?.retryAfterSeconds);
      }
    }
    assert.equal(cooldown, true);
    assert.equal(until, start.resendAvailableAt);
    assert.ok(retry != null && retry > 0 && retry <= 30);
    assert.equal(__peekLocalMockChallengeForTests(beforeId)?.status, "active");
    assert.equal(__peekLocalMockChallengeForTests(beforeId)?.version, 1);

    // Authoritative remaining does not restart on re-read (rerender-stable).
    const t1 = remainingSecondsUntil(start.resendAvailableAt);
    const t2 = remainingSecondsUntil(start.resendAvailableAt);
    assert.equal(t1, t2);
    assert.ok(EMAIL_OTP_RESEND_COOLDOWN_MS === 30_000);
  }

  resetLocalMockEmailOtpForTests();
  delete process.env.EXPO_PUBLIC_LOCAL_MOCK_EMAIL_OTP;
  __setRuntimeSignalsForTests(null);
  console.log("localMockEmailOtp.test.ts: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
