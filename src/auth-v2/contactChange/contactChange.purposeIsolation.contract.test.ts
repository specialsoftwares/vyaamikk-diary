import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CONTACT_CHANGE_MOBILE_COLLISION_MESSAGE,
  CONTACT_CHANGE_PURPOSE,
  CONTACT_CHANGE_SAME_MOBILE_MESSAGE,
} from "@/auth-v2/contactChange/contactChangeModel";
import { NATIVE_CONTACT_CHANGE_PURPOSE } from "@/services/auth/nativePhoneContactChange";

const root = join(__dirname, "../../..");

assert.equal(CONTACT_CHANGE_PURPOSE, "contact_change");
assert.equal(NATIVE_CONTACT_CHANGE_PURPOSE, "contact_change");
assert.match(CONTACT_CHANGE_SAME_MOBILE_MESSAGE, /already your verified/i);
assert.match(CONTACT_CHANGE_MOBILE_COLLISION_MESSAGE, /cannot be used for this account/i);
assert.equal(CONTACT_CHANGE_MOBILE_COLLISION_MESSAGE.includes("UEID"), false);
assert.equal(CONTACT_CHANGE_MOBILE_COLLISION_MESSAGE.includes("already linked"), false);

/** Panel must reuse trusted auth presentation, not invent login resolver. */
{
  const panel = readFileSync(
    join(root, "src/auth-v2/contactChange/VerifiedContactChangePanel.tsx"),
    "utf8"
  );
  assert.ok(panel.includes("AuthShell"));
  assert.ok(panel.includes("OtpVerificationScreen"));
  assert.ok(panel.includes("VerificationSuccessAck"));
  assert.ok(panel.includes("Vyaamikk is verifying"));
  assert.ok(panel.includes("Mobile number verified"));
  assert.ok(panel.includes("Verify your new mobile number"));
  assert.equal(panel.includes("resolveOrCreateUserByPhone"), false);
  assert.equal(panel.includes("signInWithPhoneNumber"), false);
  assert.ok(panel.includes("CONTACT_CHANGE_PURPOSE") || panel.includes("contact_change"));
}

/** Facade must not call account creation resolver. */
{
  const facade = readFileSync(join(root, "src/services/auth/verifiedContactChange.ts"), "utf8");
  assert.equal(facade.includes("callResolveOrCreateUserByPhone"), false);
  assert.equal(facade.includes("resolveOrCreateUserByPhone"), false);
  assert.ok(facade.includes("startMobileChange"));
  assert.ok(facade.includes("confirmMobileChange"));
}

/** Server collision copy must stay privacy-safe. */
{
  const server = readFileSync(
    join(root, "functions/src/identity/confirmVerifiedMobileChange.ts"),
    "utf8"
  );
  assert.ok(server.includes(CONTACT_CHANGE_MOBILE_COLLISION_MESSAGE));
  assert.equal(server.includes("already linked to a Vyaamikk account"), false);
}

/** Harness adapters must not write Firebase / call login resolver. */
{
  const harness = readFileSync(
    join(root, "tools/onboarding-ux-harness/src/ReviewSectionEditPreview.tsx"),
    "utf8"
  );
  assert.ok(harness.includes("VerifiedContactChangePanel"));
  assert.ok(harness.includes("LOCAL_MOCK_DETERMINISTIC_MOBILE_OTP"));
  assert.ok(harness.includes("cannot be used for this account"));
  assert.equal(harness.includes("callResolveOrCreateUserByPhone"), false);
  assert.equal(harness.includes("signInWithPhoneNumber"), false);
}

console.log("contactChange.purposeIsolation.contract.test.ts: ok");
