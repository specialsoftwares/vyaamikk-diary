/**
 * PURE_DOMAIN — storage accounting helper regressions for S1/S2.
 * Not the sole proof; adapter + emulator tests cover persistence.
 */
import assert from "node:assert/strict";

import {
  FIRESTORE_MAX_DOCUMENT_BYTES,
  GIB,
  MAX_STORAGE_HOLDS,
  OWNER_ALTERNATIVE_STORAGE_CAPS_BYTES,
  OWNER_SELECTED_STORAGE_CAPS_BYTES,
  PROPOSED_PENDING_OWNER_CONFIRMATION_STORAGE_CAPS_BYTES,
  admitStorageReservation,
  chargedStorageBytes,
  derivativeHoldKey,
  encodeStorageHoldKey,
  estimateStorageAccountingDocumentBytes,
  originalHoldKey,
  parseStorageAccounting,
  parseStorageHoldKey,
  proposedPdfOriginalWorkloadBlockedByHoldsMap,
  repairStorageAccounting,
  retainStorageHold,
  releaseReservedHold,
  sampleMaxLengthHolds,
  storageCapBytesFromStatus,
  type StorageAccountingDoc,
  type StorageHoldIdentity,
} from "./storageQuota";

const LEDGER = "ledger_s1";
const OLD: StorageHoldIdentity = { kind: "original", ledgerId: LEDGER, evidenceId: "ev_old" };
const NEW: StorageHoldIdentity = { kind: "original", ledgerId: LEDGER, evidenceId: "ev_new" };
const STAMP = "2026-10-01T00:00:01.000Z";

function retainedHoldDoc(counters: Partial<StorageAccountingDoc>): StorageAccountingDoc {
  return {
    schemaVersion: 1,
    reservedOriginalBytes: 0,
    retainedOriginalBytes: 900,
    reservedDerivativeBytes: 0,
    retainedDerivativeBytes: 0,
    holds: {
      [originalHoldKey(LEDGER, "ev_old")]: { kind: "original", bytes: 900, phase: "retained" },
    },
    updatedAtUtc: "2026-10-01T00:00:00.000Z",
    ...counters,
  };
}

function admitNew200(existing: StorageAccountingDoc | null) {
  return admitStorageReservation({
    existing,
    identity: NEW,
    bytes: 200,
    capBytes: 1000,
    updatedAtUtc: STAMP,
  });
}

