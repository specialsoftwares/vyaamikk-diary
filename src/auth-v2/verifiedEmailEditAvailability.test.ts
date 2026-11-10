import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canUseOrdinaryEmailBinding, VERIFIED_EMAIL_CHANGE_SUPPORT_MESSAGE } from "./verifiedEmailEditAvailability";

// Same capability used by Review, Settings and the auth wrapper. Initial binding
// stays available; verified replacement cannot be offered through ordinary bind.
for (const emailStatus of [undefined, null, "unverified", "verification_pending"]) {
  assert.equal(canUseOrdinaryEmailBinding({ emailStatus }), true);
}
assert.equal(canUseOrdinaryEmailBinding({ emailStatus: "verified" }), false);
assert.match(VERIFIED_EMAIL_CHANGE_SUPPORT_MESSAGE, /not available in this version/);
assert.match(VERIFIED_EMAIL_CHANGE_SUPPORT_MESSAGE, /current email stays linked/);

const review = readFileSync("src/auth-v2/screens/ReviewSectionEditorScreen.tsx", "utf8");
const settings = readFileSync("app/(app)/settings/identity.tsx", "utf8");
const panel = readFileSync("src/auth-v2/contactChange/VerifiedContactChangePanel.tsx", "utf8");
assert.match(review, /emailChangeAvailable=\{REVIEW_EMAIL_CHANGE_AVAILABLE && canUseOrdinaryEmailBinding\(user\)\}/);
assert.match(review, /emailChangeUnavailableMessage=.*VERIFIED_EMAIL_CHANGE_SUPPORT_MESSAGE/);
assert.match(settings, /if \(emailChanged && !canUseOrdinaryEmailBinding\(user\)\)/);
assert.match(settings, /emailLocked = verifiedEmailReadOnly \|\|/);
assert.match(settings, /emailUnavailableMessage=.*VERIFIED_EMAIL_CHANGE_SUPPORT_MESSAGE/);
assert.match(panel, /const sendEmailOtp = async \(\) => \{\s*if \(!emailChangeAvailable\)/);
console.log("verifiedEmailEditAvailability.test.ts: ok");
