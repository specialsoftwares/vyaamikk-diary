import assert from "node:assert/strict";

import { AppError } from "@/domain/errors";
import { syncSessionOwnership } from "@/sync/syncSessionOwnership";

import { __setQuotaUpsellEnabledForTests } from "./quotaUpsellGate";
import { decideQuotaUpsellEligibility } from "./quotaUpsellDecision";
import {
  notifyOrdinaryQuotaUpsell,
  registerQuotaUpsellPresenter,
} from "./notifyOrdinaryQuotaUpsell";
import type { QuotaUpsellRequest } from "./quotaUpsellTypes";

function req(over: Partial<QuotaUpsellRequest> = {}): QuotaUpsellRequest {
  return {
    family: "diary",
    origin: "user_save",
    clientRecordId: "rec_1",
    session: syncSessionOwnership.capture(),
    failureKind: "quota_exhausted",
    ...over,
  };
}

syncSessionOwnership.resetForTests();
syncSessionOwnership.beginSession("uid-a");
__setQuotaUpsellEnabledForTests(true);

assert.equal(decideQuotaUpsellEligibility(req()).ok, true, "ordinary quota user_save is eligible");

assert.equal(
  decideQuotaUpsellEligibility(req({ family: "purchase_order" })).ok,
  true
);
assert.equal(
  decideQuotaUpsellEligibility(req({ family: "customer_credit" })).ok,
  true
);
assert.equal(
  decideQuotaUpsellEligibility(req({ family: "professional_pack" })).ok,
  true
);

assert.deepEqual(
  decideQuotaUpsellEligibility(req({ family: "letterhead" })),
  { ok: false, reason: "exempt_family" }
);
assert.deepEqual(
  decideQuotaUpsellEligibility(req({ family: "letterhead_matter" })),
  { ok: false, reason: "exempt_family" }
);

for (const kind of [
  "quota_state_invalid",
  "permission_denied",
  "unauthenticated",
  "network",
  "unknown",
] as const) {
  assert.deepEqual(
    decideQuotaUpsellEligibility(req({ failureKind: kind })),
    { ok: false, reason: "not_quota_exhausted" },
    kind
  );
}

assert.deepEqual(
  decideQuotaUpsellEligibility(
    req({
      failureKind: undefined,
      error: new AppError("permission_denied", "rules"),
    })
  ),
  { ok: false, reason: "not_quota_exhausted" }
);

assert.deepEqual(
  decideQuotaUpsellEligibility(req({ origin: "background_sync" })),
  { ok: false, reason: "background_origin" }
);

assert.deepEqual(
  decideQuotaUpsellEligibility(req({ clientRecordId: "" })),
  { ok: false, reason: "missing_record_id" }
);

const stale = syncSessionOwnership.capture();
syncSessionOwnership.beginSession("uid-b");
assert.deepEqual(decideQuotaUpsellEligibility(req({ session: stale })), {
  ok: false,
  reason: "session_stale",
});
syncSessionOwnership.endSession();
syncSessionOwnership.beginSession("uid-a");
assert.deepEqual(decideQuotaUpsellEligibility(req({ session: stale })), {
  ok: false,
  reason: "session_stale",
});

__setQuotaUpsellEnabledForTests(false);
assert.deepEqual(decideQuotaUpsellEligibility(req({ session: syncSessionOwnership.capture() })), {
  ok: false,
  reason: "gate_off",
});
__setQuotaUpsellEnabledForTests(true);

registerQuotaUpsellPresenter(null);
const noHost = notifyOrdinaryQuotaUpsell(req({ session: syncSessionOwnership.capture() }));
assert.equal(noHost.ok, false);
assert.equal(noHost.ok === false && noHost.reason, "no_host");

let presented = 0;
registerQuotaUpsellPresenter((request) => {
  presented += 1;
  return { ok: true, visible: true, clientRecordId: request.clientRecordId ?? null };
});
assert.equal(notifyOrdinaryQuotaUpsell(req({ family: "letterhead" })).ok, false);
assert.equal(presented, 0, "letterhead must not reach the host");
assert.equal(
  notifyOrdinaryQuotaUpsell(req({ origin: "background_sync" })).ok,
  false
);
assert.equal(presented, 0);
assert.equal(notifyOrdinaryQuotaUpsell(req({ session: syncSessionOwnership.capture() })).ok, true);
assert.equal(presented, 1);

registerQuotaUpsellPresenter(null);
__setQuotaUpsellEnabledForTests(null);
syncSessionOwnership.resetForTests();
console.log("quotaUpsellDecision.test.ts: ok");
