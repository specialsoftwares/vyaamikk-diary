/**
 * Pure transition derivation (no persistence).
 * Run: npm run test:billing-transition
 */

import assert from "node:assert/strict";

import { deriveSubscriptionTransition, type TransitionRequest } from "./transition";
import { TRIAL_DURATION_DAYS } from "./types";

const NOW = 1_800_000_000_000;
const FUTURE = NOW + 10 * 86_400_000;

const trialReq: TransitionRequest = {
  uid: "u1",
  source: "trialGrant",
  eventSource: "trial",
  idempotencyKey: "t1",
  occurredAt: NOW,
  nowMs: NOW,
  requested: { kind: "grantTrial" },
};

{
  const d = deriveSubscriptionTransition(null, trialReq);
  assert.equal(d.next.plan, "professional");
  assert.equal(d.next.billingStatus, "trial");
  assert.equal(d.next.entitlementActive, true);
  assert.equal(d.next.trialEndsAt, NOW + TRIAL_DURATION_DAYS * 86_400_000);
  assert.equal(d.next.quotaEnforcementEnabled, false);
  assert.equal(d.history?.type, "trialStarted");
  assert.equal(d.ledger, null);
}

{
  const cancelled: TransitionRequest = {
    uid: "u1",
    source: "rtdn",
    eventSource: "webhook",
    idempotencyKey: "c1",
    occurredAt: NOW,
    nowMs: NOW,
    requested: {
      kind: "cancel",
      cancelledAt: NOW,
      platformEvent: {
        platform: "android",
        canonicalSku: "vyd_starter_monthly",
        productId: "vyd_starter",
        basePlanId: "monthly",
        currentPeriodStart: NOW - 1000,
        currentPeriodEnd: FUTURE,
        autoRenewing: false,
        latestOrderId: "GPA.1",
        originalTransactionId: null,
        credentialFingerprint: null,
        encryptedPurchaseCredential: null,
      },
      plan: "starter",
    },
  };
  const prior = deriveSubscriptionTransition(null, {
    ...cancelled,
    requested: { ...cancelled.requested, kind: "activatePaid" },
    idempotencyKey: "a1",
    source: "androidValidation",
    eventSource: "callable",
  }).next;
  const d = deriveSubscriptionTransition(prior, cancelled);
  assert.equal(d.next.billingStatus, "cancelled");
  assert.equal(d.next.entitlementActive, true);
  assert.equal(d.next.plan, "starter");
}

{
  const refund: TransitionRequest = {
    uid: "u1",
    source: "rtdn",
    eventSource: "webhook",
    idempotencyKey: "r1",
    occurredAt: NOW,
    nowMs: NOW,
    requested: { kind: "refund", accessRevoked: true },
  };
  const d = deriveSubscriptionTransition(null, refund);
  assert.equal(d.next.entitlementActive, false);
  assert.equal(d.next.plan, "free");
}

console.log("transition.unit.test.ts: ok");
