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
import { istMonthKeyForMillis } from "./istMonthKey";
import { financialLedgerPath, sanitizeDocId, subscriptionStatusPath, trialLedgerPath, billingReconciliationQueuePath } from "./paths";
import { ensureReconciliationWorkItem } from "./reconciliationQueue";
import {
  financialEventIdForStore,
  type TransitionRequest,
  type VerifiedPlatformEvent,
} from "./transition";
import { AdminFirestoreTaxComplianceReportSource } from "./tax/taxComplianceReportSource";
import { buildGstr1WorkingPapers } from "./tax/gstr1WorkingPapers";
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

function describeErr(err: unknown): string {
  if (err instanceof BillingError) return `BillingError:${err.causeCode}`;
  if (err instanceof Error) return `${err.name}:${err.message}`;
  return String(err);
}

function isFirestoreRaceLoser(err: unknown, allowedCauses: string[]): boolean {
  if (err instanceof BillingError) return allowedCauses.includes(err.causeCode);
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /ABORTED|contention|already exists|FAILED_PRECONDITION/i.test(msg);
}

function makeReadBarrier(n: number) {
  let count = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  return async () => {
    count += 1;
    if (count >= n) release?.();
    await Promise.race([
      gate,
      new Promise<void>((r) => {
        setTimeout(r, 100);
      }),
    ]);
    return { outcome: "proceed" as const };
  };
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
  assert.equal((await db.doc(trialLedgerPath(identityB)).get()).exists, false, "rejected trial must not leave a ledger row (atomic failure)");

  // ——— Round 4: concurrent refund vs chargeback of one Order, real Firestore ———
  {
    const UID_REV = "emu-uid-billing-rev-4";
    const ORDER_REV = "GPA.EMU-REV-4";
    const diagnosticUidRev = diagnosticUidHmac(DIAG_SECRET, UID_REV);
    const purchaseId = financialEventIdForStore({
      platform: "android",
      eventType: "purchase",
      orderId: ORDER_REV,
    });
    const refundId = financialEventIdForStore({
      platform: "android",
      eventType: "refund",
      orderId: ORDER_REV,
    });
    const chargebackId = financialEventIdForStore({
      platform: "android",
      eventType: "chargeback",
      orderId: ORDER_REV,
    });
    const occurredAt = NOW + 12 * 60_000;
    const purchaseReq: TransitionRequest = {
      uid: UID_REV,
      source: "androidValidation",
      eventSource: "callable",
      idempotencyKey: "emu-rev-purchase",
      occurredAt: NOW + 10 * 60_000,
      nowMs: NOW + 10 * 60_000,
      requested: {
        kind: "activatePaid",
        plan: "professional",
        platformEvent: platformEvent({
          latestOrderId: ORDER_REV,
          credentialFingerprint: "fp-emulator-rev-4",
          reconciledAt: NOW + 10 * 60_000,
          currentPeriodStart: NOW + 10 * 60_000,
        }),
        financialEvent: {
          financialEventId: purchaseId,
          eventType: "purchase",
          platform: "android",
          canonicalSku: "vyd_professional_monthly",
          grossAmountInPaise: 24_900,
          actualPlatformCommissionInPaise: null,
          estimatedPlatformCommissionInPaise: 3_735,
          occurredAt: NOW + 10 * 60_000,
          relatedFinancialEventId: null,
        },
      },
    };
    await applySubscriptionTransition({ store, diagnosticUid: diagnosticUidRev }, purchaseReq);
    const purchasePath = financialLedgerPath(sanitizeDocId(purchaseId));
    const purchaseBefore = (await db.doc(purchasePath).get()).data();
    assert.ok(purchaseBefore);
    const statusBefore = (await db.doc(subscriptionStatusPath(UID_REV)).get()).data();
    const mkReversal = (eventType: "refund" | "chargeback"): TransitionRequest => {
      const financialEventId = eventType === "refund" ? refundId : chargebackId;
      return {
        uid: UID_REV,
        source: "rtdn",
        eventSource: "webhook",
        idempotencyKey: financialEventId,
        occurredAt,
        nowMs: occurredAt,
        requested: {
          kind: "recordFinancial",
          financialEvent: {
            financialEventId,
            eventType,
            platform: "android",
            canonicalSku: "vyd_professional_monthly",
            grossAmountInPaise: 24_900,
            actualPlatformCommissionInPaise: null,
            estimatedPlatformCommissionInPaise: null,
            occurredAt,
            relatedFinancialEventId: purchaseId,
          },
        },
      };
    };
    let settled: PromiseSettledResult<unknown>[] = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      const delay = makeReadBarrier(2);
      settled = await Promise.allSettled([
        applySubscriptionTransition(
          { store, diagnosticUid: diagnosticUidRev, prepareTransition: delay },
          mkReversal("refund")
        ),
        applySubscriptionTransition(
          { store, diagnosticUid: diagnosticUidRev, prepareTransition: delay },
          mkReversal("chargeback")
        ),
      ]);
      if (settled.filter((r) => r.status === "fulfilled").length > 0) break;
    }
    const fulfilled = settled.filter((r) => r.status === "fulfilled");
    const rejected = settled.filter((r) => r.status === "rejected");
    assert.equal(
      fulfilled.length,
      1,
      `expected one reversal winner, got ${settled.map((r) => (r.status === "rejected" ? describeErr(r.reason) : "ok")).join(",")}`
    );
    assert.equal(rejected.length, 1);
    const lost = (rejected[0] as PromiseRejectedResult).reason;
    assert.ok(
      isFirestoreRaceLoser(lost, ["full_reversal_classification_conflict", "append_only_collision"]),
      `loser was ${describeErr(lost)}`
    );
    const refundSnap = await db.doc(financialLedgerPath(sanitizeDocId(refundId))).get();
    const chargebackSnap = await db.doc(financialLedgerPath(sanitizeDocId(chargebackId))).get();
    assert.equal(
      Number(refundSnap.exists) + Number(chargebackSnap.exists),
      1,
      "exactly one full-reversal class"
    );
    assert.deepEqual((await db.doc(purchasePath).get()).data(), purchaseBefore);
    const statusAfter = (await db.doc(subscriptionStatusPath(UID_REV)).get()).data();
    assert.equal(statusAfter?.plan, statusBefore?.plan);
    assert.equal(statusAfter?.entitlementActive, statusBefore?.entitlementActive);
    const winnerType = refundSnap.exists ? "refund" : "chargeback";
    const month = istMonthKeyForMillis(occurredAt);
    const papers = buildGstr1WorkingPapers({
      month,
      ...(await new AdminFirestoreTaxComplianceReportSource(db).loadMonthlyScope(month)),
    });
    const reversalRows = papers.taxAdjustments.filter(
      (row) =>
        row.financialEventId === refundId || row.financialEventId === chargebackId
    );
    assert.equal(reversalRows.length, 1);
    if (winnerType === "chargeback") {
      assert.equal(papers.reviewStatus, "requires_tax_review");
      assert.equal(reversalRows[0].eventType, "chargeback");
      assert.equal(reversalRows[0].creditNoteId, null);
      assert.ok(
        papers.complianceOpenItems.some((i) =>
          i.unresolvedReasons.includes("gst_adjustment_requires_review")
        )
      );
    } else {
      assert.equal(reversalRows[0].eventType, "refund");
    }
  }

  // ——— Round 4: queue create race identity (real Firestore) ———
  {
    const qid = "android:refund-reconcile:GPA.EMU-Q-4";
    const mismatch = await Promise.allSettled([
      ensureReconciliationWorkItem(store, {
        id: qid,
        reason: "live_subscription_unavailable",
        platform: "android",
        financialEventId: "android:refund:GPA.EMU-Q-4",
        nowMs: NOW + 13 * 60_000,
      }),
      ensureReconciliationWorkItem(store, {
        id: qid,
        reason: "live_subscription_unavailable",
        platform: "android",
        financialEventId: "android:chargeback:GPA.EMU-Q-4",
        nowMs: NOW + 13 * 60_000,
      }),
    ]);
    const mismatchFulfilled = mismatch.filter((r) => r.status === "fulfilled");
    const mismatchRejected = mismatch.filter((r) => r.status === "rejected");
    assert.equal(
      mismatchFulfilled.length,
      1,
      `queue mismatch race: ${mismatch.map((r) => (r.status === "rejected" ? describeErr(r.reason) : "ok")).join(",")}`
    );
    assert.equal(mismatchRejected.length, 1);
    const mismatchLost = (mismatchRejected[0] as PromiseRejectedResult).reason;
    assert.ok(
      isFirestoreRaceLoser(mismatchLost, ["reconciliation_queue_identity_mismatch"]),
      `queue loser was ${describeErr(mismatchLost)}`
    );
    const qDoc = await db.doc(billingReconciliationQueuePath(sanitizeDocId(qid))).get();
    assert.equal(qDoc.exists, true);
    const qData = qDoc.data() as { financialEventId: string; platform: string };
    assert.equal(qData.platform, "android");
    assert.ok(
      qData.financialEventId === "android:refund:GPA.EMU-Q-4" ||
        qData.financialEventId === "android:chargeback:GPA.EMU-Q-4"
    );

    const qidSame = "android:refund-reconcile:GPA.EMU-Q-4-SAME";
    const same = await Promise.allSettled([
      ensureReconciliationWorkItem(store, {
        id: qidSame,
        reason: "live_subscription_unavailable",
        platform: "android",
        financialEventId: "android:refund:GPA.EMU-Q-4-SAME",
        nowMs: NOW + 14 * 60_000,
      }),
      ensureReconciliationWorkItem(store, {
        id: qidSame,
        reason: "live_subscription_unavailable",
        platform: "android",
        financialEventId: "android:refund:GPA.EMU-Q-4-SAME",
        nowMs: NOW + 14 * 60_000,
      }),
    ]);
    assert.equal(same.every((r) => r.status === "fulfilled"), true);
    const createdFlags = same.map((r) => (r.status === "fulfilled" ? r.value.created : false));
    assert.equal(createdFlags.filter(Boolean).length, 1);
    assert.equal(createdFlags.filter((v) => !v).length, 1);
  }

  // ——— Value-level privacy: no raw uid/phone anywhere in audit values ———
  const audits = await db.collection("_subscriptionAuditLog").get();
  assert.ok(audits.size >= 5);
  for (const doc of audits.docs) {
    const serialized = JSON.stringify(doc.data());
    for (const secret of [UID, "emu-uid-billing-rev-4", PHONE, PHONE_B, PHONE.slice(1), PHONE_B.slice(1)]) {
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
        androidFullReversalMutexUnderRealFirestore: true,
        reconciliationQueueCreateRaceIdentityUnderRealFirestore: true,
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
