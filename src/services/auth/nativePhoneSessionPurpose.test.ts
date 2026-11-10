/** The production login restore must not adopt an account-contact challenge. */
import assert from "node:assert/strict";
import { restorePendingPhoneSessionForResume, __clearNativePhoneSessions } from "./nativePhoneAuth";
import { clearNativePhoneAuthSession, saveNativePhoneAuthSession } from "./nativePhoneAuthSession";

async function main() {
  __clearNativePhoneSessions(); await clearNativePhoneAuthSession();
  await saveNativePhoneAuthSession({
    firebaseVerificationId: "contact-fixture", phoneE164: "+919800000053",
    expiresAt: Date.now() + 60_000, attemptId: "contact-attempt",
    purpose: "contact_change", expectedUid: "contact-owner",
  });
  assert.equal(await restorePendingPhoneSessionForResume("contact-fixture", "+919800000053"), false,
    "a verified-contact challenge cannot become a login challenge");
  await clearNativePhoneAuthSession();
  console.log("nativePhoneSessionPurpose.test.ts: ok");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
