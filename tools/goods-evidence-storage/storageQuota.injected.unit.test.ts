/**
 * INJECTED_PORT — G2 storage accounting, warnings, cap, repair, download.
 * Label: INJECTED. Not live Storage. Caps used here are test overrides, not advertised GiB.
 */
import assert from "node:assert/strict";

import { GoodsEvidenceStorageAdapter } from "./adapter";
import { FAKE_createInjectedFirestore, FAKE_seedOwner } from "./FAKE_injectedFirestore";
import { FAKE_MemoryBlobStore } from "./FAKE_memoryBlobStore";
import { evidenceObjectPath, receiptPath, storageAccountingPath, subscriptionStatusPath } from "./paths";
import {
  HOLDS_MAP_CAPACITY_DETAIL,
  MAX_STORAGE_HOLDS,
  originalHoldKey,
  parseStorageAccounting,
  chargedStorageBytes,
  PROPOSED_PENDING_OWNER_CONFIRMATION_STORAGE_CAPS_BYTES,
} from "./storageQuota";
import { putAndVerify, sampleBytes, sha256Bytes, testClock } from "./testSupport";

const OWNER = "owner_storage_q";
const LEDGER = "ledger_storage_q";
const RECEIPT = "receipt_storage_q";

function persist(data: Record<string, unknown>): string {
  return JSON.stringify(data);
}

function pair(capOverride?: number) {
  const db = FAKE_createInjectedFirestore();
  const blobs = new FAKE_MemoryBlobStore();
  FAKE_seedOwner(db, OWNER, LEDGER, RECEIPT);
  db.snapshot.set(
    subscriptionStatusPath(OWNER),
    persist({
      entitlementActive: true,
      plan: "starter",
      quotaEnforcementEnabled: true,
    })
  );
  const adapter = new GoodsEvidenceStorageAdapter(db, blobs, testClock(), {
    storageCapOverrideBytes: capOverride,
  });
  return { db, blobs, adapter };
}

