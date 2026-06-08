import assert from "node:assert/strict";

import type { EmailIndexEntry } from "@/domain/types";
import type { UserProfile } from "@/domain/types";
import {
  EMAIL_DUPLICATE_ACTIVE_MESSAGE,
  EMAIL_PENDING_DELETION_MESSAGE,
  evaluateBusinessEmailLink,
} from "@/services/auth/emailLink";
import { hashEmail, normalizeEmail } from "@/utils/emailHash";

function baseUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "user-a",
    ueid: "VYD-2026-AAAAAA",
    phoneE164: "+919876543210",
    displayName: null,
    salutation: null,
    businessName: null,
    workType: null,
    designation: null,
    businessEmail: null,
    language: null,
    profileCompletedAt: null,
    ueidReleasedAt: null,
    onboardingIntroSeenAt: null,
    profileLogo: null,
    pdfBranding: { includeProfileLogo: true },
    lastLoginAt: null,
    previousLoginAt: null,
    lastActiveAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
    status: "active",
    ...overrides,
  };
}

function indexFor(
  userId: string,
  ueid: string,
  status: EmailIndexEntry["status"] = "active",
  emailStatus: EmailIndexEntry["emailStatus"] = "verified"
): EmailIndexEntry {
  const email = "other@example.com";
  const emailHash = hashEmail(normalizeEmail(email));
  return {
    emailHash,
    userId,
    ueid,
    status,
    emailStatus,
    linkedAt: Date.now(),
    verifiedAt: emailStatus === "verified" ? Date.now() : null,
  };
}

// normalize
assert.equal(normalizeEmail("  Foo@Bar.COM "), "foo@bar.com");
assert.equal(hashEmail("a@b.com"), hashEmail("a@b.com"));

// same user noop
const same = evaluateBusinessEmailLink(
  baseUser({ businessEmail: "me@co.in", normalizedEmail: "me@co.in", emailHash: hashEmail("me@co.in") }),
  "me@co.in",
  null
);
assert.equal(same.kind, "noop");

// duplicate active block
let blocked = false;
try {
  evaluateBusinessEmailLink(
    baseUser(),
    "other@example.com",
    indexFor("user-b", "VYD-2026-BBBBBB", "active")
  );
} catch (e) {
  blocked = e instanceof Error && e.message === EMAIL_DUPLICATE_ACTIVE_MESSAGE;
}
assert.equal(blocked, true);

// unverified index entry does not block another account
const unverifiedLink = evaluateBusinessEmailLink(
  baseUser(),
  "other@example.com",
  indexFor("user-b", "VYD-2026-BBBBBB", "active", "unverified")
);
assert.equal(unverifiedLink.kind, "link");

// pending deletion block
blocked = false;
try {
  evaluateBusinessEmailLink(
    baseUser(),
    "other@example.com",
    indexFor("user-b", "VYD-2026-BBBBBB", "pending_deletion")
  );
} catch (e) {
  blocked = e instanceof Error && e.message === EMAIL_PENDING_DELETION_MESSAGE;
}
assert.equal(blocked, true);

// deleted index allows reuse
const reuse = evaluateBusinessEmailLink(
  baseUser(),
  "other@example.com",
  indexFor("user-b", "VYD-2026-BBBBBB", "deleted")
);
assert.equal(reuse.kind, "link");

console.log("emailLink.test.ts: all assertions passed");

// Registry stomp regression: index commit + user save must be atomic (see mock.ts updateProfile).
console.log("emailLink.test.ts: registry atomicity documented");
