/**
 * Firestore-emulator proof of VYD-33 App Store account indexes and
 * validateAndActivateIOS ledger writes.
 *
 * Run: npm run test:billing-apple-emulator
 */
import assert from "node:assert/strict";

import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { AutoRenewStatus, Status, TransactionReason } from "@apple/app-store-server-library";

import { handlePrepareIOSBillingAccount } from "../callables/prepareIOSBillingAccount";
import { handleValidateAndActivateIOS } from "../callables/validateAndActivateIOS";
import { diagnosticUidHmac } from "../diagnosticUid";
import { BillingError } from "../errors";
import { FirestoreBillingStore } from "../firestoreBillingStore";
import {
  appStoreAccountByUidPath,
  appStoreAccountIndexPath,
  financialLedgerPath,
  sanitizeDocId,
} from "../paths";
import type { AppleSubscriptionApi } from "./appleApiClient";
import { type IosBillingDeps } from "./appleSubscriptionAdapter";
import {
  renewalPayload,
  signAppleJws,
  statusResponseFor,
  TEST_NOW_MS,
  transactionPayload,
  vyaamikkSandboxVerifier,
} from "./appleTestJws";

const UID = "emu-uid-ios-33";
const OTHER = "emu-uid-ios-33-other";
const DIAG_SECRET = "billing-diag-uid-secret-emulator-ios-0123456789";

class FakeApple implements AppleSubscriptionApi {
  constructor(private statuses: Awaited<ReturnType<AppleSubscriptionApi["getAllSubscriptionStatuses"]>>) {}
  async getAllSubscriptionStatuses() {
    return this.statuses;
  }
}

async function main() {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST required");
  if (getApps().length === 0) {
    initializeApp({ projectId: "demo-vyaamikk" });
  }
  const db = getFirestore();
  const store = new FirestoreBillingStore(db);

  const prepared = await handlePrepareIOSBillingAccount(store, UID, TEST_NOW_MS);
  const again = await handlePrepareIOSBillingAccount(store, UID, TEST_NOW_MS + 1_000);
  assert.equal(again.appAccountToken, prepared.appAccountToken);

  const byUid = await db.doc(appStoreAccountByUidPath(UID)).get();
  const index = await db.doc(appStoreAccountIndexPath(prepared.appAccountToken)).get();
  assert.equal(byUid.get("appAccountToken"), prepared.appAccountToken);
  assert.equal(index.get("uid"), UID);

  await db.doc(appStoreAccountByUidPath(OTHER)).set({
    appAccountToken: prepared.appAccountToken,
    createdAt: TEST_NOW_MS,
    updatedAt: TEST_NOW_MS,
  });
  try {
    await handlePrepareIOSBillingAccount(store, OTHER, TEST_NOW_MS + 2_000);
    assert.fail("expected collision");
  } catch (err) {
    assert.ok(err instanceof BillingError);
    assert.equal(err.causeCode, "ios_account_index_collision");
  }

  const tx = signAppleJws(
    transactionPayload({
      appAccountToken: prepared.appAccountToken,
      transactionReason: TransactionReason.PURCHASE,
    })
  );
  const renewal = signAppleJws(
    renewalPayload({
      appAccountToken: prepared.appAccountToken,
      autoRenewStatus: AutoRenewStatus.ON,
    })
  );
  const deps: IosBillingDeps = {
    store,
    verifier: vyaamikkSandboxVerifier(),
    api: new FakeApple(statusResponseFor(Status.ACTIVE, tx, renewal)),
    diagnosticUidFor: (uid) => diagnosticUidHmac(DIAG_SECRET, uid),
    nowMs: () => TEST_NOW_MS,
  };
  const result = await handleValidateAndActivateIOS(deps, {
    uid: UID,
    signedTransactionInfo: tx,
  });
  assert.equal(result.to?.billingStatus, "active");
  const sale = await db.doc(financialLedgerPath(sanitizeDocId("ios:purchase:2001"))).get();
  assert.equal(sale.get("grossAmountInPaise"), 24_900);
  assert.equal(sale.get("platform"), "ios");
  const company = await db.doc(`_companyBilling/${UID}`).get();
  assert.equal(JSON.stringify(company.data() ?? {}).includes("signedTransactionInfo"), false);

  for (const app of getApps()) {
    await deleteApp(app);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
