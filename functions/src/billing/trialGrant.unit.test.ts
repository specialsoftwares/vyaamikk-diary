/**
 * Trial ledger: one grant, replay (no extension), recreate-deny, override
 * consume, opaque idempotency key, paid-access protection, value privacy.
 * Run: npm run test:billing-trial-grant
 */

import assert from "node:assert/strict";

import { diagnosticUidHmac } from "./diagnosticUid";
import { BillingError } from "./errors";
import { subscriptionStatusPath, trialLedgerPath } from "./paths";
import { MemoryBillingStore } from "./store";
import { trialIdentityHmac } from "./trialIdentity";
import { grantProfessionalTrial, opaqueTrialIdempotencyKey } from "./trialGrant";
import { TRIAL_DURATION_DAYS, type SubscriptionStatusDoc } from "./types";

const TRIAL_SECRET = "unit-test-only-trial-identity-secret-0123456789";
const DIAG_SECRET = "unit-test-only-billing-diag-uid-secret-0001";
const PHONE = "+919876543210";
const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

function isCause(code: string) {
  return (e: unknown) => e instanceof BillingError && e.causeCode === code;
}

function grantInput(uid: string, phone: string, nowMs = NOW) {
  return {
    uid,
    phoneE164: phone,
    trialIdentitySecret: TRIAL_SECRET,
    billingDiagUidSecret: DIAG_SECRET,
    nowMs,
  };
}

function seedStatus(
  store: MemoryBillingStore,
  uid: string,
  overrides: Partial<SubscriptionStatusDoc>
): void {
  const doc: SubscriptionStatusDoc = {
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
    updatedAt: NOW - DAY,
    updatedBy: "admin",
    ...overrides,
  };
  store.docs.set(subscriptionStatusPath(uid), doc as unknown as Record<string, unknown>);
}