async function main(): Promise<void> {
  assert.equal(MAX_STORAGE_HOLDS, 2500);
  assert.ok(MAX_STORAGE_HOLDS < Number.POSITIVE_INFINITY, "2500 is not an unlimited-files promise");
  assert.equal(OWNER_SELECTED_STORAGE_CAPS_BYTES.starter, 1 * GIB);
  assert.equal(OWNER_SELECTED_STORAGE_CAPS_BYTES.professional, 3 * GIB);
  assert.equal(OWNER_SELECTED_STORAGE_CAPS_BYTES.business, 10 * GIB);
  assert.equal(PROPOSED_PENDING_OWNER_CONFIRMATION_STORAGE_CAPS_BYTES.professional, 5 * GIB);
  assert.equal(PROPOSED_PENDING_OWNER_CONFIRMATION_STORAGE_CAPS_BYTES.business, 20 * GIB);
  assert.equal(OWNER_ALTERNATIVE_STORAGE_CAPS_BYTES.starter, 256 * 1024 * 1024);
  assert.equal(OWNER_ALTERNATIVE_STORAGE_CAPS_BYTES.professional, 1 * GIB);
  assert.equal(OWNER_ALTERNATIVE_STORAGE_CAPS_BYTES.business, 5 * GIB);
  assert.equal(
    storageCapBytesFromStatus(
      { quotaEnforcementEnabled: true, entitlementActive: true, plan: "starter" },
      true
    ),
    OWNER_SELECTED_STORAGE_CAPS_BYTES.starter
  );
  assert.equal(
    storageCapBytesFromStatus(
      { quotaEnforcementEnabled: true, entitlementActive: true, plan: "professional" },
      true
    ),
    OWNER_SELECTED_STORAGE_CAPS_BYTES.professional
  );
  assert.equal(
    storageCapBytesFromStatus(
      { quotaEnforcementEnabled: true, entitlementActive: true, plan: "business" },
      true
    ),
    OWNER_SELECTED_STORAGE_CAPS_BYTES.business
  );
  assert.notEqual(
    storageCapBytesFromStatus(
      { quotaEnforcementEnabled: true, entitlementActive: true, plan: "professional" },
      true
    ),
    PROPOSED_PENDING_OWNER_CONFIRMATION_STORAGE_CAPS_BYTES.professional
  );
  assert.notEqual(
    storageCapBytesFromStatus(
      { quotaEnforcementEnabled: true, entitlementActive: true, plan: "business" },
      true
    ),
    PROPOSED_PENDING_OWNER_CONFIRMATION_STORAGE_CAPS_BYTES.business
  );
  assert.notEqual(
    storageCapBytesFromStatus(
      { quotaEnforcementEnabled: true, entitlementActive: true, plan: "starter" },
      true
    ),
    OWNER_ALTERNATIVE_STORAGE_CAPS_BYTES.starter
  );

  {
    const a = originalHoldKey("ab", "c");
    const b = originalHoldKey("a", "bc");
    assert.notEqual(a, b);
    assert.deepEqual(parseStorageHoldKey(a), { kind: "original", ledgerId: "ab", evidenceId: "c" });
    assert.deepEqual(parseStorageHoldKey(b), { kind: "original", ledgerId: "a", evidenceId: "bc" });
    assert.equal(encodeStorageHoldKey({ kind: "original", ledgerId: "", evidenceId: "ev" }), null);
    assert.equal(encodeStorageHoldKey({ kind: "original", ledgerId: "led", evidenceId: "" }), null);
    assert.equal(parseStorageHoldKey("original:ev_shared"), null);
    assert.equal(parseStorageHoldKey(originalHoldKey("ledger_a", "ev1"))?.ledgerId, "ledger_a");
    const deriv = derivativeHoldKey("ledger_a", "ev1", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert.deepEqual(parseStorageHoldKey(deriv), {
      kind: "derivative",
      ledgerId: "ledger_a",
      evidenceId: "ev1",
      derivativeKey: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    assert.notEqual(deriv, originalHoldKey("ledger_a", "ev1"));
  }

  for (const [label, retainedOriginalBytes] of [
    ["undefined", undefined],
    ["string900", "900"],
    ["half", 0.5],
    ["inconsistent0", 0],
  ] as const) {
    const raw = {
      schemaVersion: 1,
      reservedOriginalBytes: 0,
      retainedOriginalBytes,
      reservedDerivativeBytes: 0,
      retainedDerivativeBytes: 0,
      holds: {
        [originalHoldKey(LEDGER, "ev_old")]: { kind: "original", bytes: 900, phase: "retained" },
      },
      updatedAtUtc: "2026-10-01T00:00:00.000Z",
    };
    const parsed = parseStorageAccounting(raw as unknown as Record<string, unknown>);
    assert.ok(parsed && "malformed" in parsed, `${label} parse must be malformed`);
    const admitted = admitNew200(
      retainedHoldDoc({ retainedOriginalBytes: retainedOriginalBytes as number })
    );
    assert.equal(admitted.ok, false, `${label} admit must fail closed`);
    if (!admitted.ok) assert.equal(admitted.code, "quota_state_invalid");
  }

  {
    const missing = parseStorageAccounting(undefined);
    assert.equal(missing, null);
    const admitted = admitNew200(null);
    assert.equal(admitted.ok, true);
    if (admitted.ok) {
      assert.equal(admitted.replayed, false);
      assert.equal(chargedStorageBytes(admitted.next), 200);
    }
  }

  {
    const existing = retainedHoldDoc({});
    const replay = admitStorageReservation({
      existing,
      identity: OLD,
      bytes: 900,
      capBytes: 1000,
      updatedAtUtc: STAMP,
      replay: true,
    });
    assert.equal(replay.ok, true);
    if (replay.ok) {
      assert.equal(replay.replayed, true);
      assert.equal(chargedStorageBytes(replay.next), 900);
    }
    const conflict = admitStorageReservation({
      existing,
      identity: OLD,
      bytes: 200,
      capBytes: 1000,
      updatedAtUtc: STAMP,
      replay: true,
    });
    assert.equal(conflict.ok, false);
    if (!conflict.ok) assert.equal(conflict.code, "quota_state_invalid");
    const occupiedWithoutObject = admitStorageReservation({
      existing,
      identity: OLD,
      bytes: 900,
      capBytes: 1000,
      updatedAtUtc: STAMP,
      replay: false,
    });
    assert.equal(occupiedWithoutObject.ok, false);
  }

  {
    const overflow = admitStorageReservation({
      existing: null,
      identity: NEW,
      bytes: Number.MAX_SAFE_INTEGER,
      capBytes: -1,
      updatedAtUtc: STAMP,
    });
    assert.equal(overflow.ok, true);
    if (overflow.ok) {
      const second = admitStorageReservation({
        existing: overflow.next,
        identity: { kind: "original", ledgerId: LEDGER, evidenceId: "ev_other" },
        bytes: 1,
        capBytes: -1,
        updatedAtUtc: STAMP,
      });
      assert.equal(second.ok, false);
      if (!second.ok) assert.equal(second.code, "quota_state_invalid");
    }
  }

  {
    const repaired = repairStorageAccounting(
      [{ identity: OLD, bytes: 40, phase: "retained" }],
      STAMP
    );
    assert.equal("malformed" in repaired, false);
    if (!("malformed" in repaired)) {
      assert.equal(repaired.retainedOriginalBytes, 40);
      assert.equal(repaired.reservedOriginalBytes, 0);
    }
    const bad = repairStorageAccounting(
      [{ identity: { kind: "original", ledgerId: "", evidenceId: "ev" }, bytes: 40, phase: "retained" }],
      STAMP
    );
    assert.equal("malformed" in bad, true);
  }

  {
    const holds = Object.create(null) as StorageAccountingDoc["holds"];
    for (let i = 0; i < MAX_STORAGE_HOLDS; i += 1) {
      const evidenceId = `e${i}`;
      holds[originalHoldKey("led", evidenceId)] = { kind: "original", bytes: 1, phase: "retained" };
    }
    const full: StorageAccountingDoc = {
      schemaVersion: 1,
      reservedOriginalBytes: 0,
      retainedOriginalBytes: MAX_STORAGE_HOLDS,
      reservedDerivativeBytes: 0,
      retainedDerivativeBytes: 0,
      holds,
      updatedAtUtc: "2026-10-01T00:00:00.000Z",
    };
    const denied = admitStorageReservation({
      existing: full,
      identity: { kind: "original", ledgerId: "led", evidenceId: "e_extra" },
      bytes: 1,
      capBytes: 1_000_000_000,
      updatedAtUtc: STAMP,
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.code, "quota_state_invalid");
      assert.equal(denied.reason, "holds_map_at_capacity");
    }
  }

  {
    const existing = retainedHoldDoc({});
    const missing = retainStorageHold(
      existing,
      { kind: "original", ledgerId: LEDGER, evidenceId: "ev_other" },
      900,
      STAMP
    );
    assert.ok("malformed" in missing);
    const releasedOther = releaseReservedHold(
      existing,
      { kind: "original", ledgerId: LEDGER, evidenceId: "ev_other" },
      STAMP
    );
    assert.equal("malformed" in releasedOther, false);
    if (!("malformed" in releasedOther)) {
      assert.equal(releasedOther.retainedOriginalBytes, 900);
      assert.ok(releasedOther.holds[originalHoldKey(LEDGER, "ev_old")]);
    }
  }

  {
    const originalsAt10Gib = proposedPdfOriginalWorkloadBlockedByHoldsMap(
      OWNER_SELECTED_STORAGE_CAPS_BYTES.business
    );
    assert.equal(originalsAt10Gib.originalSlots, 682);
    assert.equal(originalsAt10Gib.blocked, false);
    assert.ok(originalsAt10Gib.estimatedDocumentBytes < FIRESTORE_MAX_DOCUMENT_BYTES);
    const historical20Gib = proposedPdfOriginalWorkloadBlockedByHoldsMap(
      PROPOSED_PENDING_OWNER_CONFIRMATION_STORAGE_CAPS_BYTES.business
    );
    assert.equal(historical20Gib.originalSlots, 1365);
    assert.equal(historical20Gib.blocked, false);
    for (const cap of [
      OWNER_SELECTED_STORAGE_CAPS_BYTES.starter,
      OWNER_SELECTED_STORAGE_CAPS_BYTES.professional,
    ]) {
      const workload = proposedPdfOriginalWorkloadBlockedByHoldsMap(cap);
      assert.equal(workload.blocked, false);
      assert.ok(workload.estimatedDocumentBytes < FIRESTORE_MAX_DOCUMENT_BYTES);
    }
    const maxIdOriginals = estimateStorageAccountingDocumentBytes({
      holds: sampleMaxLengthHolds(MAX_STORAGE_HOLDS, 0),
    });
    const maxIdDerivatives = estimateStorageAccountingDocumentBytes({
      holds: sampleMaxLengthHolds(0, MAX_STORAGE_HOLDS),
    });
    const mixedFanoutAtCap = estimateStorageAccountingDocumentBytes({
      holds: sampleMaxLengthHolds(277, 2216),
    });
    const blockedFanout = estimateStorageAccountingDocumentBytes({
      holds: sampleMaxLengthHolds(660, 5280),
    });
    assert.ok(maxIdOriginals < FIRESTORE_MAX_DOCUMENT_BYTES);
    assert.ok(maxIdDerivatives < FIRESTORE_MAX_DOCUMENT_BYTES);
    assert.ok(mixedFanoutAtCap < FIRESTORE_MAX_DOCUMENT_BYTES);
    assert.ok(blockedFanout > FIRESTORE_MAX_DOCUMENT_BYTES);
    assert.ok(MAX_STORAGE_HOLDS * 1 < GIB, "entry limit is not a byte entitlement");
    const holds = Object.create(null) as StorageAccountingDoc["holds"];
    for (let i = 0; i < MAX_STORAGE_HOLDS; i += 1) {
      holds[originalHoldKey("led", `e${i}`)] = { kind: "original", bytes: 1, phase: "retained" };
    }
    const full: StorageAccountingDoc = {
      schemaVersion: 1,
      reservedOriginalBytes: 0,
      retainedOriginalBytes: MAX_STORAGE_HOLDS,
      reservedDerivativeBytes: 0,
      retainedDerivativeBytes: 0,
      holds,
      updatedAtUtc: "2026-10-01T00:00:00.000Z",
    };
    const snapshotKeys = Object.keys(full.holds);
    const denied = admitStorageReservation({
      existing: full,
      identity: { kind: "original", ledgerId: "led", evidenceId: "e_extra" },
      bytes: 1,
      capBytes: 1_000_000_000,
      updatedAtUtc: STAMP,
    });
    assert.equal(denied.ok, false);
    assert.equal(Object.keys(full.holds).length, MAX_STORAGE_HOLDS);
    assert.deepEqual(Object.keys(full.holds), snapshotKeys);
  }

  console.log("storageQuota.unit.test.ts: ok (PURE_DOMAIN)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