async function main(): Promise<void> {
  assert.equal(PROPOSED_PENDING_OWNER_CONFIRMATION_STORAGE_CAPS_BYTES.starter, 1024 * 1024 * 1024);

  {
    const { adapter } = pair(1000);
    const bytes = sampleBytes(3, 800);
    const reserved = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_warn80",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(bytes),
        claimedByteSize: bytes.byteLength,
      }
    );
    assert.equal(reserved.ok, true);
    if (reserved.ok) {
      assert.equal(reserved.storageWarning?.level, "warn_80");
      assert.equal(reserved.replayed, false);
    }
  }

  {
    const { adapter } = pair(1000);
    const bytes = sampleBytes(4, 960);
    const reserved = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_warn95",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(bytes),
        claimedByteSize: bytes.byteLength,
      }
    );
    assert.equal(reserved.ok, true);
    if (reserved.ok) assert.equal(reserved.storageWarning?.level, "warn_95");
  }

  {
    const { adapter, db } = pair(500);
    const bytes = sampleBytes(5, 600);
    const denied = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_cap",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(bytes),
        claimedByteSize: bytes.byteLength,
      }
    );
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, "quota_exhausted");
    assert.equal(db.snapshot.has(evidenceObjectPath(OWNER, LEDGER, "ev_cap")), false);
  }

  {
    const { adapter } = pair(1000);
    const bytes = sampleBytes(6, 400);
    const first = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_replay",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(bytes),
        claimedByteSize: bytes.byteLength,
      }
    );
    assert.equal(first.ok, true);
    const replay = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_replay",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(bytes),
        claimedByteSize: bytes.byteLength,
      }
    );
    assert.equal(replay.ok, true);
    if (replay.ok) assert.equal(replay.replayed, true);
    const status = await adapter.storageStatus({ uid: OWNER });
    assert.equal(status.ok, true);
    if (status.ok) assert.equal(status.reservedOriginalBytes, 400);
  }

  {
    const { adapter } = pair(1000);
    const a = sampleBytes(7, 600);
    const b = sampleBytes(8, 500);
    const ra = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_conc_a",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(a),
        claimedByteSize: a.byteLength,
      }
    );
    assert.equal(ra.ok, true);
    const rb = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_conc_b",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(b),
        claimedByteSize: b.byteLength,
      }
    );
    assert.equal(rb.ok, false);
    if (!rb.ok) assert.equal(rb.code, "quota_exhausted");
  }

  {
    const { adapter, blobs } = pair(5000);
    const bytes = sampleBytes(9, 200);
    await putAndVerify({
      adapter,
      blobs,
      uid: OWNER,
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      evidenceId: "ev_dl",
      bytes,
    });
    const downloaded = await adapter.downloadOriginal(
      { uid: OWNER },
      { evidenceId: "ev_dl", ledgerId: LEDGER, receiptId: RECEIPT }
    );
    assert.equal(downloaded.ok, true);
    if (downloaded.ok) {
      assert.equal(downloaded.kind, "original");
      assert.equal(downloaded.byteSize, 200);
      assert.equal(downloaded.bytes.byteLength, 200);
    }
    blobs.FAKE_deleteObject(
      (downloaded.ok ? downloaded.storagePath : "") || ""
    );
    const missing = await adapter.downloadOriginal(
      { uid: OWNER },
      { evidenceId: "ev_dl", ledgerId: LEDGER, receiptId: RECEIPT }
    );
    assert.equal(missing.ok, false);
  }

  {
    const { adapter } = pair(1000);
    const bytes = sampleBytes(1, 300);
    await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_abandon",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(bytes),
        claimedByteSize: bytes.byteLength,
      }
    );
    const released = await adapter.releaseAbandonedReservation(
      { uid: OWNER },
      { evidenceId: "ev_abandon", ledgerId: LEDGER, receiptId: RECEIPT }
    );
    assert.equal(released.ok, true);
    if (released.ok) assert.equal(released.state, "rejected");
    const status = await adapter.storageStatus({ uid: OWNER });
    assert.equal(status.ok, true);
    if (status.ok) assert.equal(status.reservedOriginalBytes, 0);
  }

  {
    const { adapter, db } = pair(100);
    db.snapshot.set(
      storageAccountingPath(OWNER),
      persist({
        schemaVersion: 1,
        reservedOriginalBytes: 9999,
        retainedOriginalBytes: 0,
        reservedDerivativeBytes: 0,
        retainedDerivativeBytes: 0,
        holds: {},
        updatedAtUtc: "2026-10-01T00:00:00.000Z",
      })
    );
    const repaired = await adapter.repairAccounting(
      { uid: OWNER },
      [{ identity: { kind: "original", ledgerId: LEDGER, evidenceId: "ev_keep" }, bytes: 40, phase: "retained" }]
    );
    assert.equal(repaired.ok, true);
    if (repaired.ok) {
      assert.equal(repaired.retainedOriginalBytes, 40);
      assert.equal(repaired.reservedOriginalBytes, 0);
    }
    const still = db.snapshot.get(receiptPath(OWNER, LEDGER, RECEIPT));
    assert.ok(still, "repair must not delete evidence");
  }

  {
    const { adapter, db } = pair(100);
    db.snapshot.set(
      subscriptionStatusPath(OWNER),
      persist({
        entitlementActive: false,
        entitlementReason: "subscriptionExpired",
        currentPeriodEnd: Date.UTC(2026, 5, 1),
        quotaEnforcementEnabled: true,
        plan: "starter",
      })
    );
    const denied = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_exp",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(sampleBytes(2, 16)),
        claimedByteSize: 16,
      }
    );
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, "policy_denied");
  }

  {
    const { adapter, blobs, db } = pair(100);
    const bytes = sampleBytes(11, 80);
    await putAndVerify({
      adapter,
      blobs,
      uid: OWNER,
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      evidenceId: "ev_keep_dl",
      bytes,
    });
    db.snapshot.set(
      subscriptionStatusPath(OWNER),
      persist({
        entitlementActive: true,
        plan: "starter",
        quotaEnforcementEnabled: true,
      })
    );
    const smallCap = new GoodsEvidenceStorageAdapter(db, blobs, testClock(), {
      storageCapOverrideBytes: 10,
    });
    const status = await smallCap.storageStatus({ uid: OWNER });
    assert.equal(status.ok, true);
    if (status.ok) assert.equal(status.overLimitRetained, true);
    const extra = await smallCap.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_over",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(sampleBytes(12, 16)),
        claimedByteSize: 16,
      }
    );
    assert.equal(extra.ok, false);
    const viewed = await smallCap.retrieveOriginal(
      { uid: OWNER },
      { evidenceId: "ev_keep_dl", ledgerId: LEDGER, receiptId: RECEIPT }
    );
    assert.equal(viewed.ok, true, "downgrade over limit keeps viewing");
  }

  {
    const db = FAKE_createInjectedFirestore();
    const blobs = new FAKE_MemoryBlobStore();
    FAKE_seedOwner(db, OWNER, LEDGER, RECEIPT);
    const adapter = new GoodsEvidenceStorageAdapter(db, blobs, testClock());
    const reserved = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_off",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(sampleBytes(13, 16)),
        claimedByteSize: 16,
      }
    );
    assert.equal(reserved.ok, true, "status missing → storage enforcement off");
  }

  function seedCorruptAccounting(
    db: ReturnType<typeof FAKE_createInjectedFirestore>,
    counters: Record<string, unknown>
  ): string {
    const raw = persist({
      schemaVersion: 1,
      reservedOriginalBytes: 0,
      reservedDerivativeBytes: 0,
      retainedDerivativeBytes: 0,
      ...counters,
      holds: {
        [originalHoldKey(LEDGER, "ev_old")]: { kind: "original", bytes: 900, phase: "retained" },
      },
      updatedAtUtc: "2026-10-01T00:00:00.000Z",
    });
    db.snapshot.set(storageAccountingPath(OWNER), raw);
    return raw;
  }

  for (const [label, counters] of [
    ["undefined", {}],
    ["string900", { retainedOriginalBytes: "900" }],
    ["half", { retainedOriginalBytes: 0.5 }],
    ["inconsistent0", { retainedOriginalBytes: 0 }],
  ] as const) {
    const { adapter, db } = pair(1000);
    const before = seedCorruptAccounting(db, counters);
    const writesBefore = db.appliedWrites;
    const denied = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_new",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(sampleBytes(3, 200)),
        claimedByteSize: 200,
      }
    );
    assert.equal(denied.ok, false, `S1 ${label} must fail closed`);
    if (!denied.ok) assert.equal(denied.code, "quota_state_invalid");
    assert.equal(db.snapshot.has(evidenceObjectPath(OWNER, LEDGER, "ev_new")), false);
    assert.equal(db.snapshot.get(storageAccountingPath(OWNER)), before);
    assert.equal(db.appliedWrites, writesBefore, `S1 ${label} zero reservation/accounting writes`);
  }

  {
    const { adapter, db } = pair(10_000);
    const ledgerB = "ledger_s2_b";
    const receiptB = "receipt_s2_b";
    FAKE_seedOwner(db, OWNER, ledgerB, receiptB);
    const shared = "ev_shared_s2";
    const first = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: shared,
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(sampleBytes(3, 300)),
        claimedByteSize: 300,
      }
    );
    const second = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: shared,
        ledgerId: ledgerB,
        receiptId: receiptB,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(sampleBytes(4, 400)),
        claimedByteSize: 400,
      }
    );
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (first.ok) assert.equal(first.replayed, false);
    if (second.ok) assert.equal(second.replayed, false);
    assert.equal(db.snapshot.has(evidenceObjectPath(OWNER, LEDGER, shared)), true);
    assert.equal(db.snapshot.has(evidenceObjectPath(OWNER, ledgerB, shared)), true);
    const accounting = JSON.parse(db.snapshot.get(storageAccountingPath(OWNER)) ?? "null") as Record<
      string,
      unknown
    >;
    const parsed = parseStorageAccounting(accounting);
    assert.ok(parsed && !("malformed" in parsed));
    if (parsed && !("malformed" in parsed)) {
      assert.equal(Object.keys(parsed.holds).length, 2);
      assert.ok(parsed.holds[originalHoldKey(LEDGER, shared)]);
      assert.ok(parsed.holds[originalHoldKey(ledgerB, shared)]);
      assert.equal(chargedStorageBytes(parsed), 700);
    }
  }

  {
    const other = "owner_storage_other";
    const { adapter, db } = pair(10_000);
    FAKE_seedOwner(db, other, LEDGER, RECEIPT);
    db.snapshot.set(
      subscriptionStatusPath(other),
      persist({ entitlementActive: true, plan: "starter", quotaEnforcementEnabled: true })
    );
    const otherAdapter = new GoodsEvidenceStorageAdapter(db, new FAKE_MemoryBlobStore(), testClock(), {
      storageCapOverrideBytes: 10_000,
    });
    const shared = "ev_cross_owner";
    const a = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: shared,
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(sampleBytes(5, 120)),
        claimedByteSize: 120,
      }
    );
    const b = await otherAdapter.reserve(
      { uid: other },
      {
        evidenceId: shared,
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(sampleBytes(6, 80)),
        claimedByteSize: 80,
      }
    );
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    const parsedA = parseStorageAccounting(
      JSON.parse(db.snapshot.get(storageAccountingPath(OWNER)) ?? "null") as Record<string, unknown>
    );
    const parsedB = parseStorageAccounting(
      JSON.parse(db.snapshot.get(storageAccountingPath(other)) ?? "null") as Record<string, unknown>
    );
    assert.ok(parsedA && !("malformed" in parsedA) && parsedB && !("malformed" in parsedB));
    if (parsedA && !("malformed" in parsedA) && parsedB && !("malformed" in parsedB)) {
      assert.equal(chargedStorageBytes(parsedA), 120);
      assert.equal(chargedStorageBytes(parsedB), 80);
    }
  }

  {
    const { adapter, db } = pair(1000);
    db.snapshot.set(
      storageAccountingPath(OWNER),
      persist({
        schemaVersion: 1,
        reservedOriginalBytes: 200,
        retainedOriginalBytes: 0,
        reservedDerivativeBytes: 0,
        retainedDerivativeBytes: 0,
        holds: {
          [originalHoldKey(LEDGER, "ev_ghost")]: { kind: "original", bytes: 200, phase: "reserved" },
        },
        updatedAtUtc: "2026-10-01T00:00:00.000Z",
      })
    );
    const before = db.snapshot.get(storageAccountingPath(OWNER));
    const denied = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_ghost",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(sampleBytes(7, 300)),
        claimedByteSize: 300,
      }
    );
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, "quota_state_invalid");
    assert.equal(db.snapshot.has(evidenceObjectPath(OWNER, LEDGER, "ev_ghost")), false);
    assert.equal(db.snapshot.get(storageAccountingPath(OWNER)), before);
  }

  {
    const { adapter } = pair(1000);
    const [ra, rb] = await Promise.all([
      adapter.reserve(
        { uid: OWNER },
        {
          evidenceId: "ev_conc_left",
          ledgerId: LEDGER,
          receiptId: RECEIPT,
          category: "invoice",
          mime: "application/pdf",
          claimedSha256: sha256Bytes(sampleBytes(8, 600)),
          claimedByteSize: 600,
        }
      ),
      adapter.reserve(
        { uid: OWNER },
        {
          evidenceId: "ev_conc_right",
          ledgerId: LEDGER,
          receiptId: RECEIPT,
          category: "invoice",
          mime: "application/pdf",
          claimedSha256: sha256Bytes(sampleBytes(9, 600)),
          claimedByteSize: 600,
        }
      ),
    ]);
    const oks = [ra, rb].filter((r) => r.ok);
    const denies = [ra, rb].filter((r) => !r.ok);
    assert.equal(oks.length, 1);
    assert.equal(denies.length, 1);
    if (!denies[0].ok) assert.equal(denies[0].code, "quota_exhausted");
    const status = await adapter.storageStatus({ uid: OWNER });
    assert.equal(status.ok, true);
    if (status.ok) {
      assert.ok(status.usedBytes <= 1000);
      assert.equal(status.reservedOriginalBytes, 600);
    }
  }

  {
    const { adapter, blobs, db } = pair(5000);
    await putAndVerify({
      adapter,
      blobs,
      uid: OWNER,
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      evidenceId: "ev_keep_hold",
      bytes: sampleBytes(10, 150),
    });
    const reservedOther = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_other_hold",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(sampleBytes(11, 90)),
        claimedByteSize: 90,
      }
    );
    assert.equal(reservedOther.ok, true);
    const rejected = await adapter.releaseAbandonedReservation(
      { uid: OWNER },
      { evidenceId: "ev_other_hold", ledgerId: LEDGER, receiptId: RECEIPT }
    );
    assert.equal(rejected.ok, true);
    const retried = await adapter.retryInterruptedUpload(
      { uid: OWNER },
      { evidenceId: "ev_keep_hold", ledgerId: LEDGER }
    );
    assert.equal(retried.ok, false);
    const parsed = parseStorageAccounting(
      JSON.parse(db.snapshot.get(storageAccountingPath(OWNER)) ?? "null") as Record<string, unknown>
    );
    assert.ok(parsed && !("malformed" in parsed));
    if (parsed && !("malformed" in parsed)) {
      assert.equal(parsed.holds[originalHoldKey(LEDGER, "ev_keep_hold")]?.bytes, 150);
      assert.equal(parsed.holds[originalHoldKey(LEDGER, "ev_keep_hold")]?.phase, "retained");
      assert.equal(parsed.holds[originalHoldKey(LEDGER, "ev_other_hold")], undefined);
      assert.equal(chargedStorageBytes(parsed), 150);
    }
  }

  {
    const { adapter, blobs, db } = pair(1_000_000_000);
    const kept = sampleBytes(21, 80);
    await putAndVerify({
      adapter,
      blobs,
      uid: OWNER,
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      evidenceId: "ev_capacity_keep",
      bytes: kept,
    });
    const holds: Record<string, { kind: "original"; bytes: number; phase: "retained" }> = {
      [originalHoldKey(LEDGER, "ev_capacity_keep")]: { kind: "original", bytes: 80, phase: "retained" },
    };
    let retained = 80;
    for (let i = 0; i < MAX_STORAGE_HOLDS - 1; i += 1) {
      holds[originalHoldKey(LEDGER, `filler${i}`)] = { kind: "original", bytes: 1, phase: "retained" };
      retained += 1;
    }
    db.snapshot.set(
      storageAccountingPath(OWNER),
      persist({
        schemaVersion: 1,
        reservedOriginalBytes: 0,
        retainedOriginalBytes: retained,
        reservedDerivativeBytes: 0,
        retainedDerivativeBytes: 0,
        holds,
        updatedAtUtc: "2026-10-01T00:00:00.000Z",
      })
    );
    const before = db.snapshot.get(storageAccountingPath(OWNER));
    const denied = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_capacity_new",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(sampleBytes(22, 16)),
        claimedByteSize: 16,
      }
    );
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.code, "quota_state_invalid");
      assert.equal(denied.detail, HOLDS_MAP_CAPACITY_DETAIL);
    }
    assert.equal(db.snapshot.has(evidenceObjectPath(OWNER, LEDGER, "ev_capacity_new")), false);
    assert.equal(db.snapshot.get(storageAccountingPath(OWNER)), before);
    const status = await adapter.storageStatus({ uid: OWNER });
    assert.equal(status.ok, true);
    if (status.ok) {
      assert.equal(status.holdCount, MAX_STORAGE_HOLDS);
      assert.equal(status.holdsCapacity, MAX_STORAGE_HOLDS);
      assert.equal(status.holdsAtCapacity, true);
    }
    const downloaded = await adapter.downloadOriginal(
      { uid: OWNER },
      { evidenceId: "ev_capacity_keep", ledgerId: LEDGER, receiptId: RECEIPT }
    );
    assert.equal(downloaded.ok, true);
    if (downloaded.ok) assert.equal(downloaded.byteSize, 80);
    const viewed = await adapter.retrieveOriginal(
      { uid: OWNER },
      { evidenceId: "ev_capacity_keep", ledgerId: LEDGER, receiptId: RECEIPT }
    );
    assert.equal(viewed.ok, true);
  }

  console.log("storageQuota.injected.unit.test.ts: ok (INJECTED)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
