import assert from "node:assert/strict";

import {
  assessPhoneProof,
  phoneProofId,
  type PhoneProofClaims,
} from "./phoneFactorProof";

const NOW = 1_700_000_000_000;
const PROJECT = "vyaamikk-diary";
const ACCOUNT = "account-uid";
const CURRENT = "+919800000001";
const REPLACEMENT = "+919800000002";

function claims(patch: Partial<PhoneProofClaims> = {}): PhoneProofClaims {
  return {
    uid: ACCOUNT,
    phoneNumber: CURRENT,
    authTimeSeconds: Math.floor(NOW / 1000) - 30,
    signInProvider: "phone",
    projectId: PROJECT,
    ...patch,
  };
}

function decide(
  purpose: "current_phone_reauth" | "replacement_phone",
  next: Partial<PhoneProofClaims> | null,
  extra: { expected?: string; consumed?: boolean; nowMs?: number } = {}
) {
  return assessPhoneProof({
    claims: next === null ? null : claims(next),
    purpose,
    accountUid: ACCOUNT,
    expectedPhoneE164: extra.expected ?? (purpose === "replacement_phone" ? REPLACEMENT : CURRENT),
    nowMs: extra.nowMs ?? NOW,
    projectId: PROJECT,
    alreadyConsumed: extra.consumed === true,
  });
}

{
  assert.equal(decide("current_phone_reauth", {}).ok, true);
  const first = decide("current_phone_reauth", {});
  const retry = decide("current_phone_reauth", { authTimeSeconds: Math.floor(NOW / 1000) - 10 });
  assert.equal(first.ok && retry.ok, true);
  if (first.ok && retry.ok) assert.notEqual(first.proofId, retry.proofId);
}

assert.equal(decide("current_phone_reauth", null).ok, false);
assert.equal(decide("current_phone_reauth", null).reason, "forged");
assert.equal(decide("current_phone_reauth", { phoneNumber: null, authTimeSeconds: null }).reason, "forged");
assert.equal(decide("current_phone_reauth", { signInProvider: "custom" }).reason, "not_phone");
assert.equal(decide("current_phone_reauth", { projectId: "other-project" }).reason, "wrong_project");
assert.equal(decide("current_phone_reauth", { phoneNumber: REPLACEMENT }).reason, "wrong_phone");
assert.equal(decide("current_phone_reauth", { uid: "other-account" }).reason, "wrong_account");
assert.equal(
  decide("current_phone_reauth", {}, { nowMs: NOW + 6 * 60 * 1000 }).reason,
  "expired"
);
assert.equal(decide("current_phone_reauth", {}, { consumed: true }).reason, "replay");

{
  const replacement = decide("replacement_phone", {
    uid: "new-phone-user",
    phoneNumber: REPLACEMENT,
  });
  assert.equal(replacement.ok, true, "replacement proof may be a different Auth user");
  assert.equal(
    decide("replacement_phone", { phoneNumber: CURRENT }, { expected: REPLACEMENT }).reason,
    "wrong_phone"
  );
  assert.equal(
    decide("replacement_phone", { uid: ACCOUNT, phoneNumber: CURRENT }, { expected: REPLACEMENT }).reason,
    "wrong_phone"
  );
}

{
  const fresh = claims({ phoneNumber: REPLACEMENT, uid: "new-phone-user" });
  const id = phoneProofId({
    projectId: PROJECT,
    authUid: fresh.uid,
    phoneE164: REPLACEMENT,
    authTimeSeconds: fresh.authTimeSeconds!,
    purpose: "replacement_phone",
  });
  const again = assessPhoneProof({
    claims: fresh,
    purpose: "replacement_phone",
    accountUid: ACCOUNT,
    expectedPhoneE164: REPLACEMENT,
    nowMs: NOW,
    projectId: PROJECT,
    alreadyConsumed: true,
  });
  assert.equal(again.ok, false);
  assert.equal(again.reason, "replay");
  assert.equal(
    phoneProofId({
      projectId: PROJECT,
      authUid: fresh.uid,
      phoneE164: REPLACEMENT,
      authTimeSeconds: fresh.authTimeSeconds!,
      purpose: "replacement_phone",
    }),
    id
  );
}

console.log("phoneFactorProof.unit.test.ts: ok");
