import assert from "node:assert/strict";

import {
  assertNotInCoolingOff,
  coolingOffRemainingMs,
  isInRecoveryCoolingOff,
} from "./coolingOffPolicy";
import type { UserProfile } from "@/domain/types";
import { DEFAULT_PDF_BRANDING } from "@/domain/types";

const user = {
  uid: "u1",
  ueid: "VYD-2026-TEST01",
  phoneE164: "+919876543210",
  displayName: "T",
  salutation: null,
  businessName: null,
  workType: null,
  designation: null,
  businessEmail: "a@b.co",
  language: "en" as const,
  profileCompletedAt: 1,
  ueidReleasedAt: 1,
  onboardingIntroSeenAt: 1,
  profileLogo: null,
  pdfBranding: { ...DEFAULT_PDF_BRANDING },
  lastLoginAt: 1,
  previousLoginAt: null,
  lastActiveAt: 1,
  createdAt: 1,
  updatedAt: 1,
  deletedAt: null,
  status: "active" as const,
  coolingOffUntil: Date.now() + 120_000,
} satisfies UserProfile;

assert.equal(isInRecoveryCoolingOff(user), true);
assert.ok(coolingOffRemainingMs(user) > 0);

let threw = false;
try {
  assertNotInCoolingOff(user, "change_email");
} catch {
  threw = true;
}
assert.equal(threw, true);

assert.equal(isInRecoveryCoolingOff({ ...user, coolingOffUntil: Date.now() - 1 }), false);

console.log("coolingOffPolicy.test.ts: ok");