async function main() {
  const identity = trialIdentityHmac(TRIAL_SECRET, PHONE);

  // first grant — and the result exposes NO trial identity material
  {
    const store = new MemoryBillingStore();
    const r = await grantProfessionalTrial(store, grantInput("uid-1", PHONE));
    assert.equal(r.alreadyProcessed, false);
    assert.equal(r.trialEndsAt, NOW + TRIAL_DURATION_DAYS * DAY);
    assert.ok(!("trialIdentityHmac" in r), "identity HMAC must not be returned to callers");
    assert.ok(!JSON.stringify(r).includes(identity));
    const status = store.docs.get("users/uid-1/subscription/status");
    assert.equal(status?.plan, "professional");
    assert.equal(status?.billingStatus, "trial");
    assert.equal(status?.entitlementActive, true);
    const ledger = store.docs.get(`_trialLedger/${identity}`);
    assert.equal(ledger?.trialUsed, true);
    assert.equal(ledger?.overrideAllowed, false);
    assert.ok(!JSON.stringify(ledger).includes("9876543210"));
    assert.ok(!JSON.stringify(ledger).includes(PHONE));
    assert.equal(ledger?.lastAccountUidDiagnostic, diagnosticUidHmac(DIAG_SECRET, "uid-1"));

    // OPAQUE idempotency key + value-level privacy across ALL persisted docs:
    // no raw uid, no raw/normalized phone, no trial identity HMAC anywhere in
    // audit/processed values (the ledger doc id itself IS the identity HMAC
    // by schema design; its values stay clean).
    const diag = diagnosticUidHmac(DIAG_SECRET, "uid-1");
    const expectedKey = opaqueTrialIdempotencyKey(identity, diag, "normal");
    assert.match(expectedKey, /^trial:[0-9a-f]{64}$/);
    assert.ok(!expectedKey.includes("uid-1"));
    assert.ok(!expectedKey.includes(identity));
    let auditCount = 0;
    for (const [path, doc] of store.docs) {
      if (path.startsWith("_subscriptionAuditLog/") || path.startsWith("_processedBillingEvents/")) {
        const serialized = JSON.stringify(doc);
        assert.ok(!serialized.includes("uid-1"), `${path} leaks raw uid`);
        assert.ok(!serialized.includes(PHONE), `${path} leaks raw phone`);
        assert.ok(!serialized.includes("9876543210"), `${path} leaks normalized phone`);
        assert.ok(!serialized.includes(identity), `${path} leaks trial identity HMAC`);
        if (path.startsWith("_subscriptionAuditLog/")) {
          assert.equal(doc.idempotencyKey, expectedKey);
          auditCount += 1;
        }
      }
    }
    assert.equal(auditCount, 1);
  }

  // duplicate grant (same uid, same clock) → idempotent
  {
    const store = new MemoryBillingStore();
    const a = await grantProfessionalTrial(store, grantInput("uid-1", PHONE));
    const b = await grantProfessionalTrial(store, grantInput("uid-1", PHONE));
    assert.equal(a.alreadyProcessed, false);
    assert.equal(b.alreadyProcessed, true);
    const statuses = [...store.docs.keys()].filter((k) => k.endsWith("/subscription/status"));
    assert.equal(statuses.length, 1);
  }

  // retried grant DAYS later → idempotent and the trial is NOT extended
  {
    const store = new MemoryBillingStore();
    const a = await grantProfessionalTrial(store, grantInput("uid-1", PHONE));
    const b = await grantProfessionalTrial(store, grantInput("uid-1", PHONE, NOW + 5 * DAY));
    assert.equal(b.alreadyProcessed, true);
    assert.equal(b.trialEndsAt, a.trialEndsAt, "existing trial must not be extended");
    const status = store.docs.get("users/uid-1/subscription/status");
    assert.equal(status?.trialEndsAt, NOW + TRIAL_DURATION_DAYS * DAY);
  }

  // delete/recreate same phone hash → no second trial
  {
    const store = new MemoryBillingStore();
    await grantProfessionalTrial(store, grantInput("uid-old", PHONE));
    await assert.rejects(
      grantProfessionalTrial(store, grantInput("uid-new", "+91 98765 43210", NOW + 1000)),
      isCause("trial_already_used")
    );
  }

  // PAID-ACCESS PROTECTION: trial may only follow "no prior" or an explicit
  // server-created never-subscribed state. Every paid-owning or trial prior
  // state rejects fail-closed and leaves NO trial ledger row behind.
  {
    const ineligible: Array<[string, Partial<SubscriptionStatusDoc>]> = [
      [
        "active starter",
        {
          plan: "starter",
          billingStatus: "active",
          entitlementActive: true,
          entitlementReason: "storeSubscriptionActive",
          platform: "android",
          productId: "vyd_starter",
          basePlanId: "monthly",
          currentPeriodStart: NOW - DAY,
          currentPeriodEnd: NOW + 20 * DAY,
          autoRenewing: true,
        },
      ],
      [
        "active business",
        {
          plan: "business",
          billingStatus: "active",
          entitlementActive: true,
          entitlementReason: "storeSubscriptionActive",
          platform: "android",
          productId: "vyd_business",
          basePlanId: "yearly",
          currentPeriodStart: NOW - DAY,
          currentPeriodEnd: NOW + 300 * DAY,
          autoRenewing: true,
        },
      ],
      [
        "grace professional",
        {
          plan: "professional",
          billingStatus: "grace",
          entitlementActive: true,
          entitlementReason: "graceRetained",
          platform: "android",
          productId: "vyd_professional",
          basePlanId: "monthly",
          currentPeriodStart: NOW - 31 * DAY,
          currentPeriodEnd: NOW - DAY,
          gracePeriodEndsAt: NOW + 2 * DAY,
          autoRenewing: true,
        },
      ],
      [
        "cancelled but period active",
        {
          plan: "professional",
          billingStatus: "cancelled",
          entitlementActive: true,
          entitlementReason: "cancelledPeriodRemaining",
          platform: "android",
          productId: "vyd_professional",
          basePlanId: "monthly",
          currentPeriodStart: NOW - 10 * DAY,
          currentPeriodEnd: NOW + 10 * DAY,
          cancelledAt: NOW - DAY,
        },
      ],
      [
        "expired historical paid",
        {
          plan: "free",
          billingStatus: "expired",
          entitlementActive: false,
          entitlementReason: "subscriptionExpired",
          platform: "android",
          productId: "vyd_professional",
          basePlanId: "monthly",
          currentPeriodStart: NOW - 60 * DAY,
          currentPeriodEnd: NOW - 30 * DAY,
        },
      ],
    ];
    let phoneSuffix = 700_000;
    for (const [label, prior] of ineligible) {
      const store = new MemoryBillingStore();
      const uid = `uid-paid-${phoneSuffix}`;
      const phone = `+91980${phoneSuffix}0`;
      phoneSuffix += 1;
      seedStatus(store, uid, prior);
      await assert.rejects(
        grantProfessionalTrial(store, grantInput(uid, phone, NOW + 1000)),
        isCause("trial_prior_state_ineligible"),
        `expected rejection for prior state: ${label}`
      );
      const id = trialIdentityHmac(TRIAL_SECRET, phone);
      assert.ok(
        !store.docs.has(trialLedgerPath(id)),
        `rejected grant must not consume the trial ledger (${label})`
      );
      const after = store.docs.get(subscriptionStatusPath(uid));
      assert.equal(after?.plan, prior.plan, `status must be untouched (${label})`);
      assert.equal(after?.billingStatus, prior.billingStatus);
    }
  }

  // explicit server-created never-subscribed placeholder IS eligible
  {
    const store = new MemoryBillingStore();
    seedStatus(store, "uid-fresh", {});
    const r = await grantProfessionalTrial(store, grantInput("uid-fresh", "+919807000990"));
    assert.equal(r.alreadyProcessed, false);
    assert.equal(
      store.docs.get(subscriptionStatusPath("uid-fresh"))?.billingStatus,
      "trial"
    );
  }

  // overrideAllowed consumed safely; override cannot bypass paid protection
  {
    const store = new MemoryBillingStore();
    await grantProfessionalTrial(store, grantInput("uid-old", PHONE));
    store.docs.get(`_trialLedger/${identity}`)!.overrideAllowed = true;

    // override attempt for an account with ACTIVE PAID access → rejected,
    // override NOT consumed, zero writes
    seedStatus(store, "uid-paid-override", {
      plan: "business",
      billingStatus: "active",
      entitlementActive: true,
      entitlementReason: "storeSubscriptionActive",
      platform: "android",
      productId: "vyd_business",
      basePlanId: "monthly",
      currentPeriodEnd: NOW + 20 * DAY,
    });
    await assert.rejects(
      grantProfessionalTrial(store, {
        ...grantInput("uid-paid-override", PHONE, NOW + 1500),
        consumeOverride: true,
      }),
      isCause("trial_prior_state_ineligible")
    );
    assert.equal(
      store.docs.get(`_trialLedger/${identity}`)?.overrideAllowed,
      true,
      "failed override grant must not consume the override flag"
    );

    const granted = await grantProfessionalTrial(store, {
      ...grantInput("uid-new", PHONE, NOW + 2000),
      consumeOverride: true,
    });
    assert.equal(granted.alreadyProcessed, false);
    assert.equal(store.docs.get(`_trialLedger/${identity}`)?.overrideAllowed, false);
    assert.equal(
      store.docs.get("users/uid-new/subscription/status")?.entitlementActive,
      true
    );
    await assert.rejects(
      grantProfessionalTrial(store, {
        ...grantInput("uid-third", PHONE, NOW + 3000),
        consumeOverride: true,
      }),
      isCause("trial_override_not_allowed")
    );
  }

  // bad secret fail closed
  assert.throws(() => trialIdentityHmac("short", PHONE));

  console.log("trialGrant.unit.test.ts: ok");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
