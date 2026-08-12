import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  applyReviewEditPatch,
  parseReviewEditTarget,
  reviewEditAllowsPinLookup,
  reviewEditEnterHref,
  reviewEditReturnsToHref,
  resolveContactVerificationState,
  shouldAdvanceToLocationAfterDetailsSave,
  type ReviewDraftSlice,
} from "@/auth-v2/reviewEditIntent";

const base: ReviewDraftSlice = {
  displayName: "Ada",
  businessName: "Ada Co",
  constitution: "Proprietorship",
  gstin: "29ABCDE1234F1Z5",
  pinCode: "110092",
  confirmedLocality: "Patparganj",
  confirmedDistrict: "East Delhi",
  confirmedState: "Delhi",
  logoPreviewUri: "file://logo.png",
  phoneE164: "+919876543210",
  email: "a@b.co",
};

assert.equal(parseReviewEditTarget("identity"), "identity");
assert.equal(parseReviewEditTarget("nope"), null);

assert.equal(reviewEditAllowsPinLookup("identity"), false);
assert.equal(reviewEditAllowsPinLookup("media"), false);
assert.equal(reviewEditAllowsPinLookup("contacts"), false);
assert.equal(reviewEditAllowsPinLookup("gstin"), false);
assert.equal(reviewEditAllowsPinLookup("constitution"), false);
assert.equal(reviewEditAllowsPinLookup("location"), true);

assert.equal(
  shouldAdvanceToLocationAfterDetailsSave({ reviewEditTarget: "identity" }),
  false
);
assert.equal(
  shouldAdvanceToLocationAfterDetailsSave({ reviewEditTarget: "constitution" }),
  false
);
assert.equal(
  shouldAdvanceToLocationAfterDetailsSave({ reviewEditTarget: null }),
  true
);

// Preserve unrelated fields on each targeted edit
const afterIdentity = applyReviewEditPatch(base, "identity", {
  displayName: "Ada Lovelace",
  businessName: "New Co",
});
assert.equal(afterIdentity.displayName, "Ada Lovelace");
assert.equal(afterIdentity.pinCode, "110092");
assert.equal(afterIdentity.confirmedLocality, "Patparganj");
assert.equal(afterIdentity.gstin, base.gstin);
assert.equal(afterIdentity.constitution, base.constitution);
assert.equal(afterIdentity.logoPreviewUri, base.logoPreviewUri);
assert.equal(afterIdentity.phoneE164, base.phoneE164);

const afterLogo = applyReviewEditPatch(base, "media", { logoPreviewUri: "file://x.png" });
assert.equal(afterLogo.logoPreviewUri, "file://x.png");
assert.equal(afterLogo.pinCode, "110092");
assert.equal(afterLogo.displayName, "Ada");

const afterConstitution = applyReviewEditPatch(base, "constitution", {
  constitution: "Private Limited Company",
});
assert.equal(afterConstitution.constitution, "Private Limited Company");
assert.equal(afterConstitution.pinCode, "110092");
assert.equal(afterConstitution.confirmedLocality, "Patparganj");

const afterGstin = applyReviewEditPatch(base, "gstin", { gstin: "" });
assert.equal(afterGstin.gstin, "");
assert.equal(afterGstin.pinCode, "110092");

const afterContacts = applyReviewEditPatch(base, "contacts", {
  phoneE164: "+919999999999",
  email: "new@b.co",
});
assert.equal(afterContacts.phoneE164, "+919999999999");
assert.equal(afterContacts.pinCode, "110092");
assert.equal(afterContacts.displayName, "Ada");

const afterPin = applyReviewEditPatch(base, "location", {
  pinCode: "201016",
  confirmedLocality: "Crossing Republik",
  confirmedDistrict: "Ghaziabad",
  confirmedState: "Uttar Pradesh",
});
assert.equal(afterPin.pinCode, "201016");
assert.equal(afterPin.confirmedLocality, "Crossing Republik");
assert.equal(afterPin.displayName, "Ada");
assert.equal(afterPin.gstin, base.gstin);

// Contact verification: typing alone does not verify; cancel keeps old
const pending = resolveContactVerificationState({
  currentVerified: "+919876543210",
  pendingInput: "+919999999999",
  verificationSucceededFor: null,
});
assert.equal(pending.authoritative, "+919876543210");
assert.equal(pending.pending, "+919999999999");
assert.equal(pending.verified, false);

const cancelled = resolveContactVerificationState({
  currentVerified: "+919876543210",
  pendingInput: "+919999999999",
  verificationSucceededFor: null,
});
assert.equal(cancelled.authoritative, "+919876543210");

const succeeded = resolveContactVerificationState({
  currentVerified: "+919876543210",
  pendingInput: "+919999999999",
  verificationSucceededFor: "+919999999999",
});
assert.equal(succeeded.authoritative, "+919999999999");
assert.equal(succeeded.verified, true);

const unchanged = resolveContactVerificationState({
  currentVerified: "a@b.co",
  pendingInput: "a@b.co",
  verificationSucceededFor: null,
});
assert.equal(unchanged.pending, null);
assert.equal(unchanged.verified, true);

assert.deepEqual(reviewEditEnterHref("media"), {
  pathname: "/(auth)/complete-profile",
  params: { section: "media", intent: "review" },
});
assert.equal(reviewEditReturnsToHref(), "/(auth)/profile-review");

const reviewScreen = readFileSync(
  join(__dirname, "screens/ProfileReviewScreen.tsx"),
  "utf8"
);
assert.match(reviewScreen, /router\.push\(\{/);
assert.match(reviewScreen, /params: \{ section, intent: "review" \}/);
const editor = readFileSync(
  join(__dirname, "screens/ReviewSectionEditorScreen.tsx"),
  "utf8"
);
assert.match(editor, /router\.canGoBack\(\)/);
assert.match(editor, /router\.back\(\)/);

const shell = readFileSync(join(__dirname, "components/AuthShell.tsx"), "utf8");
assert.match(shell, /hardwareBackPress/);

console.log("reviewEditIntent.test.ts: ok");
