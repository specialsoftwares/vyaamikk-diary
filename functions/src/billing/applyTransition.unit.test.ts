/**
 * Transition engine + persistence: idempotency, financial dedup, audit.
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

function paidActivate(overrides: Partial<TransitionRequest> & { idempotencyKey: string }): TransitionRequest {
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
      },
      financialEvent: {
        financialEventId: financialEventIdForStore({
          platform: "android",
          orderId: "GPA.1111-2222",
        }),
        eventType: "purchase",
        platform: "android",
        canonicalSku: "vyd_professional_monthly",
        grossAmountInPaise: 24_900,
        actualPlatformCommissionInPaise: null,
        estimatedPlatformCommissionInPaise: 3_735,
        occurredAt: NOW,
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

  // callable then webhook (different idempotency keys, same store order id)
  // → one financial ledger event
  {
    const store = new MemoryBillingStore();
    const finId = financialEventIdForStore({ platform: "android", orderId: "GPA.3333" });
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
    const finId = financialEventIdForStore({ platform: "ios", transactionId: "100000123" });
    const baseFin = {
      financialEventId: finId,
      eventType: "purchase" as const,
      platform: "ios" as const,
      canonicalSku: "vyd_professional_monthly",
      grossAmountInPaise: 24_900,
      actualPlatformCommissionInPaise: null,
      estimatedPlatformCommissionInPaise: 3_735,
      occurredAt: NOW,
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

  // duplicate refund → one refund event
  {
    const store = new MemoryBillingStore();
    const finId = "android:GPA.refund-1";
    const mk = (key: string): TransitionRequest => ({
      uid: UID,
      source: "rtdn",
      eventSource: "webhook",
      idempotencyKey: key,
      occurredAt: NOW,
      nowMs: NOW,
      requested: {
        kind: "refund",
        accessRevoked: true,
        financialEvent: {
          financialEventId: finId,
          eventType: "refund",
          platform: "android",
          canonicalSku: "vyd_starter_monthly",
          grossAmountInPaise: 9_900,
          actualPlatformCommissionInPaise: null,
          estimatedPlatformCommissionInPaise: 1_485,
          occurredAt: NOW,
        },
      },
    });
    const a = await applySubscriptionTransition({ store, diagnosticUid: DIAG }, mk("refund-a"));
    const b = await applySubscriptionTransition({ store, diagnosticUid: DIAG }, mk("refund-b"));
    assert.equal(a.to.entitlementActive, false);
    assert.equal(a.financialEventWritten, true);
    assert.equal(b.financialEventWritten, false);
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
        },
      },
    });
    await assert.rejects(
      applySubscriptionTransition({ store, diagnosticUid: DIAG }, second),
      (e: unknown) => e instanceof BillingError && e.causeCode === "idempotency_conflict"
    );
  }

  // financial identity is store order id, never client request id
  assert.equal(
    financialEventIdForStore({ platform: "android", orderId: "GPA.9" }),
    "android:GPA.9"
  );
  assert.throws(() => financialEventIdForStore({ platform: "android", orderId: null }));

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

  // audit + history + company: no raw uid on audit, no credential in history
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
        assert.ok(!JSON.stringify(doc).includes("cipher"));
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
    assert.ok(company.encryptedPurchaseCredential);
    assert.ok(!JSON.stringify(company).includes("tok_not_plaintext"));
    assert.ok(store.docs.has(subscriptionStatusPath(UID)));
    assert.ok(store.docs.has(processedEventPath(sanitizeDocId("priv-1"))));
    assert.ok(
      store.docs.has(subscriptionHistoryPath(UID, sanitizeDocId("h_priv-1")))
    );
    assert.ok(
      store.docs.has(
        financialLedgerPath(sanitizeDocId("android:GPA.1111-2222"))
      )
    );
  }

  console.log("applyTransition.unit.test.ts: ok");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
