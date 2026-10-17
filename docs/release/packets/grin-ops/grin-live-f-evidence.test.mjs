import test from "node:test";
import assert from "node:assert/strict";
import {
  assertConfirmedProjection,
  assertReplayPreservesIssuance,
  assertUnauthenticatedDenial,
} from "./grin-live-f-evidence.mjs";

test("unauthenticated denial requires expected authentication-denial result", () => {
  assert.equal(
    assertUnauthenticatedDenial(200, { ok: false, code: "unauthenticated" }),
    true,
  );
  assert.equal(assertUnauthenticatedDenial(401, { ok: false, code: "UNAUTHENTICATED" }), true);
  assert.equal(assertUnauthenticatedDenial(200, { ok: false, code: "policy_denied" }), false);
  assert.equal(assertUnauthenticatedDenial(200, { ok: true }), false);
});

test("confirmation requires receipt identity and version/hash", () => {
  assert.equal(
    assertConfirmedProjection(
      { receiptId: "receiptl01", eventVersion: 1, headHash: "abc", original: { ownerUid: "u1", receiptId: "receiptl01" } },
      { receiptId: "receiptl01", ownerUid: "u1" },
    ).ok,
    true,
  );
  assert.equal(
    assertConfirmedProjection({ receiptId: "other" }, { receiptId: "receiptl01", ownerUid: "u1" })
      .reason,
    "receipt_mismatch",
  );
  assert.equal(
    assertConfirmedProjection(
      { receiptId: "receiptl01", original: { ownerUid: "other" } },
      { receiptId: "receiptl01", ownerUid: "u1" },
    ).reason,
    "owner_mismatch",
  );
  assert.equal(
    assertConfirmedProjection({ receiptId: "receiptl01" }, { receiptId: "receiptl01", ownerUid: "u1" })
      .reason,
    "missing_version_or_hash",
  );
});

test("replay must preserve issued number and receipt id", () => {
  assert.equal(
    assertReplayPreservesIssuance(
      { ok: true, issuedNumber: 7, receiptId: "receiptl01" },
      { ok: true, replayed: true, issuedNumber: 7, receiptId: "receiptl01" },
    ),
    true,
  );
  assert.equal(
    assertReplayPreservesIssuance(
      { ok: true, issuedNumber: 7, receiptId: "receiptl01" },
      { ok: true, replayed: true, issuedNumber: 8, receiptId: "receiptl01" },
    ),
    false,
  );
  assert.equal(
    assertReplayPreservesIssuance(
      { ok: true, issuedNumber: 7, receiptId: "receiptl01" },
      { ok: true, replayed: true, issuedNumber: 7, receiptId: "other" },
    ),
    false,
  );
});
