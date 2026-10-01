import assert from "node:assert/strict";

import {
  DOMAIN_DISABLED_MAPS_TO,
  FOREIGN_LEDGER_MAPS_TO,
  GRIN_CONTRACT_REVISION,
  evidenceVerificationOfState,
} from "./ports";

assert.equal(GRIN_CONTRACT_REVISION, "2026-10-01.wave1b");
assert.equal(DOMAIN_DISABLED_MAPS_TO, "policy_denied");
assert.equal(FOREIGN_LEDGER_MAPS_TO, "forbidden");
assert.equal(evidenceVerificationOfState("reserved"), "pending");
assert.equal(evidenceVerificationOfState("uploading"), "pending");
assert.equal(evidenceVerificationOfState("uploaded_unverified"), "pending");
assert.equal(evidenceVerificationOfState("orphan_pending_review"), "pending");
assert.equal(evidenceVerificationOfState("rejected"), "failed");
assert.equal(evidenceVerificationOfState("verified"), "verified");
assert.equal(evidenceVerificationOfState("linked"), "verified");
console.log("goodsEvidence/ports.contract.test.ts: ok");
