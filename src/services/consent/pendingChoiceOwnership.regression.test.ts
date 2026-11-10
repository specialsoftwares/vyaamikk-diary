import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { __setNativeSecureRandomForTests } from "@/services/accountDeletion/nativeSecureRandom";
import { clearPendingConsentIfUnchanged, loadPendingConsentValue, savePendingConsentValue } from "./pendingConsentKey";

async function main() {
  __setNativeSecureRandomForTests((length) => new Uint8Array(randomBytes(length)));
  const data = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => data.get(key) ?? null,
    setItem: async (key: string, value: string) => { data.set(key, value); },
    removeItem: async (key: string) => { data.delete(key); },
  };
  const choice = JSON.stringify({ phoneE164: "+910000000001", record: {
    consentVersion: "v1", termsVersion: "v1", privacyVersion: "v1", effectiveDate: "2026-01-01",
    acceptedAt: 1, sourceScreen: "phone_confirm", appVersion: "1", platform: "android",
  } });
  await savePendingConsentValue(storage, choice);
  const first = await loadPendingConsentValue(storage);
  await savePendingConsentValue(storage, choice);
  assert.equal(await clearPendingConsentIfUnchanged(storage, first), false,
    "an old acknowledgement must not delete an otherwise identical newer choice");
  assert.ok(await loadPendingConsentValue(storage));
  console.log("pendingChoiceOwnership.regression.test.ts: ok");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
