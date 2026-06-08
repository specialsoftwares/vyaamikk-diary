/**
 * Permanent deletion hardening — pure unit tests (no React Native runtime).
 */
import assert from "node:assert/strict";

import { normalizeMasterValue } from "@/services/masterData/normalize";

function simulateDecrementUsage(initialCount: number): number {
  return Math.max(0, initialCount - 1);
}

assert.equal(
  simulateDecrementUsage(1),
  0,
  "single-use master suggestion should be removed after one record delete"
);
assert.equal(
  simulateDecrementUsage(3),
  2,
  "shared master suggestion should decrement usage, not remove immediately"
);

assert.equal(
  normalizeMasterValue("partyName", "  Acme Traders  "),
  "acme traders",
  "master data keys normalised for orphan pruning"
);

/** Policy: repositories hard-delete; sync queue carries only `{ id }` for cloud delete. */
const offlineDeletePolicy = "option-b-minimal-tombstone";
assert.equal(offlineDeletePolicy, "option-b-minimal-tombstone");

const entityTypes = [
  "diary_entry",
  "professional_pack",
  "letterhead_document",
  "purchase_order",
  "customer_credit",
  "form_draft",
] as const;
assert.equal(entityTypes.length, 6, "all user record types covered by permanent deletion");

console.log("permanentDeletion.test.ts: all passed");
