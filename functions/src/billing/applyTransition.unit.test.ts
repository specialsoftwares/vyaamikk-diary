/**
 * Transition engine + persistence: idempotency, financial dedup, audit.
 * Runs entirely against the FIRESTORE-STRICT MemoryBillingStore, so every
 * passing case is also a proof that the engine never reads after writing.
 * Run: npm run test:billing-persist
 */

import assert from "node:assert/strict";

import { applySubscriptionTransition } from "./applyTransition";
import { appendSubscriptionAuditEvent } from "./audit";
import { InMemoryCredentialCipher } from "./crypto";
import { diagnosticUidHmac } from "./diagnosticUid";
import { BillingError } from "./errors";
import {
  auditLogPath,
  companyBillingPath,
  financialLedgerPath,
  processedEventPath,
  sanitizeDocId,
  subscriptionHistoryPath,
  subscriptionStatusPath,
} from "./paths";
import { AlreadyExistsError, MemoryBillingStore } from "./store";
import { financialEventIdForStore, type TransitionRequest } from "./transition";
import type { SubscriptionAuditLogEventDoc } from "./types";

const NOW = 1_800_000_000_000;
const FUTURE = NOW + 30 * 86_400_000;
const SECRET = "unit-test-only-billing-diag-uid-secret-0001";
const UID = "uid-persist-alice";
const DIAG = diagnosticUidHmac(SECRET, UID);

function isCause(code: string) {
  return (e: unknown) => e instanceof BillingError && e.causeCode === code;
}

function paidActivate(
  overrides: Partial<TransitionRequest> & { idempotencyKey: string }
): TransitionRequest {
  return {
    uid: UID,
    source: "androidValidation",
    eventSource: "callable",
    occurredAt: NOW,
    nowMs: NOW,
    requested: {
      kind: "activatePaid",
      plan: "professional",
      platformEvent: {
        platform: "android",
        canonicalSku: "vyd_professional_monthly",
        productId: "vyd_professional",
        basePlanId: "monthly",
        currentPeriodStart: NOW,
        currentPeriodEnd: FUTURE,
        autoRenewing: true,
        latestOrderId: "GPA.1111-2222",
        originalTransactionId: null,
        credentialFingerprint: "abc",
        encryptedPurchaseCredential: {
          ciphertext: "cipher",
          keyVersion: "test",
          algorithm: "TEST_ONLY_INMEMORY_AES256GCM_V1",
        },
        reconciledAt: NOW,
      },
      financialEvent: {
        financialEventId: financialEventIdForStore({
          platform: "android",
          eventType: "purchase",
          orderId: "GPA.1111-2222",
        }),
        eventType: "purchase",
        platform: "android",
        canonicalSku: "vyd_professional_monthly",
        grossAmountInPaise: 24_900,
        actualPlatformCommissionInPaise: null,
        estimatedPlatformCommissionInPaise: 3_735,
        occurredAt: NOW,
        relatedFinancialEventId: null,
      },
      historyType: "purchaseActivated",
    },
    ...overrides,
  };
}

