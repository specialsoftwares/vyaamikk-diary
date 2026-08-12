/**
 * Mutation Propagation Contract — Review round-trip suite.
 *
 * Regression: verified contact mutation must propagate back to profile review.
 * Also covers identity / logo / location / GSTIN / constitution + lost-update journeys.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  assertContactPropagated,
  mergeVerifiedContactsIntoReviewModel,
  reviewContactsFromAuthoritativeProfile,
} from "@/auth-v2/reviewMutationPropagation";
import type { UserProfile } from "@/domain/types";
import { maskMobile } from "@/utils/phone";

import {
  applyHarnessReviewSessionPatch,
  commitVerifiedEmail,
  commitVerifiedMobile,
  createInitialHarnessReviewSession,
  narrowHarnessEditorPatch,
} from "../../tools/onboarding-ux-harness/src/harnessReviewSession";

const ROOT = join(__dirname, "../..");

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "u1",
    ueid: "VD-1",
    phoneE164: "+919876543210",
    businessEmail: "owner@example.com",
    normalizedEmail: "owner@example.com",
    ...overrides,
  } as UserProfile;
}

// --- Unit: merge / assert helpers ---

{
  const model = {
    phoneE164: "+919876543210",
    email: "c@example.com",
    emailVerified: true,
    displayName: "Shivam A",
  };
  const next = mergeVerifiedContactsIntoReviewModel(model, {
    phoneE164: "+919999999999",
    email: "d@example.com",
    emailVerified: true,
  });
  assert.equal(next.phoneE164, "+919999999999");
  assert.equal(next.email, "d@example.com");
  assert.equal(next.displayName, "Shivam A");
  assert.equal(maskMobile(next.phoneE164).includes("9999"), true);
  assert.equal(maskMobile(next.phoneE164).includes("3210"), false);
}

{
  const contacts = reviewContactsFromAuthoritativeProfile(
    profile({ phoneE164: "+911112223333", normalizedEmail: "d@x.co" }),
    true
  );
  assert.equal(contacts.phoneE164, "+911112223333");
  assert.equal(contacts.email, "d@x.co");
  assert.equal(contacts.emailVerified, true);
}

assert.equal(
  assertContactPropagated({
    expectedPhoneE164: "+91B",
    centralPhoneE164: "+91B",
    centralEmail: "c",
  }),
  true
);
assert.equal(
  assertContactPropagated({
    expectedPhoneE164: "+91B",
    centralPhoneE164: "+91A",
    centralEmail: "c",
  }),
  false,
  "stale central phone must fail propagation assert"
);

// --- Harness session: mobile A→B propagates to Review model ---

{
  let session = createInitialHarnessReviewSession({
    phoneE164: "+919876543210",
    email: "c@example.com",
  });
  const A = session.phoneE164;
  const B = "+919888877776";
  // Simulate: bind success → commit central session BEFORE return
  session = commitVerifiedMobile(session, B);
  assert.equal(session.phoneE164, B);
  assert.notEqual(session.phoneE164, A);
  assert.equal(session.email, "c@example.com", "email preserved");
  assert.equal(session.displayName, "Shivam A", "uid-adjacent fields preserved");
}

// --- Email C→D ---

{
  let session = createInitialHarnessReviewSession({
    phoneE164: "+919876543210",
    email: "c@example.com",
  });
  session = commitVerifiedEmail(session, "d@example.com");
  assert.equal(session.email, "d@example.com");
  assert.equal(session.phoneE164, "+919876543210");
}

// --- Failure / cancel: pending must not leak ---

{
  const session = createInitialHarnessReviewSession({
    phoneE164: "+919876543210",
    email: "c@example.com",
  });
  // OTP failure path: no commitVerified* call
  const pendingB = "+919888877776";
  void pendingB;
  assert.equal(session.phoneE164, "+919876543210");
  assert.equal(session.email, "c@example.com");
}

// --- Identity / logo / location / GSTIN / constitution round-trips ---

{
  let session = createInitialHarnessReviewSession();
  session = applyHarnessReviewSessionPatch(
    session,
    narrowHarnessEditorPatch("identity", {
      displayName: "Shivam B",
      businessName: "Beta Practice",
      phoneE164: "+91SHOULD_NOT_APPLY",
    })
  );
  assert.equal(session.displayName, "Shivam B");
  assert.equal(session.businessName, "Beta Practice");
  assert.equal(session.phoneE164, "+919876543210", "narrow identity patch must not clobber phone");
}

{
  let session = createInitialHarnessReviewSession({ logoUri: null });
  session = applyHarnessReviewSessionPatch(
    session,
    narrowHarnessEditorPatch("media", { logoUri: "file://logo-new.png" })
  );
  assert.equal(session.logoUri, "file://logo-new.png");
  session = applyHarnessReviewSessionPatch(
    session,
    narrowHarnessEditorPatch("media", { logoUri: null })
  );
  assert.equal(session.logoUri, null);
}

{
  let session = createInitialHarnessReviewSession();
  session = applyHarnessReviewSessionPatch(
    session,
    narrowHarnessEditorPatch("location", {
      pinCode: "560001",
      confirmedPin: { locality: "MG Road", district: "Bengaluru", state: "Karnataka" },
    })
  );
  assert.equal(session.pinCode, "560001");
  assert.equal(session.confirmedPin?.district, "Bengaluru");
}

{
  let session = createInitialHarnessReviewSession();
  session = applyHarnessReviewSessionPatch(
    session,
    narrowHarnessEditorPatch("gstin", { gstin: "", gstinState: "notProvided" })
  );
  assert.equal(session.gstin, "");
  assert.equal(session.gstinState, "notProvided");
}

{
  let session = createInitialHarnessReviewSession();
  session = applyHarnessReviewSessionPatch(
    session,
    narrowHarnessEditorPatch("constitution", { constitution: "Partnership" })
  );
  assert.equal(session.constitution, "Partnership");
}

// --- Multi-editor lost-update journey ---

{
  let session = createInitialHarnessReviewSession({
    displayName: "A",
    phoneE164: "P1",
    email: "E1",
    gstin: "G1",
    constitution: "C1",
  });
  session = commitVerifiedMobile(session, "P2");
  session = commitVerifiedEmail(session, "E2");
  session = applyHarnessReviewSessionPatch(
    session,
    narrowHarnessEditorPatch("identity", { displayName: "B", businessName: session.businessName })
  );
  session = applyHarnessReviewSessionPatch(
    session,
    narrowHarnessEditorPatch("gstin", { gstin: "G2", gstinState: "formatValid" })
  );
  session = applyHarnessReviewSessionPatch(
    session,
    narrowHarnessEditorPatch("constitution", { constitution: "C2" })
  );
  assert.equal(session.displayName, "B");
  assert.equal(session.phoneE164, "P2");
  assert.equal(session.email, "E2");
  assert.equal(session.gstin, "G2");
  assert.equal(session.constitution, "C2");
}

// --- Order independence ---

{
  let session = createInitialHarnessReviewSession({
    logoUri: null,
    phoneE164: "P1",
    constitution: "C1",
  });
  session = applyHarnessReviewSessionPatch(
    session,
    narrowHarnessEditorPatch("media", { logoUri: "file://a.png" })
  );
  session = commitVerifiedMobile(session, "P2");
  session = applyHarnessReviewSessionPatch(
    session,
    narrowHarnessEditorPatch("constitution", { constitution: "C2" })
  );
  assert.equal(session.logoUri, "file://a.png");
  assert.equal(session.phoneE164, "P2");
  assert.equal(session.constitution, "C2");
}

// --- Source contracts: harness must reconcile phone/email; must not navigate on bind ---

{
  const harnessApp = readSrc("tools/onboarding-ux-harness/src/HarnessApp.tsx");
  assert.match(
    harnessApp,
    /patch\.phoneE164/,
    "HarnessApp must apply phoneE164 from session patches"
  );
  assert.match(
    harnessApp,
    /patch\.email/,
    "HarnessApp must apply email from session patches"
  );
  assert.match(
    harnessApp,
    /onCommit=\{/,
    "HarnessApp must expose onCommit for bind-without-navigate"
  );

  const preview = readSrc("tools/onboarding-ux-harness/src/ReviewSectionEditPreview.tsx");
  assert.match(
    preview,
    /onAuthoritativePhone: \(profile\) => \{[\s\S]*?onCommit\?\.\(\{\s*phoneE164/,
    "phone bind must commit via onCommit, not onSave navigate"
  );
  assert.match(
    preview,
    /onAuthoritativeEmail: \(profile\) => \{[\s\S]*?onCommit\?\.\(\{\s*email/,
    "email bind must commit via onCommit"
  );
  const phoneAuthHandler = preview.match(
    /onAuthoritativePhone: \(profile\) => \{[\s\S]*?\n    \},/
  )?.[0];
  assert.ok(phoneAuthHandler, "onAuthoritativePhone handler present");
  assert.equal(
    /onSave\(/.test(phoneAuthHandler!),
    false,
    "regression: onAuthoritativePhone must not call onSave (navigates early + was ignored)"
  );

  const panel = readSrc("src/auth-v2/contactChange/VerifiedContactChangePanel.tsx");
  assert.match(
    panel,
    /await adapters\.onAuthoritativePhone/,
    "panel must await central reconcile before success"
  );
  assert.match(
    panel,
    /await adapters\.onAuthoritativeEmail/,
    "panel must await email reconcile before success"
  );

  const editor = readSrc("src/auth-v2/screens/ReviewSectionEditorScreen.tsx");
  assert.match(
    editor,
    /onAuthoritativePhone:\s*async/,
    "production onAuthoritativePhone must be awaited reconcile"
  );
  assert.match(
    editor,
    /applyServerProfile\(profile\)/,
    "production contact success must update auth session via applyServerProfile"
  );

  const reviewScreen = readSrc("src/auth-v2/screens/ProfileReviewScreen.tsx");
  assert.match(
    reviewScreen,
    /phoneE164:\s*user\.phoneE164/,
    "Review must render mobile from live auth user, not a frozen draft copy"
  );
  assert.match(
    reviewScreen,
    /user\.normalizedEmail\s*\?\?\s*user\.businessEmail/,
    "Review must render email from live auth user"
  );
}

console.log("reviewMutationPropagation.contract.test.ts: ok");
