/**
 * Pure transition derivation (no persistence): exact-catalog SKU resolution,
 * reconciliation contract, trial eligibility, refund revocation.
 * Run: npm run test:billing-transition
 */

import assert from "node:assert/strict";

import { BillingError } from "./errors";
import {
  deriveSubscriptionTransition,
  isTrialEligiblePriorState,
  type TransitionRequest,
  type VerifiedPlatformEvent,
} from "./transition";
import { TRIAL_DURATION_DAYS, type SubscriptionStatusDoc } from "./types";

const NOW = 1_800_000_000_000;
const FUTURE = NOW + 10 * 86_400_000;

function isCause(code: string) {
  return (e: unknown) => e instanceof BillingError && e.causeCode === code;
}

function androidEvent(overrides: Partial<VerifiedPlatformEvent> = {}): VerifiedPlatformEvent {
  return {
    platform: "android",
    canonicalSku: "vyd_professional_monthly",
    productId: "vyd_professional",
    basePlanId: "monthly",
    currentPeriodStart: NOW - 1000,
    currentPeriodEnd: FUTURE,
    autoRenewing: true,
    latestOrderId: "GPA.1",
    originalTransactionId: null,
    credentialFingerprint: null,
    encryptedPurchaseCredential: null,
    reconciledAt: NOW,
    ...overrides,
  };
}

function activate(
  ev: VerifiedPlatformEvent,
  plan?: TransitionRequest["requested"]["plan"]
): TransitionRequest {
  return {
    uid: "u1",
    source: "androidValidation",
    eventSource: "callable",
    idempotencyKey: "a1",
    occurredAt: NOW,
    nowMs: NOW,
    requested: { kind: "activatePaid", plan, platformEvent: ev },
  };
}

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

// ——— EXACT catalog SKU resolution (substring inference removed) ———
{
  // known professional SKU resolves to professional
  const pro = deriveSubscriptionTransition(null, activate(androidEvent()));
  assert.equal(pro.next.plan, "professional");

  // known business SKU resolves to business
  const biz = deriveSubscriptionTransition(
    null,
    activate(
      androidEvent({
        canonicalSku: "vyd_business_yearly",
        productId: "vyd_business",
        basePlanId: "yearly",
      })
    )
  );
  assert.equal(biz.next.plan, "business");

  // unknown SKU crafted to pass substring checks → rejected
  assert.throws(
    () =>
      deriveSubscriptionTransition(
        null,
        activate(androidEvent({ canonicalSku: "evil_business_fake" }))
      ),
    isCause("unknown_canonical_sku")
  );

  // near-miss/malformed SKU → rejected (no fuzzy matching)
  assert.throws(
    () =>
      deriveSubscriptionTransition(
        null,
        activate(androidEvent({ canonicalSku: "vyd_profesional_monthly" }))
      ),
    isCause("unknown_canonical_sku")
  );

  // known SKU whose plan conflicts with the requested plan → rejected
  // (never silently prefer either side)
  assert.throws(
    () =>
      deriveSubscriptionTransition(
        null,
        activate(
          androidEvent({
            canonicalSku: "vyd_starter_monthly",
            productId: "vyd_starter",
          }),
          "business"
        )
      ),
    isCause("sku_plan_mismatch")
  );

  // catalog mapping consistency: SKU with the WRONG store product id → rejected
  assert.throws(
    () =>
      deriveSubscriptionTransition(
        null,
        activate(androidEvent({ productId: "vyd_business" }))
      ),
    isCause("sku_product_mismatch")
  );

  // activatePaid without a platform event → rejected
  assert.throws(
    () =>
      deriveSubscriptionTransition(null, {
        ...activate(androidEvent()),
        requested: { kind: "activatePaid", plan: "professional" },
      }),
    isCause("missing_platform_event")
  );

  // missing/invalid reconciliation timestamp → rejected (contract)
  assert.throws(
    () =>
      deriveSubscriptionTransition(
        null,
        activate(androidEvent({ reconciledAt: Number.NaN }))
      ),
    isCause("platform_event_not_reconciled")
  );
}

// ——— trial eligibility is enforced in the pure engine (fail closed) ———
{
  const paidPrior = deriveSubscriptionTransition(null, activate(androidEvent())).next;
  assert.throws(
    () => deriveSubscriptionTransition(paidPrior, trialReq),
    isCause("trial_prior_state_ineligible")
  );
  assert.equal(isTrialEligiblePriorState(null), true);
  assert.equal(isTrialEligiblePriorState(paidPrior), false);
  const neverSubscribed: SubscriptionStatusDoc = {
    plan: "free",
    billingStatus: "expired",
    entitlementActive: false,
    entitlementReason: "neverSubscribed",
    trialStartedAt: null,
    trialEndsAt: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    platform: null,
    productId: null,
    basePlanId: null,
    autoRenewing: false,
    cancelledAt: null,
    gracePeriodEndsAt: null,
    scheduledPlan: null,
    quotaEnforcementEnabled: false,
    updatedAt: NOW,
    updatedBy: "admin",
  };
  assert.equal(isTrialEligiblePriorState(neverSubscribed), true);
  const expiredPaid = { ...neverSubscribed, entitlementReason: "subscriptionExpired" as const };
  assert.equal(isTrialEligiblePriorState(expiredPaid), false);
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
      platformEvent: androidEvent({
        canonicalSku: "vyd_starter_monthly",
        productId: "vyd_starter",
        autoRenewing: false,
      }),
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

{
  const priorPaid = deriveSubscriptionTransition(null, {
    uid: "u1",
    source: "androidValidation",
    eventSource: "callable",
    idempotencyKey: "rf-a",
    occurredAt: NOW,
    nowMs: NOW,
    requested: {
      kind: "activatePaid",
      plan: "professional",
      platformEvent: androidEvent({
        canonicalSku: "vyd_professional_monthly",
        productId: "vyd_professional",
      }),
    },
  }).next;
  const recorded = deriveSubscriptionTransition(priorPaid, {
    uid: "u1",
    source: "rtdn",
    eventSource: "webhook",
    idempotencyKey: "rf-1",
    occurredAt: NOW + 1_000,
    nowMs: NOW + 1_000,
    requested: {
      kind: "recordFinancial",
      financialEvent: {
        financialEventId: "android:refund:GPA.RF",
        eventType: "refund",
        platform: "android",
        canonicalSku: "vyd_professional_monthly",
        grossAmountInPaise: 24_900,
        actualPlatformCommissionInPaise: null,
        estimatedPlatformCommissionInPaise: null,
        occurredAt: NOW + 1_000,
        relatedFinancialEventId: "android:purchase:GPA.RF",
      },
      googleSubscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
    },
  });
  assert.equal(recorded.next.entitlementActive, true);
  assert.equal(recorded.next.billingStatus, "active");
  assert.equal(recorded.next.plan, "professional");
  assert.equal(recorded.ledger?.eventType, "refund");
  assert.equal(recorded.history?.type, "refunded");
}

console.log("transition.unit.test.ts: ok");
