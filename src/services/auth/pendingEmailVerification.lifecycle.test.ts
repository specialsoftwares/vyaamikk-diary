import assert from "node:assert/strict";

import { AppError } from "@/domain/errors";
import {
  decideUnverifiedPendingEmailAction,
  emailsMatchForPending,
  isAuthoritativeVerifiedEmailOwnership,
  isPendingEmailRecordExpired,
  shouldClearTransientPendingEmailAfterPhoneAuth,
  shouldEnforceResendCooldown,
  shouldWriteUnverifiedPendingUserFields,
} from "@/services/auth/pendingEmailPolicy";
import {
  __resetPendingEmailVerificationForTests,
  clearPendingEmailVerification,
  clearTransientPendingEmailState,
  getPendingEmailVerification,
  preparePendingEmailVerification,
  rememberIssuedPendingEmailVerification,
  setPendingEmailVerification,
} from "@/services/auth/pendingEmailVerification";
import {
  EMAIL_OTP_SEND_USER_COPY,
  presentEmailOtpSendError,
} from "@/services/auth/presentEmailOtpSendError";
import {
  __activeLocalMockChallengeIdForUid,
  __peekLocalMockChallengeForTests,
  __setLocalMockEmailSendFailureForTests,
  assertDeterministicLocalMockOtpAllowed,
  clearLocalMockPendingEmailForUid,
  localMockStartEmailOtp,
  localMockVerifyEmailOtp,
  resetLocalMockEmailOtpForTests,
} from "@/services/auth/localMockEmailOtp";
import { EMAIL_OTP_TTL_MS, LOCAL_MOCK_DETERMINISTIC_EMAIL_OTP } from "@/services/auth/emailOtpConstants";
import { __setRuntimeSignalsForTests } from "@/config/env";
import type { UserProfile } from "@/domain/types";
import { DEFAULT_PDF_BRANDING } from "@/domain/types";

const UID_A = "uid-a";
const UID_B = "uid-b";
const EMAIL_1 = "email1@gmail.com";
const EMAIL_2 = "email2@gmail.com";

