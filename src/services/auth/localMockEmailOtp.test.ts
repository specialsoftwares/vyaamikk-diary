import assert from "node:assert/strict";

import {
  isApprovedLocalMockEmailOtpEnvironment,
  localMockStartEmailOtp,
  localMockVerifyEmailOtp,
  resetLocalMockEmailOtpForTests,
} from "./localMockEmailOtp";
import { __setRuntimeSignalsForTests } from "@/config/env";
import type { UserProfile } from "@/domain/types";
import { DEFAULT_PDF_BRANDING } from "@/domain/types";

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
  resetLocalMockEmailOtpForTests();
  __setRuntimeSignalsForTests({
    appOwnership: "expo",
    isDev: true,
    platform: "ios",
  });

  assert.equal(isApprovedLocalMockEmailOtpEnvironment(), true);

  {
    const start = await localMockStartEmailOtp("u1", "owner@example.com");
    assert.equal(start.devCodeHint, "246810");

    let failed = false;
    try {
      await localMockVerifyEmailOtp("u1", start.challengeId, "000000", apply);
    } catch {
      failed = true;
    }
    assert.equal(failed, true);

    const ok = await localMockVerifyEmailOtp("u1", start.challengeId, "246810", apply);
    assert.equal(ok.emailStatus, "verified");
    assert.ok(ok.emailVerifiedAt);
  }

  {
    resetLocalMockEmailOtpForTests();
    const start = await localMockStartEmailOtp("u2", "lock@example.com");
    for (let i = 0; i < 3; i++) {
      try {
        await localMockVerifyEmailOtp("u2", start.challengeId, "111111", apply);
      } catch {
        // expected
      }
    }
    let locked = false;
    try {
      await localMockVerifyEmailOtp("u2", start.challengeId, "246810", apply);
    } catch {
      locked = true;
    }
    assert.equal(locked, true);

    const other = await localMockStartEmailOtp("u2", "other@example.com");
    const profile = await localMockVerifyEmailOtp("u2", other.challengeId, "246810", apply);
    assert.equal(profile.normalizedEmail, "other@example.com");
  }

  resetLocalMockEmailOtpForTests();
  __setRuntimeSignalsForTests(null);
  console.log("localMockEmailOtp.test.ts: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
