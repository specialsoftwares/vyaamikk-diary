/**
 * INJECTED_PORT — G2 storage accounting, warnings, cap, repair, download.
 * Label: INJECTED. Not live Storage. Caps used here are test overrides, not advertised GiB.
 */
import assert from "node:assert/strict";

import { GoodsEvidenceStorageAdapter } from "./adapter";
import { FAKE_createInjectedFirestore, FAKE_seedOwner } from "./FAKE_injectedFirestore";
import { FAKE_MemoryBlobStore } from "./FAKE_memoryBlobStore";
import { evidenceObjectPath, receiptPath, storageAccountingPath, subscriptionStatusPath } from "./paths";
import { originalHoldKey, PROPOSED_PENDING_OWNER_CONFIRMATION_STORAGE_CAPS_BYTES } from "./storageQuota";
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
      [{ holdKey: originalHoldKey("ev_keep"), kind: "original", bytes: 40, phase: "retained" }]
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

  console.log("storageQuota.injected.unit.test.ts: ok (INJECTED)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