async function apply(patch: Partial<UserProfile>): Promise<UserProfile> {
  return {
    uid: UID_A,
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

function enableLocalMockEmailOtp(): void {
  __setRuntimeSignalsForTests({
    appOwnership: "expo",
    isDev: true,
    platform: "ios",
  });
  process.env.EXPO_PUBLIC_LOCAL_MOCK_EMAIL_OTP = "1";
}

function disableLocalMockEmailOtp(): void {
  delete process.env.EXPO_PUBLIC_LOCAL_MOCK_EMAIL_OTP;
  __setRuntimeSignalsForTests(null);
}

async function main() {
  enableLocalMockEmailOtp();
  __resetPendingEmailVerificationForTests();
  resetLocalMockEmailOtpForTests();

  // Policy: normalize + replace / resend / expiry
  assert.equal(emailsMatchForPending("  Email1@Gmail.com ", "email1@gmail.com"), true);
  assert.equal(
    decideUnverifiedPendingEmailAction({ submittedEmail: EMAIL_1, pending: null }).type,
    "fresh"
  );
  assert.equal(
    decideUnverifiedPendingEmailAction({
      submittedEmail: EMAIL_1,
      pending: { email: EMAIL_1, expiresAt: Date.now() + 60_000 },
    }).type,
    "resend"
  );
  assert.equal(
    decideUnverifiedPendingEmailAction({
      submittedEmail: EMAIL_2,
      pending: { email: EMAIL_1, expiresAt: Date.now() + 60_000 },
    }).type,
    "replace"
  );
  assert.equal(
    decideUnverifiedPendingEmailAction({
      submittedEmail: EMAIL_2,
      pending: { email: EMAIL_1, expiresAt: Date.now() - 1 },
    }).type,
    "fresh"
  );
  assert.equal(
    shouldEnforceResendCooldown(
      "replace",
      { resendAvailableAt: Date.now() + 30_000, expiresAt: Date.now() + 60_000 },
      Date.now()
    ),
    false,
    "different unverified email must not hit resend cooldown"
  );
  assert.equal(
    shouldEnforceResendCooldown(
      "resend",
      { resendAvailableAt: Date.now() + 30_000, expiresAt: Date.now() + 60_000 },
      Date.now()
    ),
    true
  );
  assert.equal(isAuthoritativeVerifiedEmailOwnership({ status: "active" }), false);
  assert.equal(isAuthoritativeVerifiedEmailOwnership({ status: "verified" }), true);
  assert.equal(
    isAuthoritativeVerifiedEmailOwnership({ status: "active", emailStatus: "verified" }),
    true
  );
  assert.equal(shouldWriteUnverifiedPendingUserFields("owner@example.com"), false);
  assert.equal(shouldWriteUnverifiedPendingUserFields(""), true);
  assert.equal(
    shouldClearTransientPendingEmailAfterPhoneAuth({
      emailStatus: "verification_pending",
      emailVerifiedAt: null,
      businessEmail: EMAIL_1,
    }),
    true
  );
  assert.equal(
    shouldClearTransientPendingEmailAfterPhoneAuth({
      emailStatus: "verified",
      emailVerifiedAt: Date.now(),
      normalizedEmail: EMAIL_1,
    }),
    false
  );

  // TEST 1 — First email
  {
    const prep = preparePendingEmailVerification(UID_A, EMAIL_1);
    assert.equal(prep.action, "fresh");
    const start = await localMockStartEmailOtp(UID_A, EMAIL_1);
    rememberIssuedPendingEmailVerification(UID_A, EMAIL_1, start);
    const pending = getPendingEmailVerification(UID_A);
    assert.ok(pending);
    assert.equal(pending?.email, EMAIL_1);
    assert.equal(start.sent, true);
    assert.equal(__peekLocalMockChallengeForTests(start.challengeId)?.status, "active");
  }

  // TEST 2 — Same email resend (after cooldown elapsed)
  {
    const firstId = __activeLocalMockChallengeIdForUid(UID_A)!;
    const peeked = __peekLocalMockChallengeForTests(firstId)!;
    peeked.resendAvailableAt = Date.now() - 1;
    const prep = preparePendingEmailVerification(UID_A, EMAIL_1);
    assert.equal(prep.action, "resend");
    const second = await localMockStartEmailOtp(UID_A, EMAIL_1);
    rememberIssuedPendingEmailVerification(UID_A, EMAIL_1, second);
    assert.notEqual(second.challengeId, firstId);
    assert.equal(__peekLocalMockChallengeForTests(firstId)?.status, "superseded");
    assert.equal(__peekLocalMockChallengeForTests(second.challengeId)?.status, "active");
    assert.equal(getPendingEmailVerification(UID_A)?.email, EMAIL_1);
  }

  // TEST 3 — Change email (including during cooldown)
  {
    resetLocalMockEmailOtpForTests();
    __resetPendingEmailVerificationForTests();
    const first = await localMockStartEmailOtp(UID_A, EMAIL_1);
    rememberIssuedPendingEmailVerification(UID_A, EMAIL_1, first);
    assert.ok(Date.now() < first.resendAvailableAt, "fixture still in cooldown");
    const prep = preparePendingEmailVerification(UID_A, EMAIL_2);
    assert.equal(prep.action, "replace");
    const second = await localMockStartEmailOtp(UID_A, EMAIL_2);
    rememberIssuedPendingEmailVerification(UID_A, EMAIL_2, second);
    assert.equal(__peekLocalMockChallengeForTests(first.challengeId)?.status, "superseded");
    assert.equal(__peekLocalMockChallengeForTests(second.challengeId)?.normalizedEmail, EMAIL_2);
    assert.equal(getPendingEmailVerification(UID_A)?.email, EMAIL_2);

    // TEST 4 — Old OTP invalid after replacement
    let oldRejected = false;
    try {
      await localMockVerifyEmailOtp(
        UID_A,
        first.challengeId,
        LOCAL_MOCK_DETERMINISTIC_EMAIL_OTP,
        apply
      );
    } catch {
      oldRejected = true;
    }
    assert.equal(oldRejected, true, "email1 OTP must not verify after switch to email2");
  }

  // TEST 5 — Expiry
  {
    resetLocalMockEmailOtpForTests();
    __resetPendingEmailVerificationForTests();
    const first = await localMockStartEmailOtp(UID_A, EMAIL_1);
    const peeked = __peekLocalMockChallengeForTests(first.challengeId)!;
    peeked.expiresAt = Date.now() - EMAIL_OTP_TTL_MS;
    peeked.resendAvailableAt = Date.now() + 30_000;
    setPendingEmailVerification(UID_A, {
      uid: UID_A,
      email: EMAIL_1,
      createdAt: Date.now() - EMAIL_OTP_TTL_MS - 1,
      expiresAt: Date.now() - 1,
      challengeId: first.challengeId,
    });
    assert.equal(isPendingEmailRecordExpired(getPendingEmailVerification(UID_A) ?? peeked), true);
    const prep = preparePendingEmailVerification(UID_A, EMAIL_2);
    assert.equal(prep.action, "fresh");
    const second = await localMockStartEmailOtp(UID_A, EMAIL_2);
    assert.equal(second.sent, true);
    assert.equal(__peekLocalMockChallengeForTests(first.challengeId)?.status, "superseded");
    assert.equal(__peekLocalMockChallengeForTests(second.challengeId)?.normalizedEmail, EMAIL_2);
  }

  // TEST 6 — Fresh phone-auth onboarding session (client cache cleared; server/local challenge replaced)
  {
    resetLocalMockEmailOtpForTests();
    __resetPendingEmailVerificationForTests();
    const abandoned = await localMockStartEmailOtp(UID_A, EMAIL_1);
    rememberIssuedPendingEmailVerification(UID_A, EMAIL_1, abandoned);
    const unverified = {
      emailStatus: "verification_pending" as const,
      emailVerifiedAt: null,
      businessEmail: EMAIL_1,
    };
    assert.equal(shouldClearTransientPendingEmailAfterPhoneAuth(unverified), true);
    clearTransientPendingEmailState(UID_A);
    assert.equal(getPendingEmailVerification(UID_A), null);
    const second = await localMockStartEmailOtp(UID_A, EMAIL_2);
    assert.equal(second.sent, true);
    assert.equal(__peekLocalMockChallengeForTests(abandoned.challengeId)?.status, "superseded");
    assert.equal(__peekLocalMockChallengeForTests(second.challengeId)?.normalizedEmail, EMAIL_2);
  }

  // TEST 7 — Sign-out clears transient pending so it cannot block a later session
  {
    resetLocalMockEmailOtpForTests();
    __resetPendingEmailVerificationForTests();
    const first = await localMockStartEmailOtp(UID_A, EMAIL_1);
    rememberIssuedPendingEmailVerification(UID_A, EMAIL_1, first);
    clearTransientPendingEmailState(UID_A);
    clearLocalMockPendingEmailForUid(UID_A);
    assert.equal(getPendingEmailVerification(UID_A), null);
    assert.equal(__peekLocalMockChallengeForTests(first.challengeId)?.status, "superseded");
    const second = await localMockStartEmailOtp(UID_A, EMAIL_2);
    assert.equal(second.sent, true);
  }

  // TEST 8 — Verified email protection
  {
    resetLocalMockEmailOtpForTests();
    __resetPendingEmailVerificationForTests();
    const start = await localMockStartEmailOtp(UID_A, EMAIL_1);
    const verified = await localMockVerifyEmailOtp(
      UID_A,
      start.challengeId,
      LOCAL_MOCK_DETERMINISTIC_EMAIL_OTP,
      apply
    );
    assert.equal(verified.emailStatus, "verified");
    assert.equal(verified.normalizedEmail, EMAIL_1);
    assert.equal(
      shouldClearTransientPendingEmailAfterPhoneAuth({
        emailStatus: "verified",
        emailVerifiedAt: verified.emailVerifiedAt,
        normalizedEmail: EMAIL_1,
      }),
      false
    );
    clearTransientPendingEmailState(UID_A);
    clearLocalMockPendingEmailForUid(UID_A);
    assert.equal(verified.normalizedEmail, EMAIL_1);
    assert.equal(verified.emailStatus, "verified");
    assert.equal(shouldWriteUnverifiedPendingUserFields(EMAIL_1), false);
  }

  // TEST 9 — Rapid double tap: in-flight guard + same-email cooldown keeps a single active challenge
  {
    resetLocalMockEmailOtpForTests();
    const lock = { current: false };
    const claim = (): boolean => {
      if (lock.current) return false;
      lock.current = true;
      return true;
    };
    assert.equal(claim(), true);
    assert.equal(claim(), false, "second tap must not claim in-flight");
    lock.current = false;
    const first = await localMockStartEmailOtp(UID_A, EMAIL_1);
    let cooldown = false;
    try {
      await localMockStartEmailOtp(UID_A, EMAIL_1);
    } catch (e) {
      cooldown = e instanceof AppError && e.code === "email_otp_cooldown";
    }
    assert.equal(cooldown, true);
    assert.equal(__activeLocalMockChallengeIdForUid(UID_A), first.challengeId);
    assert.equal(__peekLocalMockChallengeForTests(first.challengeId)?.status, "active");
  }

  // TEST 10 — UID isolation
  {
    resetLocalMockEmailOtpForTests();
    __resetPendingEmailVerificationForTests();
    const a = await localMockStartEmailOtp(UID_A, EMAIL_1);
    rememberIssuedPendingEmailVerification(UID_A, EMAIL_1, a);
    const b = await localMockStartEmailOtp(UID_B, EMAIL_2);
    rememberIssuedPendingEmailVerification(UID_B, EMAIL_2, b);
    assert.equal(getPendingEmailVerification(UID_A)?.email, EMAIL_1);
    assert.equal(getPendingEmailVerification(UID_B)?.email, EMAIL_2);
    assert.equal(__peekLocalMockChallengeForTests(a.challengeId)?.uid, UID_A);
    assert.equal(__peekLocalMockChallengeForTests(b.challengeId)?.uid, UID_B);
    clearPendingEmailVerification(UID_A);
    assert.equal(getPendingEmailVerification(UID_A), null);
    assert.equal(getPendingEmailVerification(UID_B)?.email, EMAIL_2);
  }

  // TEST 11 — Provider failure leaves retryable state
  {
    resetLocalMockEmailOtpForTests();
    __resetPendingEmailVerificationForTests();
    __setLocalMockEmailSendFailureForTests(true);
    let failed = false;
    try {
      await localMockStartEmailOtp(UID_A, EMAIL_1);
    } catch (e) {
      failed = e instanceof AppError && e.code === "otp_send_failed";
      assert.equal(presentEmailOtpSendError(e), EMAIL_OTP_SEND_USER_COPY.delivery);
    }
    assert.equal(failed, true);
    assert.equal(__activeLocalMockChallengeIdForUid(UID_A), undefined);
    __setLocalMockEmailSendFailureForTests(false);
    const retry = await localMockStartEmailOtp(UID_A, EMAIL_1);
    assert.equal(retry.sent, true);
    assert.equal(__peekLocalMockChallengeForTests(retry.challengeId)?.status, "active");
  }

  // TEST 12 — Production mode rejects mock OTP 000000
  {
    disableLocalMockEmailOtp();
    process.env.EXPO_PUBLIC_APP_MODE = "production";
    __setRuntimeSignalsForTests({
      appOwnership: "standalone",
      isDev: false,
      platform: "android",
    });
    let blocked = false;
    try {
      assertDeterministicLocalMockOtpAllowed(LOCAL_MOCK_DETERMINISTIC_EMAIL_OTP);
    } catch (e) {
      blocked = e instanceof AppError && e.code === "permission_denied";
    }
    assert.equal(blocked, true, "production must never accept mock OTP 000000");
    enableLocalMockEmailOtp();
  }

  assert.equal(
    presentEmailOtpSendError(new AppError("save_failed", "Enter a valid email address.")),
    EMAIL_OTP_SEND_USER_COPY.invalidEmail
  );
  assert.equal(
    presentEmailOtpSendError(new AppError("too_many_attempts", "rate")),
    EMAIL_OTP_SEND_USER_COPY.rateLimit
  );
  assert.equal(
    presentEmailOtpSendError(new AppError("auth_failed", "functions/unauthenticated")),
    EMAIL_OTP_SEND_USER_COPY.session
  );
  assert.equal(
    presentEmailOtpSendError(new Error("Firebase: INTERNAL")),
    EMAIL_OTP_SEND_USER_COPY.delivery
  );
  assert.equal(
    presentEmailOtpSendError(new AppError("unknown", "Please use your previous email or start over.")),
    EMAIL_OTP_SEND_USER_COPY.conflict
  );

  resetLocalMockEmailOtpForTests();
  __resetPendingEmailVerificationForTests();
  disableLocalMockEmailOtp();
  console.log("pendingEmailVerification.lifecycle.test.ts: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
