/**
 * Rate-limit helper: 5/min purchase, 10/hour refresh, server clock.
 * Run: npm run test:billing-rate-limit
 */

import assert from "node:assert/strict";

import { BillingError } from "./errors";
import {
  consumeBillingRateLimit,
  PURCHASE_VALIDATION_LIMIT,
  PURCHASE_VALIDATION_WINDOW_MS,
  SUBSCRIPTION_REFRESH_LIMIT,
  SUBSCRIPTION_REFRESH_WINDOW_MS,
} from "./rateLimit";
import { MemoryBillingStore } from "./store";

const DIAG = "abc123def4567890";
const T0 = 1_800_000_000_000;

async function expectRateLimited(p: Promise<unknown>) {
  await assert.rejects(p, (e: unknown) => e instanceof BillingError && e.clientCode === "rate_limited");
}

async function main() {
  {
    const store = new MemoryBillingStore();
    for (let i = 1; i <= PURCHASE_VALIDATION_LIMIT; i += 1) {
      const r = await consumeBillingRateLimit(store, {
        op: "purchaseValidation",
        diagnosticUid: DIAG,
        nowMs: T0,
      });
      assert.equal(r.count, i);
    }
    await expectRateLimited(
      consumeBillingRateLimit(store, { op: "purchaseValidation", diagnosticUid: DIAG, nowMs: T0 })
    );
    const reset = await consumeBillingRateLimit(store, {
      op: "purchaseValidation",
      diagnosticUid: DIAG,
      nowMs: T0 + PURCHASE_VALIDATION_WINDOW_MS,
    });
    assert.equal(reset.count, 1);
  }

  {
    const store = new MemoryBillingStore();
    for (let i = 1; i <= SUBSCRIPTION_REFRESH_LIMIT; i += 1) {
      const r = await consumeBillingRateLimit(store, {
        op: "subscriptionRefresh",
        diagnosticUid: DIAG,
        nowMs: T0,
      });
      assert.equal(r.count, i);
    }
    await expectRateLimited(
      consumeBillingRateLimit(store, { op: "subscriptionRefresh", diagnosticUid: DIAG, nowMs: T0 })
    );
    const reset = await consumeBillingRateLimit(store, {
      op: "subscriptionRefresh",
      diagnosticUid: DIAG,
      nowMs: T0 + SUBSCRIPTION_REFRESH_WINDOW_MS,
    });
    assert.equal(reset.count, 1);
  }

  {
    const store = new MemoryBillingStore();
    await consumeBillingRateLimit(store, {
      op: "purchaseValidation",
      diagnosticUid: DIAG,
      nowMs: T0,
    });
    const keys = [...store.docs.keys()];
    assert.ok(keys.every((k) => k.startsWith("_billingRateLimits/purchaseValidation_")));
    assert.ok(keys.every((k) => !k.includes("firebase-uid")));
  }

  console.log("rateLimit.unit.test.ts: ok");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
