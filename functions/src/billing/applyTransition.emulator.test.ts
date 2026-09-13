/**
 * Firestore-emulator proof of the Phase-B billing transition TRANSACTION
 * SHAPE: all reads precede all writes under REAL Firestore semantics
 * (firebase-admin enforces this), atomicity of rejected transitions, ledger
 * coexist/dedup behavior, stale-event rejection, trial paid-access
 * protection, and value-level audit privacy.
 *
 * Run:
 *   cd <repo> && firebase emulators:exec --only firestore --project demo-vyaamikk \
 *     "npx --yes tsx functions/src/billing/applyTransition.emulator.test.ts"
 */
import assert from "node:assert/strict";

import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { applySubscriptionTransition } from "./applyTransition";
import { diagnosticUidHmac } from "./diagnosticUid";
import { BillingError } from "./errors";
import { FirestoreBillingStore } from "./firestoreBillingStore";
import { subscriptionStatusPath, trialLedgerPath } from "./paths";
import {
  financialEventIdForStore,
  type TransitionRequest,
  type VerifiedPlatformEvent,
} from "./transition";
import { trialIdentityHmac } from "./trialIdentity";
import { grantProfessionalTrial } from "./trialGrant";
import { TRIAL_DURATION_DAYS } from "./types";

const NOW = 1_760_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const UID = "emu-uid-billing-1";
const PHONE = "+919800044455";
const PHONE_B = "+919800044466";
const TRIAL_SECRET = "trial-identity-secret-emulator-0123456789";
const DIAG_SECRET = "billing-diag-uid-secret-emulator-0123456789";

function platformEvent(overrides: Partial<VerifiedPlatformEvent> = {}): VerifiedPlatformEvent {
  return {
    platform: "android",
    canonicalSku: "vyd_professional_monthly",
    productId: "vyd_professional",
    basePlanId: "monthly",
    currentPeriodStart: NOW + 2 * 60_000,
    currentPeriodEnd: NOW + 30 * DAY,
    autoRenewing: true,
    latestOrderId: "GPA.EMU-1",
    originalTransactionId: null,
    credentialFingerprint: "fp-emulator",
    encryptedPurchaseCredential: {
      ciphertext: "b3BhcXVlLWNpcGhlcnRleHQ=",
      keyVersion: "test-memory-v1",
      algorithm: "TEST_ONLY_INMEMORY_AES256GCM_V1",
    },
    reconciledAt: NOW + 2 * 60_000,
    ...overrides,
  };
}

async function expectBillingError(p: Promise<unknown>, causeCode: string): Promise<void> {
  try {
    await p;
  } catch (err) {
    assert.ok(err instanceof BillingError, `expected BillingError, got ${String(err)}`);
    assert.equal(err.causeCode, causeCode);
    return;
  }
  assert.fail(`expected BillingError ${causeCode}, but call succeeded`);
}

