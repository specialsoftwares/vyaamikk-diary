/**
 * Firestore-emulator proof of VYD-32 Play ownership index, callable
 * atomicity, duplicate validation, and ledger idempotency.
 *
 * Run: npm run test:billing-google-play-emulator
 */
import assert from "node:assert/strict";

import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { handlePrepareAndroidBillingAccount } from "../callables/prepareAndroidBillingAccount";
import { handleValidateAndActivateAndroid } from "../callables/validateAndActivateAndroid";
import { InMemoryCredentialCipher } from "../crypto";
import { diagnosticUidHmac } from "../diagnosticUid";
import { BillingError } from "../errors";
import { FirestoreBillingStore } from "../firestoreBillingStore";
import { financialLedgerPath, playAccountIndexPath, playCredentialIndexPath, sanitizeDocId } from "../paths";
import type { PlayApi } from "./playApiClient";
import { obfuscatedAccountIdForUid } from "./playOwnership";
import type { GoogleOrder, GoogleSubscriptionPurchaseV2 } from "./playTypes";

const NOW = 1_760_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const UID = "emu-uid-play-32";
const OTHER = "emu-uid-play-32-other";
const TOKEN = "EMU_PLAY_TOKEN_SECRET_MATERIAL_VALUE";
const ORDER = "GPA.EMU-PLAY-32";
const DIAG_SECRET = "billing-diag-uid-secret-emulator-0123456789";

function rfc(ms: number): string {
  return new Date(ms).toISOString();
}

class FakePlay implements PlayApi {
  ackCalls = 0;
  constructor(
    private sub: GoogleSubscriptionPurchaseV2,
    private order: GoogleOrder
  ) {}
  async getSubscriptionV2(): Promise<GoogleSubscriptionPurchaseV2> {
    return JSON.parse(JSON.stringify(this.sub)) as GoogleSubscriptionPurchaseV2;
  }
  async getOrder(): Promise<GoogleOrder> {
    return JSON.parse(JSON.stringify(this.order)) as GoogleOrder;
  }
  async acknowledgeSubscription(): Promise<void> {
    this.ackCalls += 1;
  }
  async reviewRefund(): Promise<void> {}
}

async function main() {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST required");
  if (getApps().length === 0) {
    initializeApp({ projectId: "demo-vyaamikk" });
  }
  const db = getFirestore();
  const store = new FirestoreBillingStore(db);
  const cipher = new InMemoryCredentialCipher();
  const obfuscated = obfuscatedAccountIdForUid(UID);

  const prepared = await handlePrepareAndroidBillingAccount(store, UID, NOW);
  assert.equal(prepared.obfuscatedAccountId, obfuscated);
  const again = await handlePrepareAndroidBillingAccount(store, UID, NOW + 1_000);
  assert.equal(again.obfuscatedAccountId, obfuscated);

  await db.doc(playAccountIndexPath(obfuscatedAccountIdForUid(OTHER))).set({
    uid: UID,
    createdAt: NOW,
    updatedAt: NOW,
  });
  try {
    await handlePrepareAndroidBillingAccount(store, OTHER, NOW + 2_000);
    assert.fail("expected collision");
  } catch (err) {
    assert.ok(err instanceof BillingError);
    assert.equal(err.causeCode, "play_account_index_collision");
  }

  const play = new FakePlay(
    {
      subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
      acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
      etag: "etag-emu-active-1",
      lineItems: [
        {
          productId: "vyd_professional",
          expiryTime: rfc(NOW + 30 * DAY),
          latestSuccessfulOrderId: ORDER,
          autoRenewingPlan: { autoRenewEnabled: true },
          offerDetails: { basePlanId: "monthly" },
        },
      ],
      externalAccountIdentifiers: { obfuscatedExternalAccountId: obfuscated },
    },
    {
      orderId: ORDER,
      state: "PROCESSED",
      createTime: rfc(NOW),
      total: { currencyCode: "INR", units: "249", nanos: 0 },
      lineItems: [
        {
          productId: "vyd_professional",
          total: { currencyCode: "INR", units: "249", nanos: 0 },
          subscriptionDetails: { basePlanId: "monthly", servicePeriodStartTime: rfc(NOW) },
        },
      ],
      orderHistory: { processedEvent: { eventTime: rfc(NOW) } },
    }
  );

  const deps = {
    store,
    play,
    cipher,
    diagnosticUidFor: (uid: string) => diagnosticUidHmac(DIAG_SECRET, uid),
    nowMs: () => NOW + 2 * 60_000,
  };

  const first = await handleValidateAndActivateAndroid(deps, { uid: UID, purchaseToken: TOKEN });
  assert.equal(first.financialEventWritten, true);
  assert.equal(first.to?.entitlementActive, true);
  assert.equal(play.ackCalls, 1);

  const dup = await handleValidateAndActivateAndroid(deps, { uid: UID, purchaseToken: TOKEN });
  assert.equal(dup.financialEventWritten, false);
  assert.equal(dup.alreadyProcessed, true);
  assert.equal((await db.collection("_billingEventLedger").get()).size, 1);
  assert.ok(
    (await db.doc(financialLedgerPath(sanitizeDocId(`android:purchase:${ORDER}`))).get()).exists
  );

  const company = (await db.doc(`_companyBilling/${UID}`).get()).data();
  assert.ok(company);
  assert.equal(JSON.stringify(company).includes(TOKEN), false);
  assert.equal(company?.credentialFingerprint?.length, 64);
  const credSnap = await db.doc(playCredentialIndexPath(company.credentialFingerprint as string)).get();
  assert.equal(credSnap.exists, true);
  assert.equal(credSnap.data()?.uid, UID);
  assert.equal(JSON.stringify(credSnap.data()).includes(TOKEN), false);

  const serialized = JSON.stringify((await db.collection("_subscriptionAuditLog").get()).docs.map((d) => d.data()));
  assert.equal(serialized.includes(TOKEN), false);
  assert.equal(serialized.includes(UID), false);

  console.log("googlePlay.emulator.test.ts: ok");
  for (const app of getApps()) {
    await deleteApp(app);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
