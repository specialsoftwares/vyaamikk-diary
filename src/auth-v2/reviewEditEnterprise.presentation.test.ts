import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  REVIEW_CONTACTS_SECURITY_NOTE,
  REVIEW_EMAIL_CHANGE_AVAILABLE,
  REVIEW_LOGO_USAGE_POINTS,
  REVIEW_PHONE_CHANGE_AVAILABLE,
  REVIEW_SECTION_ACTION_LABELS,
  REVIEW_SECTION_TITLES,
  reviewEditCopy,
} from "@/auth-v2/reviewEditCopy";
import { resolveContactVerificationState } from "@/auth-v2/reviewEditIntent";

const root = join(__dirname, "../..");

const FORBIDDEN = [
  "Preview only",
  "No production write",
  "Simulate choose logo",
  "Simulate",
  "Fixture",
  "UX harness",
  "example.com",
  "Clear logo",
  "Edit media",
  "REVIEW EDIT",
  "Review edit",
  "Changing a verified contact is not available from this Review step.",
];

function assertClean(pathFromRoot: string) {
  const src = readFileSync(join(root, pathFromRoot), "utf8");
  for (const bad of FORBIDDEN) {
    if (pathFromRoot.includes("reviewEditCopy") && bad === "Review edit") continue;
    assert.equal(
      src.includes(`"${bad}"`) || src.includes(`'${bad}'`) || src.includes(`\`${bad}\``),
      false,
      `${pathFromRoot} must not expose user-facing "${bad}"`
    );
  }
  assert.equal(src.includes(">Review edit<"), false, `${pathFromRoot} Review edit label`);
  assert.equal(src.includes("Preview only"), false, `${pathFromRoot} Preview only`);
  assert.equal(src.includes("Simulate choose logo"), false, `${pathFromRoot} Simulate`);
}

assertClean("src/auth-v2/screens/reviewEdit/ReviewEditSectionViews.tsx");
assertClean("src/auth-v2/components/ReviewEditShell.tsx");
assertClean("src/auth-v2/reviewEditCopy.ts");
assertClean("src/auth-v2/screens/ReviewSectionEditorScreen.tsx");
assertClean("src/auth-v2/screens/ProfileReviewPresentation.tsx");
assertClean("src/auth-v2/contactChange/VerifiedContactChangePanel.tsx");

const harnessPreview = readFileSync(
  join(root, "tools/onboarding-ux-harness/src/ReviewSectionEditPreview.tsx"),
  "utf8"
);
assert.equal(harnessPreview.includes("Simulate choose logo"), false);
assert.equal(harnessPreview.includes("Preview only"), false);
assert.equal(harnessPreview.includes("Choose logo"), true);
assert.equal(harnessPreview.includes("ReviewEditShell"), true);
assert.equal(harnessPreview.includes("VerifiedContactChangePanel"), true);
assert.equal(harnessPreview.includes("onSimulateContactVerified"), false);

assert.equal(REVIEW_PHONE_CHANGE_AVAILABLE, true);
assert.equal(REVIEW_EMAIL_CHANGE_AVAILABLE, true);

const nativeContact = readFileSync(
  join(root, "src/services/auth/nativePhoneContactChange.ts"),
  "utf8"
);
assert.equal(nativeContact.includes("verifyPhoneNumber"), true);
assert.equal(nativeContact.includes("updatePhoneNumber"), true);
assert.equal(nativeContact.includes(".signInWithPhoneNumber("), false);

const firebaseAdapter = readFileSync(join(root, "src/services/auth/firebase.ts"), "utf8");
assert.equal(firebaseAdapter.includes("startNativePhoneContactChangeOtp"), true);
assert.equal(
  firebaseAdapter.includes("Mobile number change is support/admin-only"),
  false
);

assert.ok(REVIEW_LOGO_USAGE_POINTS.length >= 3);
assert.ok(REVIEW_CONTACTS_SECURITY_NOTE.includes("verification"));
assert.equal(REVIEW_SECTION_ACTION_LABELS.contacts.action, "Change");

assert.equal(REVIEW_SECTION_TITLES.media, "Business / practice logo");
assert.equal(REVIEW_SECTION_TITLES.contacts, "Verified contacts");
assert.equal(REVIEW_SECTION_TITLES.constitution, "Business / practice type");
assert.equal(reviewEditCopy("media").title, "Business / practice logo");
assert.equal(reviewEditCopy("contacts").primaryCta, "Done");
assert.equal(reviewEditCopy("identity").primaryCta, "Save changes");
assert.equal(reviewEditCopy("location").primaryCta, "Continue");

const logoView = readFileSync(
  join(root, "src/auth-v2/screens/reviewEdit/ReviewEditSectionViews.tsx"),
  "utf8"
);
assert.equal(logoView.includes("Where your logo appears"), true);
assert.equal(logoView.includes("How your logo is used"), false);

const presentation = readFileSync(
  join(root, "src/auth-v2/screens/ProfileReviewPresentation.tsx"),
  "utf8"
);
assert.equal(presentation.includes("AuthCardActionAffordance"), true);
assert.equal(presentation.includes("REVIEW_SECTION_ACTION_LABELS"), true);
assert.equal(presentation.includes("accessibilityLabel"), true);

const secondaryChip = readFileSync(
  join(root, "src/auth-v2/components/AuthSecondaryActiveChip.tsx"),
  "utf8"
);
assert.equal(secondaryChip.includes("ACTION_MIN_TARGET_DP"), true);
assert.equal(secondaryChip.includes("resolveAuthSecondaryActiveAppearance"), true);

const authShell = readFileSync(join(root, "src/auth-v2/components/AuthShell.tsx"), "utf8");
assert.equal(authShell.includes("paddingBottom"), true);
assert.equal(authShell.includes("112"), true);

const pending = resolveContactVerificationState({
  currentVerified: "+919876543210",
  pendingInput: "+919999999999",
  verificationSucceededFor: null,
});
assert.equal(pending.authoritative, "+919876543210");
assert.equal(pending.verified, false);

const callable = readFileSync(
  join(root, "functions/src/identity/confirmVerifiedMobileChange.ts"),
  "utf8"
);
assert.equal(callable.includes("confirmVerifiedMobileContactChange"), true);
assert.equal(callable.includes("UEID unchanged") || callable.includes("ueid"), true);

console.log("reviewEditEnterprise.presentation.test.ts: ok");
