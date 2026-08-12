import assert from "node:assert/strict";

import {
  clearPendingMobileContactChange,
  loadPendingMobileContactChange,
  resetPendingMobileContactChangeForTests,
  savePendingMobileContactChange,
  shouldRetryServerMobileBind,
} from "@/services/auth/pendingMobileContactChange";

async function main() {
  resetPendingMobileContactChangeForTests();
  await clearPendingMobileContactChange();

  assert.equal(await loadPendingMobileContactChange(), null);

  await savePendingMobileContactChange({
    uid: "u1",
    oldPhoneE164: "+919111111111",
    newPhoneE164: "+919222222222",
    operationId: "op-9",
    authUpdatedAt: 1,
    purpose: "contact_change",
  });
  const loaded = await loadPendingMobileContactChange();
  assert.ok(loaded);
  assert.equal(loaded?.uid, "u1");
  assert.equal(loaded?.newPhoneE164, "+919222222222");
  assert.equal(loaded?.purpose, "contact_change");

  await clearPendingMobileContactChange();
  assert.equal(await loadPendingMobileContactChange(), null);

  assert.equal(
    shouldRetryServerMobileBind({
      uid: "u1",
      authPhoneE164: "+919222222222",
      profilePhoneE164: "+919222222222",
      pending: loaded,
    }).retry,
    false
  );

  console.log("pendingMobileContactChange.test.ts: ok");
}

void main();