async function main() {
  const cipher = new InMemoryCredentialCipher();
  const env = await cipher.encryptCredential("tok_not_plaintext");
  assert.ok(!JSON.stringify(env).includes("tok_not_plaintext"));

  // same idempotency key twice → exactly one transition
  {
    const store = new MemoryBillingStore();
    const req = paidActivate({ idempotencyKey: "evt-1" });
    const a = await applySubscriptionTransition({ store, diagnosticUid: DIAG }, req);
    const b = await applySubscriptionTransition({ store, diagnosticUid: DIAG }, req);
    assert.equal(a.alreadyProcessed, false);
    assert.equal(b.alreadyProcessed, true);
    assert.equal(a.to.plan, "professional");
    assert.equal(a.to.entitlementActive, true);
    assert.equal(a.financialEventWritten, true);
    assert.equal(b.financialEventWritten, false);
    const processed = [...store.docs.keys()].filter((k) => k.startsWith("_processedBillingEvents/"));
    assert.equal(processed.length, 1);
  }

  // same semantic event retried with a LATER nowMs → still idempotent
  // (processing time is deliberately excluded from the fingerprint)
  {
    const store = new MemoryBillingStore();
    const first = paidActivate({ idempotencyKey: "retry-1" });
    const retry = paidActivate({ idempotencyKey: "retry-1", nowMs: NOW + 60_000 });
    const a = await applySubscriptionTransition({ store, diagnosticUid: DIAG }, first);
    const b = await applySubscriptionTransition({ store, diagnosticUid: DIAG }, retry);
    assert.equal(a.alreadyProcessed, false);
    assert.equal(b.alreadyProcessed, true);
  }

  // COMPLETE fingerprint: same key + conflicting semantics → fail closed
  {
    const mutate = (
      label: string,
      change: (r: TransitionRequest) => TransitionRequest
    ): Promise<void> =>
      (async () => {
        const store = new MemoryBillingStore();
        const first = paidActivate({ idempotencyKey: `fp-${label}` });
        await applySubscriptionTransition({ store, diagnosticUid: DIAG }, first);
        const conflicting = change(paidActivate({ idempotencyKey: `fp-${label}` }));
        await assert.rejects(
          applySubscriptionTransition({ store, diagnosticUid: DIAG }, conflicting),
          isCause("idempotency_conflict"),
          `expected conflict for ${label}`
        );
      })();

    // amount 24900 → 19900
    await mutate("amount", (r) => ({
      ...r,
      requested: {
        ...r.requested,
        financialEvent: { ...r.requested.financialEvent!, grossAmountInPaise: 19_900 },
      },
    }));
    // different uid
    await mutate("uid", (r) => ({ ...r, uid: "uid-persist-mallory" }));
    // different base plan (monthly → quarterly, consistent catalog mapping)
    await mutate("baseplan", (r) => ({
      ...r,
      requested: {
        ...r.requested,
        platformEvent: {
          ...r.requested.platformEvent!,
          canonicalSku: "vyd_professional_quarterly",
          basePlanId: "quarterly",
        },
        financialEvent: {
          ...r.requested.financialEvent!,
          canonicalSku: "vyd_professional_quarterly",
        },
      },
    }));
    // different period end
    await mutate("periodend", (r) => ({
      ...r,
      requested: {
        ...r.requested,
        platformEvent: { ...r.requested.platformEvent!, currentPeriodEnd: FUTURE + 86_400_000 },
      },
    }));
  }

  // grace-period end is fingerprinted too (same key, different grace end)
  {
    const store = new MemoryBillingStore();
    const mkGrace = (graceEnd: number): TransitionRequest => ({
      uid: UID,
      source: "rtdn",
      eventSource: "webhook",
      idempotencyKey: "fp-grace",
      occurredAt: NOW,
      nowMs: NOW,
      requested: { kind: "enterGrace", plan: "professional", gracePeriodEndsAt: graceEnd },
    });
    await applySubscriptionTransition({ store, diagnosticUid: DIAG }, mkGrace(NOW + 86_400_000));
    await assert.rejects(
      applySubscriptionTransition({ store, diagnosticUid: DIAG }, mkGrace(NOW + 2 * 86_400_000)),
      isCause("idempotency_conflict")
    );
  }

  // callable then webhook (different idempotency keys, same store order id)
  // → one financial ledger event
  {
    const store = new MemoryBillingStore();
    const finId = financialEventIdForStore({
      platform: "android",
      eventType: "purchase",
      orderId: "GPA.3333",
    });
    const callable = paidActivate({
      idempotencyKey: "callable-3333",
      eventSource: "callable",
      requested: {
        ...paidActivate({ idempotencyKey: "x" }).requested,
        financialEvent: {
          ...paidActivate({ idempotencyKey: "x" }).requested.financialEvent!,
          financialEventId: finId,
        },
      },
    });
    const webhook = paidActivate({
      idempotencyKey: "webhook-3333",
      source: "rtdn",
      eventSource: "webhook",
      requested: {
        ...callable.requested,
        kind: "renew",
        financialEvent: callable.requested.financialEvent,
      },
    });
    const a = await applySubscriptionTransition({ store, diagnosticUid: DIAG }, callable);
    const b = await applySubscriptionTransition({ store, diagnosticUid: DIAG }, webhook);
    assert.equal(a.financialEventWritten, true);
    assert.equal(b.financialEventWritten, false);
    const ledgers = [...store.docs.keys()].filter((k) => k.startsWith("_billingEventLedger/"));
    assert.equal(ledgers.length, 1);
  }

  // webhook then callable → still one ledger event
  {
    const store = new MemoryBillingStore();
    const finId = financialEventIdForStore({
      platform: "ios",
      eventType: "purchase",
      transactionId: "100000123",
    });
    const baseFin = {
      financialEventId: finId,
      eventType: "purchase" as const,
      platform: "ios" as const,
      canonicalSku: "vyd_professional_monthly",
      grossAmountInPaise: 24_900,
      actualPlatformCommissionInPaise: null,
      estimatedPlatformCommissionInPaise: 3_735,
      occurredAt: NOW,
      relatedFinancialEventId: null,
    };
    const webhook: TransitionRequest = {
      uid: UID,
      source: "assnV2",
      eventSource: "webhook",
      idempotencyKey: "assn-100000123",
      occurredAt: NOW,
      nowMs: NOW,
      requested: {
        kind: "activatePaid",
        plan: "professional",
        platformEvent: {
          platform: "ios",
          canonicalSku: "vyd_professional_monthly",
          productId: "com.specialsoftwares.vyaamikkdiary.professional.monthly",
          basePlanId: null,
          currentPeriodStart: NOW,
          currentPeriodEnd: FUTURE,
          autoRenewing: true,
          latestOrderId: null,
          originalTransactionId: "100000123",
          credentialFingerprint: "fp",
          encryptedPurchaseCredential: env,
          reconciledAt: NOW,
        },
        financialEvent: baseFin,
      },
    };
    const callable: TransitionRequest = {
      ...webhook,
      source: "iosValidation",
      eventSource: "callable",
      idempotencyKey: "ios-callable-100000123",
    };
    const a = await applySubscriptionTransition({ store, diagnosticUid: DIAG }, webhook);
    const b = await applySubscriptionTransition({ store, diagnosticUid: DIAG }, callable);
    assert.equal(a.financialEventWritten, true);
    assert.equal(b.financialEventWritten, false);
    assert.equal(
      [...store.docs.keys()].filter((k) => k.startsWith("_billingEventLedger/")).length,
      1
    );
  }

  // EVENT-CLASS LEDGER IDENTITY: purchase and refund of the SAME store
  // transaction coexist as separate rows; duplicates of each class dedup;
  // conflicting duplicate refund data fails closed.
  {
    const store = new MemoryBillingStore();
    const purchase = paidActivate({ idempotencyKey: "coexist-p1" });
    const purchaseId = purchase.requested.financialEvent!.financialEventId;
    const refundId = financialEventIdForStore({
      platform: "android",
      eventType: "refund",
      orderId: "GPA.1111-2222", // SAME store transaction — no new id needed
    });
    assert.equal(purchaseId, "android:purchase:GPA.1111-2222");
    assert.equal(refundId, "android:refund:GPA.1111-2222");
    assert.notEqual(purchaseId, refundId);

    const mkRefund = (key: string, gross: number): TransitionRequest => ({
      uid: UID,
      source: "rtdn",
      eventSource: "webhook",
      idempotencyKey: key,
      occurredAt: NOW + 60_000,
      nowMs: NOW + 60_000,
      requested: {
        kind: "refund",
        accessRevoked: true,
        financialEvent: {
          financialEventId: refundId,
          eventType: "refund",
          platform: "android",
          canonicalSku: "vyd_professional_monthly",
          grossAmountInPaise: gross,
          actualPlatformCommissionInPaise: null,
          estimatedPlatformCommissionInPaise: null,
          occurredAt: NOW + 60_000,
          relatedFinancialEventId: purchaseId,
        },
      },
    });

    const p = await applySubscriptionTransition({ store, diagnosticUid: DIAG }, purchase);
    // duplicate purchase delivery (webhook) → no second purchase row
    const pDup = await applySubscriptionTransition(
      { store, diagnosticUid: DIAG },
      paidActivate({
        idempotencyKey: "coexist-p2",
        source: "rtdn",
        eventSource: "webhook",
        nowMs: NOW + 30_000,
      })
    );
    const r = await applySubscriptionTransition(
      { store, diagnosticUid: DIAG },
      mkRefund("coexist-r1", 24_900)
    );
    const rDup = await applySubscriptionTransition(
      { store, diagnosticUid: DIAG },
      mkRefund("coexist-r2", 24_900)
    );
    assert.equal(p.financialEventWritten, true);
    assert.equal(pDup.financialEventWritten, false);
    assert.equal(r.financialEventWritten, true);
    assert.equal(rDup.financialEventWritten, false);
    assert.equal(r.to.entitlementActive, false);
    const ledgers = [...store.docs.keys()].filter((k) => k.startsWith("_billingEventLedger/"));
    assert.equal(ledgers.length, 2); // purchase + refund coexist
    assert.ok(store.docs.has(financialLedgerPath(sanitizeDocId(purchaseId))));
    assert.ok(store.docs.has(financialLedgerPath(sanitizeDocId(refundId))));
    const refundLedger = store.docs.get(financialLedgerPath(sanitizeDocId(refundId))) as {
      relatedFinancialEventId: string | null;
    };
    assert.equal(refundLedger.relatedFinancialEventId, purchaseId);

    await assert.rejects(
      applySubscriptionTransition(
        { store: new MemoryBillingStore(), diagnosticUid: DIAG },
        {
          ...mkRefund("missing-related", 24_900),
          requested: {
            kind: "refund",
            accessRevoked: true,
            financialEvent: {
              ...mkRefund("missing-related", 24_900).requested.financialEvent!,
              relatedFinancialEventId: null,
            },
          },
        }
      ),
      isCause("missing_related_financial_event")
    );

    // conflicting second refund (different amount, same refund id) → fail closed
    await assert.rejects(
      applySubscriptionTransition({ store, diagnosticUid: DIAG }, mkRefund("coexist-r3", 9_900)),
      isCause("financial_event_conflict")
    );
    assert.equal(
      [...store.docs.keys()].filter((k) => k.startsWith("_billingEventLedger/")).length,
      2
    );
  }

  // STALE PLATFORM STATE: reconciledAt older than the stored watermark → reject
  {
    const store = new MemoryBillingStore();
    await applySubscriptionTransition(
      { store, diagnosticUid: DIAG },
      paidActivate({ idempotencyKey: "stale-base" })
    );
    const stale = paidActivate({ idempotencyKey: "stale-older", nowMs: NOW + 60_000 });
    stale.requested = {
      ...stale.requested,
      kind: "renew",
      platformEvent: { ...stale.requested.platformEvent!, reconciledAt: NOW - 1_000 },
      financialEvent: undefined,
    };
    await assert.rejects(
      applySubscriptionTransition({ store, diagnosticUid: DIAG }, stale),
      isCause("stale_platform_state")
    );
    // equal watermark (same reconciliation feeding two paths) stays allowed
    const equal = paidActivate({ idempotencyKey: "stale-equal", nowMs: NOW + 90_000 });
    equal.requested = { ...equal.requested, kind: "renew", financialEvent: undefined };
    const ok = await applySubscriptionTransition({ store, diagnosticUid: DIAG }, equal);
    assert.equal(ok.alreadyProcessed, false);
  }

  // same key with conflicting data → fail closed
  {
    const store = new MemoryBillingStore();
    const first = paidActivate({ idempotencyKey: "conflict-1" });
    await applySubscriptionTransition({ store, diagnosticUid: DIAG }, first);
    const second = paidActivate({
      idempotencyKey: "conflict-1",
      requested: {
        ...first.requested,
        kind: "refund",
        financialEvent: {
          ...first.requested.financialEvent!,
          eventType: "refund",
          relatedFinancialEventId: first.requested.financialEvent!.financialEventId,
        },
      },
    });
    await assert.rejects(
      applySubscriptionTransition({ store, diagnosticUid: DIAG }, second),
      isCause("idempotency_conflict")
    );
  }

  // financial identity = event class + store order id (deterministic,
  // Firestore-safe), never a client request id
  assert.equal(
    financialEventIdForStore({ platform: "android", eventType: "purchase", orderId: "GPA.9" }),
    "android:purchase:GPA.9"
  );
  assert.equal(
    financialEventIdForStore({ platform: "ios", eventType: "chargeback", transactionId: "77" }),
    "ios:chargeback:77"
  );
  assert.equal(
    financialEventIdForStore({ platform: "android", eventType: "renewal", orderId: "GPA.9/..2" }),
    "android:renewal:GPA.9_..2"
  );
  assert.throws(() =>
    financialEventIdForStore({ platform: "android", eventType: "purchase", orderId: null })
  );
  assert.throws(() =>
    financialEventIdForStore({ platform: "ios", eventType: "refund", transactionId: null })
  );

  // audit append-only: duplicate event id cannot overwrite
  {
    const store = new MemoryBillingStore();
    const event: SubscriptionAuditLogEventDoc = {
      diagnosticUid: DIAG,
      source: "admin",
      idempotencyKey: "aud-1",
      occurredAt: NOW,
      fromPlan: null,
      toPlan: "free",
      fromBillingStatus: null,
      toBillingStatus: "expired",
      entitlementActiveAfter: false,
      detail: { kind: "expire" },
    };
    await store.runTransaction(async (tx) => {
      appendSubscriptionAuditEvent(tx, "dup-audit", event);
    });
    await assert.rejects(
      store.runTransaction(async (tx) => {
        appendSubscriptionAuditEvent(tx, "dup-audit", { ...event, toPlan: "business" });
      }),
      (e: unknown) => e instanceof AlreadyExistsError
    );
    const stored = store.docs.get(auditLogPath("dup-audit"));
    assert.equal(stored?.toPlan, "free");
    assert.ok(!("uid" in (stored ?? {})));
  }

  // audit + history + company: no raw uid in audit VALUES, no credential in
  // history, encrypted credential only on company billing
  {
    const store = new MemoryBillingStore();
    await applySubscriptionTransition(
      { store, diagnosticUid: DIAG },
      paidActivate({ idempotencyKey: "priv-1" })
    );
    for (const [path, doc] of store.docs) {
      if (path.startsWith("_subscriptionAuditLog/")) {
        assert.ok(!("uid" in doc));
        assert.equal(doc.diagnosticUid, DIAG);
        const serialized = JSON.stringify(doc);
        assert.ok(!serialized.includes("cipher"));
        assert.ok(!serialized.includes(UID), "audit values must not contain raw uid");
      }
      if (path.includes("subscriptionBillingHistory")) {
        const keys = Object.keys(doc);
        assert.ok(!keys.includes("purchaseToken"));
        assert.ok(!keys.includes("encryptedPurchaseCredential"));
        assert.ok(!keys.includes("signedTransaction"));
      }
    }
    const company = store.docs.get(companyBillingPath(UID));
    assert.ok(company);
    assert.equal(company.uid, UID);
    assert.equal(company.lastReconciledAt, NOW);
    assert.ok(company.encryptedPurchaseCredential);
    assert.ok(!JSON.stringify(company).includes("tok_not_plaintext"));
    assert.ok(store.docs.has(subscriptionStatusPath(UID)));
    assert.ok(store.docs.has(processedEventPath(sanitizeDocId("priv-1"))));
    assert.ok(
      store.docs.has(subscriptionHistoryPath(UID, sanitizeDocId("h_priv-1")))
    );
    assert.ok(
      store.docs.has(
        financialLedgerPath(sanitizeDocId("android:purchase:GPA.1111-2222"))
      )
    );
  }

  // recordFinancial writes a refund ledger row without expiring access
  {
    const store = new MemoryBillingStore();
    await applySubscriptionTransition(
      { store, diagnosticUid: DIAG },
      paidActivate({ idempotencyKey: "rf-paid" })
    );
    const purchaseId = "android:purchase:GPA.1111-2222";
    const refundId = financialEventIdForStore({
      platform: "android",
      eventType: "refund",
      orderId: "GPA.1111-2222",
    });
    const recorded = await applySubscriptionTransition(
      { store, diagnosticUid: DIAG },
      {
        uid: UID,
        source: "rtdn",
        eventSource: "webhook",
        idempotencyKey: "rf-keep-access",
        occurredAt: NOW + 10_000,
        nowMs: NOW + 10_000,
        requested: {
          kind: "recordFinancial",
          financialEvent: {
            financialEventId: refundId,
            eventType: "refund",
            platform: "android",
            canonicalSku: "vyd_professional_monthly",
            grossAmountInPaise: 24_900,
            actualPlatformCommissionInPaise: null,
            estimatedPlatformCommissionInPaise: null,
            occurredAt: NOW + 10_000,
            relatedFinancialEventId: purchaseId,
          },
          googleSubscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
        },
      }
    );
    assert.equal(recorded.financialEventWritten, true);
    assert.equal(recorded.to.entitlementActive, true);
    assert.equal(recorded.to.billingStatus, "active");
    assert.equal(recorded.to.plan, "professional");
  }

  console.log("applyTransition.unit.test.ts: ok");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