async function main() {
  assert.ok(
    process.env.FIRESTORE_EMULATOR_HOST,
    "FIRESTORE_EMULATOR_HOST required (use firebase emulators:exec)"
  );
  if (getApps().length === 0) {
    initializeApp({ projectId: "demo-vyaamikk" });
  }
  const db = getFirestore();
  const store = new FirestoreBillingStore(db);
  const diagnosticUid = diagnosticUidHmac(DIAG_SECRET, UID);

  // ——— Control: real Firestore rejects read-after-write in a transaction ———
  let readAfterWriteFailed = false;
  try {
    await db.runTransaction(async (tx) => {
      tx.set(db.doc("emuControl/w1"), { v: 1 });
      await tx.get(db.doc("emuControl/r1"));
    });
  } catch (err) {
    readAfterWriteFailed = true;
    const msg = err instanceof Error ? err.message : String(err);
    assert.match(msg, /read|Firestore transactions/i, `unexpected control error: ${msg}`);
  }
  assert.equal(readAfterWriteFailed, true, "control read-after-write must fail");

  // ——— Trial grant (prepare hook + aux ledger write) commits atomically ———
  const grant = await grantProfessionalTrial(store, {
    uid: UID,
    phoneE164: PHONE,
    trialIdentitySecret: TRIAL_SECRET,
    billingDiagUidSecret: DIAG_SECRET,
    nowMs: NOW,
  });
  assert.equal(grant.alreadyProcessed, false);
  assert.equal(grant.trialEndsAt, NOW + TRIAL_DURATION_DAYS * DAY);
  assert.ok(!("trialIdentityHmac" in grant), "identity HMAC must not be returned");
  const identity = trialIdentityHmac(TRIAL_SECRET, PHONE);
  const ledgerSnap = await db.doc(trialLedgerPath(identity)).get();
  assert.equal(ledgerSnap.data()?.trialUsed, true);
  assert.equal(ledgerSnap.data()?.lastAccountUidDiagnostic, diagnosticUid);

  // ——— Trial retry later: idempotent, zero writes, NO extension ———
  const retry = await grantProfessionalTrial(store, {
    uid: UID,
    phoneE164: PHONE,
    trialIdentitySecret: TRIAL_SECRET,
    billingDiagUidSecret: DIAG_SECRET,
    nowMs: NOW + 3 * DAY,
  });
  assert.equal(retry.alreadyProcessed, true);
  assert.equal(retry.trialEndsAt, NOW + TRIAL_DURATION_DAYS * DAY, "trial must not extend");

  // ——— Paid activation with financial purchase event ———
  const purchaseId = financialEventIdForStore({
    platform: "android",
    eventType: "purchase",
    orderId: "GPA.EMU-1",
  });
  assert.equal(purchaseId, "android:purchase:GPA.EMU-1");
  const purchaseReq: TransitionRequest = {
    uid: UID,
    source: "androidValidation",
    eventSource: "callable",
    idempotencyKey: "emu-purchase-1",
    occurredAt: NOW + 2 * 60_000,
    nowMs: NOW + 2 * 60_000,
    requested: {
      kind: "activatePaid",
      plan: "professional",
      platformEvent: platformEvent(),
      financialEvent: {
        financialEventId: purchaseId,
        eventType: "purchase",
        platform: "android",
        canonicalSku: "vyd_professional_monthly",
        grossAmountInPaise: 24_900,
        actualPlatformCommissionInPaise: null,
        estimatedPlatformCommissionInPaise: 3_735,
        occurredAt: NOW + 2 * 60_000,
        relatedFinancialEventId: null,
      },
    },
  };
  const purchase = await applySubscriptionTransition({ store, diagnosticUid }, purchaseReq);
  assert.equal(purchase.financialEventWritten, true);
  assert.equal(purchase.to.plan, "professional");
  assert.equal(purchase.to.billingStatus, "active");

  // ——— Same purchase re-delivered via webhook: no second ledger row ———
  const webhookReplay = await applySubscriptionTransition(
    { store, diagnosticUid },
    {
      ...purchaseReq,
      source: "rtdn",
      eventSource: "webhook",
      idempotencyKey: "emu-rtdn-1",
      nowMs: NOW + 4 * 60_000,
    }
  );
  assert.equal(webhookReplay.financialEventWritten, false);
  assert.equal((await db.collection("_billingEventLedger").get()).size, 1);

  // ——— Refund of the SAME store transaction: separate coexisting row ———
  const refundId = financialEventIdForStore({
    platform: "android",
    eventType: "refund",
    orderId: "GPA.EMU-1",
  });
  assert.equal(refundId, "android:refund:GPA.EMU-1");
  const refundReq: TransitionRequest = {
    uid: UID,
    source: "rtdn",
    eventSource: "webhook",
    idempotencyKey: "emu-refund-1",
    occurredAt: NOW + 5 * 60_000,
    nowMs: NOW + 5 * 60_000,
    requested: {
      kind: "refund",
      financialEvent: {
        financialEventId: refundId,
        eventType: "refund",
        platform: "android",
        canonicalSku: "vyd_professional_monthly",
        grossAmountInPaise: 24_900,
        actualPlatformCommissionInPaise: null,
        estimatedPlatformCommissionInPaise: null,
        occurredAt: NOW + 5 * 60_000,
        relatedFinancialEventId: purchaseId,
      },
    },
  };
  const refund = await applySubscriptionTransition({ store, diagnosticUid }, refundReq);
  assert.equal(refund.financialEventWritten, true);
  assert.equal(refund.to.entitlementActive, false);
  assert.equal((await db.collection("_billingEventLedger").get()).size, 2);

  // ——— Duplicate refund delivery (new idempotency key): no third row ———
  const refundReplay = await applySubscriptionTransition(
    { store, diagnosticUid },
    { ...refundReq, idempotencyKey: "emu-refund-2", nowMs: NOW + 6 * 60_000 }
  );
  assert.equal(refundReplay.financialEventWritten, false);
  assert.equal((await db.collection("_billingEventLedger").get()).size, 2);

  // ——— Stale platform state rejected; failed txn leaves no partial writes ———
  const beforeStale = (await db.doc(subscriptionStatusPath(UID)).get()).data();
  await expectBillingError(
    applySubscriptionTransition(
      { store, diagnosticUid },
      {
        uid: UID,
        source: "rtdn",
        eventSource: "webhook",
        idempotencyKey: "emu-stale-1",
        occurredAt: NOW,
        nowMs: NOW + 7 * 60_000,
        requested: {
          kind: "renew",
          platformEvent: platformEvent({ reconciledAt: NOW }), // older than watermark
        },
      }
    ),
    "stale_platform_state"
  );
  assert.deepEqual((await db.doc(subscriptionStatusPath(UID)).get()).data(), beforeStale);
  // trial grant + purchase + webhook replay + refund + refund replay = 5;
  // the trial retry and both rejected transitions wrote nothing.
  assert.equal((await db.collection("_processedBillingEvents").get()).size, 5);

  // ——— Trial can never replace (even historic) paid access; atomicity ———
  await expectBillingError(
    grantProfessionalTrial(store, {
      uid: UID,
      phoneE164: PHONE_B,
      trialIdentitySecret: TRIAL_SECRET,
      billingDiagUidSecret: DIAG_SECRET,
      nowMs: NOW + 8 * 60_000,
    }),
    "trial_prior_state_ineligible"
  );
  const identityB = trialIdentityHmac(TRIAL_SECRET, PHONE_B);
  assert.equal(
    (await db.doc(trialLedgerPath(identityB)).get()).exists,
    false,
    "rejected trial must not leave a ledger row (atomic failure)"
  );

  // ——— Value-level privacy: no raw uid/phone anywhere in audit values ———
  const audits = await db.collection("_subscriptionAuditLog").get();
  assert.equal(audits.size, 5);
  for (const doc of audits.docs) {
    const serialized = JSON.stringify(doc.data());
    for (const secret of [UID, PHONE, PHONE_B, PHONE.slice(1), PHONE_B.slice(1)]) {
      assert.ok(
        !serialized.includes(secret),
        `audit doc ${doc.id} leaks ${secret.slice(0, 4)}…`
      );
    }
  }

  console.log("applyTransition.emulator.test.ts: ok");
  console.log(
    JSON.stringify({
      proved: {
        controlReadAfterWriteFailsInRealFirestore: true,
        engineTransactionShapeCommitsUnderRealFirestore: true,
        trialRetryIdempotentNoExtension: true,
        purchaseWebhookRedeliveryDeduplicated: true,
        purchaseAndRefundOfSameTransactionCoexist: true,
        duplicateRefundDeduplicated: true,
        stalePlatformStateRejectedAtomically: true,
        trialCannotReplacePaidAccess: true,
        auditValuesContainNoRawUidOrPhone: true,
      },
    })
  );

  for (const app of getApps()) {
    await deleteApp(app);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
