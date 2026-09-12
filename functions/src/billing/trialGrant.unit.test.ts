/**
 * Trial ledger: one grant, replay, recreate-deny, override consume.
 * Run: npm run test:billing-trial-grant
 */

import assert from "node:assert/strict";

import { diagnosticUidHmac } from "./diagnosticUid";
import { BillingError } from "./errors";
import { MemoryBillingStore } from "./store";
import { trialIdentityHmac } from "./trialIdentity";
import { grantProfessionalTrial } from "./trialGrant";
import { TRIAL_DURATION_DAYS } from "./types";

const TRIAL_SECRET = "unit-test-only-trial-identity-secret-0123456789";
const DIAG_SECRET = "unit-test-only-billing-diag-uid-secret-0001";
const PHONE = "+919876543210";
const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

async function main() {
  const identity = trialIdentityHmac(TRIAL_SECRET, PHONE);

  // first grant
  {
    const store = new MemoryBillingStore();
    const r = await grantProfessionalTrial(store, {
      uid: "uid-1",
      phoneE164: PHONE,
      trialIdentitySecret: TRIAL_SECRET,
      billingDiagUidSecret: DIAG_SECRET,
      nowMs: NOW,
    });
    assert.equal(r.alreadyProcessed, false);
    assert.equal(r.trialIdentityHmac, identity);
    assert.equal(r.trialEndsAt, NOW + TRIAL_DURATION_DAYS * DAY);
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
  }

  // duplicate grant (same uid) → idempotent
  {
    const store = new MemoryBillingStore();
    const input = {
      uid: "uid-1",
      phoneE164: PHONE,
      trialIdentitySecret: TRIAL_SECRET,
      billingDiagUidSecret: DIAG_SECRET,
      nowMs: NOW,
    };
    const a = await grantProfessionalTrial(store, input);
    const b = await grantProfessionalTrial(store, input);
    assert.equal(a.alreadyProcessed, false);
    assert.equal(b.alreadyProcessed, true);
    const statuses = [...store.docs.keys()].filter((k) => k.endsWith("/subscription/status"));
    assert.equal(statuses.length, 1);
  }

  // delete/recreate same phone hash → no second trial
  {
    const store = new MemoryBillingStore();
    await grantProfessionalTrial(store, {
      uid: "uid-old",
      phoneE164: PHONE,
      trialIdentitySecret: TRIAL_SECRET,
      billingDiagUidSecret: DIAG_SECRET,
      nowMs: NOW,
    });
    await assert.rejects(
      grantProfessionalTrial(store, {
        uid: "uid-new",
        phoneE164: "+91 98765 43210",
        trialIdentitySecret: TRIAL_SECRET,
        billingDiagUidSecret: DIAG_SECRET,
        nowMs: NOW + 1000,
      }),
      (e: unknown) => e instanceof BillingError && e.causeCode === "trial_already_used"
    );
  }

  // overrideAllowed consumed safely
  {
    const store = new MemoryBillingStore();
    await grantProfessionalTrial(store, {
      uid: "uid-old",
      phoneE164: PHONE,
      trialIdentitySecret: TRIAL_SECRET,
      billingDiagUidSecret: DIAG_SECRET,
      nowMs: NOW,
    });
    store.docs.get(`_trialLedger/${identity}`)!.overrideAllowed = true;
    const granted = await grantProfessionalTrial(store, {
      uid: "uid-new",
      phoneE164: PHONE,
      trialIdentitySecret: TRIAL_SECRET,
      billingDiagUidSecret: DIAG_SECRET,
      nowMs: NOW + 2000,
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
        uid: "uid-third",
        phoneE164: PHONE,
        trialIdentitySecret: TRIAL_SECRET,
        billingDiagUidSecret: DIAG_SECRET,
        nowMs: NOW + 3000,
        consumeOverride: true,
      }),
      (e: unknown) => e instanceof BillingError && e.causeCode === "trial_override_not_allowed"
    );
  }

  // bad secret fail closed
  assert.throws(() =>
    trialIdentityHmac("short", PHONE)
  );

  console.log("trialGrant.unit.test.ts: ok");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
