/**
 * INJECTED_PORT G2 Wave 1 tests. FAKE_* stores only — not production.
 */
import assert from "node:assert/strict";

import { GoodsEvidenceStorageAdapter } from "./adapter";
import { createInjectedGrinEvidencePort, type GrinEvidencePortUploadInput } from "./evidencePort";
import { FAKE_createInjectedFirestore, FAKE_seedOwner } from "./FAKE_injectedFirestore";
import { FAKE_MemoryBlobStore } from "./FAKE_memoryBlobStore";
import { evidenceObjectPath, receiptPath } from "./paths";
import { evidenceLabel, putAndVerify, sampleBytes, sha256Bytes, testClock } from "./testSupport";
import type { G2BlobStore } from "./types";

const OWNER = "owner_g2";
const OTHER = "mallory_g2";
const LEDGER = "ledger_g2";
const RECEIPT = "receipt_g2";

function adapterPair() {
  const db = FAKE_createInjectedFirestore();
  const blobs = new FAKE_MemoryBlobStore();
  FAKE_seedOwner(db, OWNER, LEDGER, RECEIPT);
  const adapter = new GoodsEvidenceStorageAdapter(db, blobs, testClock());
  return { db, blobs, adapter };
}

function pdfBytes(fill: number, length = 16): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.set([0x25, 0x50, 0x44, 0x46]);
  bytes.fill(fill, 4);
  return bytes;
}

function seedReceipt(db: ReturnType<typeof FAKE_createInjectedFirestore>, receiptId: string): void {
  db.snapshot.set(
    receiptPath(OWNER, LEDGER, receiptId),
    JSON.stringify({ original: { receiptId, ownerUid: OWNER, ledgerId: LEDGER } })
  );
}

function jpegBytes(fill: number, length = 16): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.set([0xff, 0xd8, 0xff]);
  bytes.fill(fill, 3);
  return bytes;
}

function pngBytes(fill: number, length = 16): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.fill(fill, 8);
  return bytes;
}

function originalUpload(
  evidenceId: string,
  receiptId: string,
  localPath: string,
  claimedSha256: string,
  category: string
): GrinEvidencePortUploadInput {
  return {
    uid: OWNER,
    ledgerId: LEDGER,
    receiptId,
    evidenceId,
    role: "original",
    localPath,
    claimedSha256,
    category,
  };
}

function makePort(
  adapter: GoodsEvidenceStorageAdapter,
  blobs: G2BlobStore,
  files: Map<string, Uint8Array>
) {
  return createInjectedGrinEvidencePort({
    adapter,
    blobs,
    readLocalFile: async (localPath) => {
      const found = files.get(localPath);
      if (!found) throw new Error("missing");
      return found;
    },
  });
}

async function main(): Promise<void> {
  evidenceLabel("INJECTED_PORT", "unauthenticated and pending_deletion denied");
  {
    const { adapter } = adapterPair();
    const unauth = await adapter.reserve(
      { uid: null },
      {
        evidenceId: "ev_unauth",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(sampleBytes()),
        claimedByteSize: 32,
      }
    );
    assert.equal(unauth.ok, false);
    if (!unauth.ok) assert.equal(unauth.code, "unauthenticated");
    const db = FAKE_createInjectedFirestore();
    FAKE_seedOwner(db, OWNER, LEDGER, RECEIPT, { userStatus: "pending_deletion" });
    const pending = new GoodsEvidenceStorageAdapter(db, new FAKE_MemoryBlobStore(), testClock());
    const denied = await pending.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_pending",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(sampleBytes()),
        claimedByteSize: 32,
      }
    );
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, "forbidden");
  }

  evidenceLabel("INJECTED_PORT", "pending_deletion garbage body is forbidden not invalid");
  {
    const db = FAKE_createInjectedFirestore();
    FAKE_seedOwner(db, OWNER, LEDGER, RECEIPT, { userStatus: "pending_deletion" });
    const pending = new GoodsEvidenceStorageAdapter(db, new FAKE_MemoryBlobStore(), testClock());
    const garbage = { mime: 12, claimedByteSize: "nope", notAReserve: true };
    const reserved = await pending.reserve({ uid: OWNER }, garbage);
    assert.equal(reserved.ok, false);
    if (!reserved.ok) {
      assert.equal(reserved.code, "forbidden");
      assert.notEqual(reserved.code, "invalid");
    }
    const shapedGarbage = {
      evidenceId: "ev_pending_garbage",
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      category: "not-a-category",
      mime: "text/plain",
      claimedSha256: "not-a-hash",
      claimedByteSize: -1,
    };
    const reservedShaped = await pending.reserve({ uid: OWNER }, shapedGarbage);
    assert.equal(reservedShaped.ok, false);
    if (!reservedShaped.ok) assert.equal(reservedShaped.code, "forbidden");
    const completed = await pending.completeUpload({ uid: OWNER }, garbage);
    assert.equal(completed.ok, false);
    if (!completed.ok) assert.equal(completed.code, "forbidden");
    const verified = await pending.verify({ uid: OWNER }, garbage);
    assert.equal(verified.ok, false);
    if (!verified.ok) assert.equal(verified.code, "forbidden");
    const linked = await pending.link({ uid: OWNER }, garbage);
    assert.equal(linked.ok, false);
    if (!linked.ok) assert.equal(linked.code, "forbidden");
    const unauthGarbage = await pending.reserve({ uid: null }, garbage);
    assert.equal(unauthGarbage.ok, false);
    if (!unauthGarbage.ok) assert.equal(unauthGarbage.code, "unauthenticated");
    const activeDb = FAKE_createInjectedFirestore();
    FAKE_seedOwner(activeDb, OWNER, LEDGER, RECEIPT);
    const active = new GoodsEvidenceStorageAdapter(activeDb, new FAKE_MemoryBlobStore(), testClock());
    const activeGarbage = await active.reserve({ uid: OWNER }, garbage);
    assert.equal(activeGarbage.ok, false);
    if (!activeGarbage.ok) assert.equal(activeGarbage.code, "invalid");
  }

  evidenceLabel("INJECTED_PORT", "cross-owner deny does not leak existence");
  {
    const { adapter, blobs } = adapterPair();
    await putAndVerify({
      adapter,
      blobs,
      uid: OWNER,
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      evidenceId: "ev_owner",
      bytes: sampleBytes(1),
    });
    const malloryDb = FAKE_createInjectedFirestore();
    FAKE_seedOwner(malloryDb, OTHER, "ledger_other", "receipt_other");
    const mallory = new GoodsEvidenceStorageAdapter(malloryDb, blobs, testClock());
    const crossLedger = await mallory.getRecord(
      { uid: OTHER },
      { evidenceId: "ev_owner", ledgerId: LEDGER }
    );
    assert.equal(crossLedger.ok, false);
    if (!crossLedger.ok) assert.equal(crossLedger.code, "forbidden");
    const missing = await mallory.getRecord(
      { uid: OTHER },
      { evidenceId: "ev_owner", ledgerId: "ledger_other" }
    );
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.code, "not_found");
  }

  evidenceLabel("INJECTED_PORT", "overwrite deny on original object id");
  {
    const { adapter, blobs } = adapterPair();
    const bytes = sampleBytes(2);
    const reserved = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_ow",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "ewb",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(bytes),
        claimedByteSize: bytes.byteLength,
      }
    );
    assert.equal(reserved.ok, true);
    if (!reserved.ok) throw new Error("reserve");
    const first = await blobs.putIfAbsent(reserved.storagePath, bytes, "application/pdf");
    const second = await blobs.putIfAbsent(reserved.storagePath, sampleBytes(9), "application/pdf");
    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.code, "already_exists");
  }

  evidenceLabel("INJECTED_PORT", "mismatched hash rejects and does not verify");
  {
    const { adapter, blobs } = adapterPair();
    const claimed = sampleBytes(3);
    const stored = sampleBytes(4);
    assert.equal(claimed.byteLength, stored.byteLength);
    const reserved = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_hash",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "lr_bilty",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(claimed),
        claimedByteSize: claimed.byteLength,
      }
    );
    assert.equal(reserved.ok, true);
    if (!reserved.ok) throw new Error("reserve");
    await adapter.beginUpload({ uid: OWNER }, { evidenceId: "ev_hash", ledgerId: LEDGER });
    await blobs.putIfAbsent(reserved.storagePath, stored, "application/pdf");
    const completed = await adapter.completeUpload({ uid: OWNER }, { evidenceId: "ev_hash", ledgerId: LEDGER });
    assert.equal(completed.ok, true);
    const verified = await adapter.verify({ uid: OWNER }, { evidenceId: "ev_hash", ledgerId: LEDGER });
    assert.equal(verified.ok, true);
    if (!verified.ok) throw new Error("verify");
    assert.equal(verified.state, "rejected");
    assert.equal(verified.verified, null);
  }

  evidenceLabel("INJECTED_PORT", "replaced generation after verify cannot inherit the old result");
  {
    const { adapter, blobs } = adapterPair();
    const firstBytes = sampleBytes(5);
    const { reserved, verified } = await putAndVerify({
      adapter,
      blobs,
      uid: OWNER,
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      evidenceId: "ev_gen",
      bytes: firstBytes,
      category: "weighment",
    });
    const oldGeneration = verified.generation;
    blobs.FAKE_forceOverwrite(reserved.storagePath, sampleBytes(8), "application/pdf");
    const again = await adapter.verify({ uid: OWNER }, { evidenceId: "ev_gen", ledgerId: LEDGER });
    assert.equal(again.ok, true);
    if (!again.ok) throw new Error("replaced verify");
    assert.equal(again.state, "rejected");
    assert.equal(again.verified, null);
    const linked = await adapter.link({ uid: OWNER }, verified);
    assert.equal(linked.ok, false);
    const { verified: replacement } = await putAndVerify({
      adapter,
      blobs,
      uid: OWNER,
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      evidenceId: "ev_gen_new",
      bytes: sampleBytes(11),
      category: "vehicle",
    });
    assert.notEqual(replacement.evidenceId, verified.evidenceId);
    assert.notEqual(replacement.storagePath, verified.storagePath);
    assert.notEqual(replacement.generation, oldGeneration);
  }

  evidenceLabel("INJECTED_PORT", "duplicate callbacks are idempotent");
  {
    const { adapter, blobs } = adapterPair();
    const bytes = sampleBytes(6);
    const body = {
      evidenceId: "ev_dup",
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      category: "unloading",
      mime: "image/jpeg",
      claimedSha256: sha256Bytes(bytes),
      claimedByteSize: bytes.byteLength,
    };
    const r1 = await adapter.reserve({ uid: OWNER }, body);
    const r2 = await adapter.reserve({ uid: OWNER }, body);
    assert.equal(r1.ok && r2.ok, true);
    if (!r1.ok || !r2.ok) throw new Error("reserve");
    assert.equal(r2.replayed, true);
    assert.equal(r1.objectKey, r2.objectKey);
    const b1 = await adapter.beginUpload({ uid: OWNER }, { evidenceId: "ev_dup", ledgerId: LEDGER });
    const b2 = await adapter.beginUpload({ uid: OWNER }, { evidenceId: "ev_dup", ledgerId: LEDGER });
    assert.equal(b1.ok && b2.ok, true);
    if (!b2.ok) throw new Error("begin");
    assert.equal(b2.replayed, true);
    await blobs.putIfAbsent(r1.storagePath, bytes, "image/jpeg");
    const c1 = await adapter.completeUpload({ uid: OWNER }, { evidenceId: "ev_dup", ledgerId: LEDGER });
    const c2 = await adapter.completeUpload({ uid: OWNER }, { evidenceId: "ev_dup", ledgerId: LEDGER });
    assert.equal(c1.ok && c2.ok, true);
    if (!c2.ok) throw new Error("complete");
    assert.equal(c2.replayed, true);
    const v1 = await adapter.verify({ uid: OWNER }, { evidenceId: "ev_dup", ledgerId: LEDGER });
    const v2 = await adapter.verify({ uid: OWNER }, { evidenceId: "ev_dup", ledgerId: LEDGER });
    assert.equal(v1.ok && v2.ok, true);
    if (!v1.ok || !v2.ok || !v1.verified || !v2.verified) throw new Error("verify");
    assert.equal(v2.replayed, true);
    assert.equal(v1.verified.generation, v2.verified.generation);
    const l1 = await adapter.link({ uid: OWNER }, v1.verified);
    const l2 = await adapter.link({ uid: OWNER }, v1.verified);
    assert.equal(l1.ok && l2.ok, true);
    if (!l2.ok) throw new Error("link");
    assert.equal(l2.replayed, true);
    assert.equal(l2.state, "linked");
  }

  evidenceLabel("INJECTED_PORT", "interrupted upload retries via reserved");
  {
    const { adapter, blobs } = adapterPair();
    const bytes = sampleBytes(12);
    const reserved = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_int",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "qc",
        mime: "image/png",
        claimedSha256: sha256Bytes(bytes),
        claimedByteSize: bytes.byteLength,
      }
    );
    assert.equal(reserved.ok, true);
    if (!reserved.ok) throw new Error("reserve");
    const began = await adapter.beginUpload({ uid: OWNER }, { evidenceId: "ev_int", ledgerId: LEDGER });
    assert.equal(began.ok, true);
    if (!began.ok) throw new Error("begin");
    assert.equal(began.state, "uploading");
    const retried = await adapter.retryInterruptedUpload({ uid: OWNER }, { evidenceId: "ev_int", ledgerId: LEDGER });
    assert.equal(retried.ok, true);
    if (!retried.ok) throw new Error("retry");
    assert.equal(retried.state, "reserved");
    await adapter.beginUpload({ uid: OWNER }, { evidenceId: "ev_int", ledgerId: LEDGER });
    await blobs.putIfAbsent(reserved.storagePath, bytes, "image/png");
    const completed = await adapter.completeUpload({ uid: OWNER }, { evidenceId: "ev_int", ledgerId: LEDGER });
    assert.equal(completed.ok, true);
    const verified = await adapter.verify({ uid: OWNER }, { evidenceId: "ev_int", ledgerId: LEDGER });
    assert.equal(verified.ok, true);
    if (!verified.ok) throw new Error("verify");
    assert.equal(verified.state, "verified");
  }

  evidenceLabel("INJECTED_PORT", "missing blob after complete becomes orphan then recovers");
  {
    const { adapter, blobs } = adapterPair();
    const bytes = sampleBytes(13);
    const reserved = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_miss",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "acknowledgement",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(bytes),
        claimedByteSize: bytes.byteLength,
      }
    );
    assert.equal(reserved.ok, true);
    if (!reserved.ok) throw new Error("reserve");
    await adapter.beginUpload({ uid: OWNER }, { evidenceId: "ev_miss", ledgerId: LEDGER });
    await blobs.putIfAbsent(reserved.storagePath, bytes, "application/pdf");
    const completed = await adapter.completeUpload({ uid: OWNER }, { evidenceId: "ev_miss", ledgerId: LEDGER });
    assert.equal(completed.ok, true);
    blobs.FAKE_deleteObject(reserved.storagePath);
    const missing = await adapter.verify({ uid: OWNER }, { evidenceId: "ev_miss", ledgerId: LEDGER });
    assert.equal(missing.ok, true);
    if (!missing.ok) throw new Error("missing");
    assert.equal(missing.state, "orphan_pending_review");
    const stillGone = await adapter.recoverOrphan({ uid: OWNER }, { evidenceId: "ev_miss", ledgerId: LEDGER });
    assert.equal(stillGone.ok, true);
    if (!stillGone.ok) throw new Error("still gone");
    assert.equal(stillGone.state, "rejected");
  }

  evidenceLabel("INJECTED_PORT", "orphan recovery after lost upload response / restored blob");
  {
    const { adapter, blobs } = adapterPair();
    const bytes = sampleBytes(14);
    const reserved = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_orph",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(bytes),
        claimedByteSize: bytes.byteLength,
      }
    );
    assert.equal(reserved.ok, true);
    if (!reserved.ok) throw new Error("reserve");
    await adapter.beginUpload({ uid: OWNER }, { evidenceId: "ev_orph", ledgerId: LEDGER });
    await blobs.putIfAbsent(reserved.storagePath, bytes, "application/pdf");
    const recoveredUpload = await adapter.recoverOrphan(
      { uid: OWNER },
      { evidenceId: "ev_orph", ledgerId: LEDGER }
    );
    assert.equal(recoveredUpload.ok, true);
    if (!recoveredUpload.ok) throw new Error("recover upload");
    assert.equal(recoveredUpload.state, "uploaded_unverified");
    blobs.FAKE_deleteObject(reserved.storagePath);
    const orphaned = await adapter.recoverOrphan({ uid: OWNER }, { evidenceId: "ev_orph", ledgerId: LEDGER });
    assert.equal(orphaned.ok, true);
    if (!orphaned.ok) throw new Error("orphan");
    assert.equal(orphaned.state, "orphan_pending_review");
    const restored = await blobs.putIfAbsent(reserved.storagePath, bytes, "application/pdf");
    assert.equal(restored.ok, true);
    const recovered = await adapter.recoverOrphan({ uid: OWNER }, { evidenceId: "ev_orph", ledgerId: LEDGER });
    assert.equal(recovered.ok, true);
    if (!recovered.ok || !recovered.verified) throw new Error("recover");
    assert.equal(recovered.state, "verified");
    const linked = await adapter.link({ uid: OWNER }, recovered.verified);
    assert.equal(linked.ok, true);
    if (!linked.ok) throw new Error("link");
    assert.equal(linked.state, "linked");
  }

  evidenceLabel("INJECTED_PORT", "failed finalize does not leave a verified result");
  {
    const db = FAKE_createInjectedFirestore();
    const blobs = new FAKE_MemoryBlobStore();
    FAKE_seedOwner(db, OWNER, LEDGER, RECEIPT);
    const adapter = new GoodsEvidenceStorageAdapter(db, blobs, testClock());
    const bytes = sampleBytes(15);
    const reserved = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_fail",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(bytes),
        claimedByteSize: bytes.byteLength,
      }
    );
    assert.equal(reserved.ok, true);
    if (!reserved.ok) throw new Error("reserve");
    await adapter.beginUpload({ uid: OWNER }, { evidenceId: "ev_fail", ledgerId: LEDGER });
    await blobs.putIfAbsent(reserved.storagePath, bytes, "application/pdf");
    const completed = await adapter.completeUpload({ uid: OWNER }, { evidenceId: "ev_fail", ledgerId: LEDGER });
    assert.equal(completed.ok, true);
    db.failNextCommit = true;
    db.failCommitError = Object.assign(new Error("injected_finalize_failed"), { code: "FAILED_PRECONDITION" });
    await assert.rejects(() => adapter.verify({ uid: OWNER }, { evidenceId: "ev_fail", ledgerId: LEDGER }));
    const mid = await adapter.getRecord({ uid: OWNER }, { evidenceId: "ev_fail", ledgerId: LEDGER });
    assert.equal(mid.ok, true);
    if (!mid.ok) throw new Error("mid");
    assert.equal(mid.state, "uploaded_unverified");
    assert.equal(mid.verified, null);
    const verified = await adapter.verify({ uid: OWNER }, { evidenceId: "ev_fail", ledgerId: LEDGER });
    assert.equal(verified.ok, true);
    if (!verified.ok) throw new Error("retry verify");
    assert.equal(verified.state, "verified");
  }

  evidenceLabel("INJECTED_PORT", "unauthorized metadata edits are ignored / denied");
  {
    const { adapter } = adapterPair();
    const bytes = sampleBytes(16);
    const forged = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_meta",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(bytes),
        claimedByteSize: bytes.byteLength,
        state: "verified",
        actualSha256: sha256Bytes(bytes),
      } as Record<string, unknown>
    );
    assert.equal(forged.ok, false);
    if (!forged.ok) assert.equal(forged.code, "invalid");
  }

  evidenceLabel("INJECTED_PORT", "no cross-user hash existence index");
  {
    const bytes = sampleBytes(17);
    const a = adapterPair();
    const bDb = FAKE_createInjectedFirestore();
    FAKE_seedOwner(bDb, OTHER, "ledger_b", "receipt_b");
    const bBlobs = new FAKE_MemoryBlobStore();
    const bAdapter = new GoodsEvidenceStorageAdapter(bDb, bBlobs, testClock());
    await putAndVerify({
      adapter: a.adapter,
      blobs: a.blobs,
      uid: OWNER,
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      evidenceId: "ev_a_hash",
      bytes,
    });
    await putAndVerify({
      adapter: bAdapter,
      blobs: bBlobs,
      uid: OTHER,
      ledgerId: "ledger_b",
      receiptId: "receipt_b",
      evidenceId: "ev_b_hash",
      bytes,
    });
    const fileHash = sha256Bytes(bytes);
    for (const key of a.db.snapshot.keys()) {
      assert.doesNotMatch(key, /evidenceHash/i);
      assert.equal(key.includes(fileHash), false);
    }
    for (const key of bDb.snapshot.keys()) {
      assert.doesNotMatch(key, /evidenceHash/i);
    }
  }

  evidenceLabel("INJECTED_PORT", "VerifiedEvidenceResult is produced only from trusted bytes");
  {
    const { adapter, blobs } = adapterPair();
    const bytes = sampleBytes(18);
    const { reserved, verified } = await putAndVerify({
      adapter,
      blobs,
      uid: OWNER,
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      evidenceId: "ev_shape",
      bytes,
      category: "vehicle",
      mime: "image/webp",
    });
    const result = verified;
    assert.equal(result.ownerUid, OWNER);
    assert.equal(result.ledgerId, LEDGER);
    assert.equal(result.receiptId, RECEIPT);
    assert.equal(result.category, "vehicle");
    assert.equal(result.mime, "image/webp");
    assert.equal(result.byteSize, bytes.byteLength);
    assert.equal(result.rawSha256, sha256Bytes(bytes));
    assert.equal(result.storagePath, reserved.storagePath);
    assert.equal(typeof result.generation, "string");
    assert.ok(result.generation.length > 0);
    assert.match(result.verifiedAtUtc, /^2026-10-01T12:00:00.000Z$/);
    assert.doesNotMatch(result.storagePath, /vehicle|receipt_g2/);
  }

  evidenceLabel("INJECTED_PORT", "derivative cannot assert a missing original is retained");
  {
    const { adapter, blobs } = adapterPair();
    const bytes = sampleBytes(19);
    const reserved = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_der",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(bytes),
        claimedByteSize: bytes.byteLength,
      }
    );
    assert.equal(reserved.ok, true);
    if (!reserved.ok) throw new Error("reserve");
    const early = await adapter.reserveDerivative(
      { uid: OWNER },
      { evidenceId: "ev_der", ledgerId: LEDGER, kind: "thumbnail" }
    );
    assert.equal(early.ok, false);
    await putAndVerify({
      adapter,
      blobs,
      uid: OWNER,
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      evidenceId: "ev_der2",
      bytes,
    });
    const der = await adapter.reserveDerivative(
      { uid: OWNER },
      { evidenceId: "ev_der2", ledgerId: LEDGER, kind: "ocr" }
    );
    assert.equal(der.ok, true);
    if (!der.ok) throw new Error("derivative");
    assert.match(der.storagePath, /\/derivatives\//);
    assert.doesNotMatch(der.storagePath, /\/original$/);
    const parent = await adapter.getRecord({ uid: OWNER }, { evidenceId: "ev_der2", ledgerId: LEDGER });
    assert.equal(parent.ok, true);
    if (!parent.ok || !parent.verified) throw new Error("parent");
    blobs.FAKE_deleteObject(parent.verified.storagePath);
    const missingOriginal = await adapter.reserveDerivative(
      { uid: OWNER },
      { evidenceId: "ev_der2", ledgerId: LEDGER, kind: "preview" }
    );
    assert.equal(missingOriginal.ok, false);
  }

  evidenceLabel("INJECTED_PORT", "upload concurrency bound");
  {
    const { adapter } = adapterPair();
    const bytes = sampleBytes(20);
    for (const id of ["ev_c1", "ev_c2", "ev_c3"]) {
      const reserved = await adapter.reserve(
        { uid: OWNER },
        {
          evidenceId: id,
          ledgerId: LEDGER,
          receiptId: RECEIPT,
          category: "invoice",
          mime: "application/pdf",
          claimedSha256: sha256Bytes(bytes),
          claimedByteSize: bytes.byteLength,
        }
      );
      assert.equal(reserved.ok, true);
    }
    const b1 = await adapter.beginUpload({ uid: OWNER }, { evidenceId: "ev_c1", ledgerId: LEDGER });
    const b2 = await adapter.beginUpload({ uid: OWNER }, { evidenceId: "ev_c2", ledgerId: LEDGER });
    const b3 = await adapter.beginUpload({ uid: OWNER }, { evidenceId: "ev_c3", ledgerId: LEDGER });
    assert.equal(b1.ok && b2.ok, true);
    assert.equal(b3.ok, false);
    if (!b3.ok) assert.equal(b3.code, "invalid");
  }

  evidenceLabel("INJECTED_PORT", "ER-2 commit after blob I/O re-checks pending_deletion");
  {
    const db = FAKE_createInjectedFirestore();
    const inner = new FAKE_MemoryBlobStore();
    FAKE_seedOwner(db, OWNER, LEDGER, RECEIPT);
    const blobs: G2BlobStore = {
      putIfAbsent: (path, bytes, contentType) => inner.putIfAbsent(path, bytes, contentType),
      async stat(path) {
        const result = await inner.stat(path);
        db.snapshot.set(`users/${OWNER}`, JSON.stringify({ uid: OWNER, status: "pending_deletion" }));
        return result;
      },
      open: (path) => inner.open(path),
    };
    const adapter = new GoodsEvidenceStorageAdapter(db, blobs, testClock());
    const bytes = sampleBytes(21);
    const reserved = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_er2",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(bytes),
        claimedByteSize: bytes.byteLength,
      }
    );
    assert.equal(reserved.ok, true);
    if (!reserved.ok) throw new Error("reserve");
    const began = await adapter.beginUpload({ uid: OWNER }, { evidenceId: "ev_er2", ledgerId: LEDGER });
    assert.equal(began.ok, true);
    await inner.putIfAbsent(reserved.storagePath, bytes, "application/pdf");
    const completed = await adapter.completeUpload({ uid: OWNER }, { evidenceId: "ev_er2", ledgerId: LEDGER });
    assert.equal(completed.ok, false);
    if (!completed.ok) {
      assert.equal(completed.code, "forbidden");
      assert.equal(completed.detail, "denied");
    }
    const raw = db.snapshot.get(evidenceObjectPath(OWNER, LEDGER, "ev_er2"));
    assert.ok(raw);
    const stored = JSON.parse(raw) as { state: string };
    assert.equal(stored.state, "uploading");
    assert.notEqual(stored.state, "uploaded_unverified");
    assert.notEqual(stored.state, "verified");
    assert.notEqual(stored.state, "linked");
  }

  evidenceLabel("INJECTED_PORT", "ER-2 verify commit after open re-checks admission");
  {
    const db = FAKE_createInjectedFirestore();
    const inner = new FAKE_MemoryBlobStore();
    FAKE_seedOwner(db, OWNER, LEDGER, RECEIPT);
    const blobs: G2BlobStore = {
      putIfAbsent: (path, bytes, contentType) => inner.putIfAbsent(path, bytes, contentType),
      stat: (path) => inner.stat(path),
      async open(path) {
        const result = await inner.open(path);
        db.snapshot.set(
          `users/${OWNER}/goodsEvidenceAdmission/runtime`,
          JSON.stringify({ schemaVersion: 1, newCommands: "deny", reconciliation: "allow" })
        );
        return result;
      },
    };
    const adapter = new GoodsEvidenceStorageAdapter(db, blobs, testClock());
    const bytes = sampleBytes(22);
    const reserved = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_er2v",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(bytes),
        claimedByteSize: bytes.byteLength,
      }
    );
    assert.equal(reserved.ok, true);
    if (!reserved.ok) throw new Error("reserve");
    await adapter.beginUpload({ uid: OWNER }, { evidenceId: "ev_er2v", ledgerId: LEDGER });
    await inner.putIfAbsent(reserved.storagePath, bytes, "application/pdf");
    const completed = await adapter.completeUpload({ uid: OWNER }, { evidenceId: "ev_er2v", ledgerId: LEDGER });
    assert.equal(completed.ok, true);
    if (!completed.ok) throw new Error("complete");
    assert.equal(completed.state, "uploaded_unverified");
    const verified = await adapter.verify({ uid: OWNER }, { evidenceId: "ev_er2v", ledgerId: LEDGER });
    assert.equal(verified.ok, false);
    if (!verified.ok) {
      assert.equal(verified.code, "policy_denied");
      assert.equal(verified.detail, "denied");
    }
    const raw = db.snapshot.get(evidenceObjectPath(OWNER, LEDGER, "ev_er2v"));
    assert.ok(raw);
    const stored = JSON.parse(raw) as { state: string };
    assert.equal(stored.state, "uploaded_unverified");
    assert.notEqual(stored.state, "verified");
    assert.notEqual(stored.state, "linked");
  }

  evidenceLabel("INJECTED_PORT", "outbox evidence port uploads original and treats client hash as a claim");
  {
    const { adapter, blobs } = adapterPair();
    const bytes = pdfBytes(7);
    const wrongClaim = "c".repeat(64);
    const files = new Map<string, Uint8Array>([["/tmp/grin-orig.pdf", bytes]]);
    const port = makePort(adapter, blobs, files);
    assert.equal(port.portKind, "INJECTED");
    const uploaded = await port.upload(
      originalUpload("ev_port", RECEIPT, "/tmp/grin-orig.pdf", wrongClaim, "invoice")
    );
    assert.equal(uploaded.ok, false);
    assert.equal(uploaded.originalDurable, false);
    assert.equal(uploaded.retryable, false);
    assert.equal(uploaded.reservationId, null);
    const matching = await port.upload(
      originalUpload("ev_port2", RECEIPT, "/tmp/grin-orig.pdf", sha256Bytes(bytes), "invoice")
    );
    assert.equal(matching.ok, true);
    assert.equal(matching.originalDurable, true);
    assert.equal(typeof matching.generation, "string");
    assert.ok(matching.generation);
    assert.equal(matching.evidenceId, "ev_port2");
    assert.equal(matching.receiptId, RECEIPT);
    assert.equal(matching.ledgerId, LEDGER);
    assert.equal(matching.category, "invoice");
    assert.equal(matching.claimedSha256, sha256Bytes(bytes));
    assert.equal(matching.actualSha256, sha256Bytes(bytes));
    assert.ok(matching.reservationId);
    const replayed = await port.upload(
      originalUpload("ev_port2", RECEIPT, "/tmp/grin-orig.pdf", sha256Bytes(bytes), "invoice")
    );
    assert.equal(replayed.ok, true);
    assert.equal(replayed.originalDurable, true);
    assert.equal(replayed.generation, matching.generation);
    assert.equal(replayed.reservationId, matching.reservationId);
    assert.equal(replayed.category, "invoice");
  }

  evidenceLabel("INJECTED_PORT", "W2-03 verified R1 must not make a different R2 file durable");
  {
    const { adapter, blobs, db } = adapterPair();
    const r1Bytes = pdfBytes(1);
    const r2Bytes = pdfBytes(2);
    seedReceipt(db, "receipt_r2");
    const files = new Map<string, Uint8Array>([
      ["/tmp/grin-r1.pdf", r1Bytes],
      ["/tmp/grin-r2.pdf", r2Bytes],
    ]);
    const port = makePort(adapter, blobs, files);
    const r1 = await port.upload(
      originalUpload("ev_shared", RECEIPT, "/tmp/grin-r1.pdf", sha256Bytes(r1Bytes), "invoice")
    );
    assert.equal(r1.ok, true);
    assert.equal(r1.originalDurable, true);
    const r2 = await port.upload(
      originalUpload("ev_shared", "receipt_r2", "/tmp/grin-r2.pdf", sha256Bytes(r2Bytes), "weighment")
    );
    assert.equal(r2.originalDurable, false);
    assert.equal(r2.ok, false);
    assert.equal(r2.retryable, false);
    assert.equal(r2.reservationId, null);
    assert.notEqual(r2.receiptId, RECEIPT);
    assert.equal(r2.receiptId, "receipt_r2");
    assert.equal(r2.evidenceId, "ev_shared");
    const stored = await adapter.getRecord(
      { uid: OWNER },
      { evidenceId: "ev_shared", ledgerId: LEDGER, receiptId: RECEIPT }
    );
    assert.equal(stored.ok, true);
    if (stored.ok) {
      assert.equal(stored.receiptId, RECEIPT);
      assert.equal(stored.category, "invoice");
      assert.equal(blobs.objects.size, 1);
    }
  }

  evidenceLabel("INJECTED_PORT", "W2-03 missing or invalid category fails and is not invoice");
  {
    const { adapter, blobs } = adapterPair();
    const bytes = pdfBytes(3);
    const files = new Map<string, Uint8Array>([["/tmp/grin-cat.pdf", bytes]]);
    const port = makePort(adapter, blobs, files);
    const missing = await port.upload({
      uid: OWNER,
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      evidenceId: "ev_cat_missing",
      role: "original",
      localPath: "/tmp/grin-cat.pdf",
      claimedSha256: sha256Bytes(bytes),
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.originalDurable, false);
    assert.equal(missing.retryable, false);
    assert.equal(missing.category, null);
    const invalid = await port.upload(
      originalUpload("ev_cat_invalid", RECEIPT, "/tmp/grin-cat.pdf", sha256Bytes(bytes), "not-a-category")
    );
    assert.equal(invalid.ok, false);
    assert.equal(invalid.originalDurable, false);
    assert.equal(invalid.retryable, false);
    assert.equal(invalid.category, null);
    const silentInvoice = await adapter.getRecord(
      { uid: OWNER },
      { evidenceId: "ev_cat_missing", ledgerId: LEDGER }
    );
    assert.equal(silentInvoice.ok, false);
  }

  evidenceLabel("INJECTED_PORT", "W2-03 matching replay and explicit invoice weighment vehicle qc");
  {
    const { adapter, blobs } = adapterPair();
    const invoice = pdfBytes(4);
    const weighment = jpegBytes(5);
    const vehicle = jpegBytes(6);
    const qc = pngBytes(8);
    const files = new Map<string, Uint8Array>([
      ["/tmp/grin-invoice.pdf", invoice],
      ["/tmp/grin-weighment.jpg", weighment],
      ["/tmp/grin-vehicle.jpg", vehicle],
      ["/tmp/grin-qc.png", qc],
    ]);
    const port = makePort(adapter, blobs, files);
    const cases = [
      { id: "ev_cat_invoice", path: "/tmp/grin-invoice.pdf", bytes: invoice, category: "invoice" },
      { id: "ev_cat_weighment", path: "/tmp/grin-weighment.jpg", bytes: weighment, category: "weighment" },
      { id: "ev_cat_vehicle", path: "/tmp/grin-vehicle.jpg", bytes: vehicle, category: "vehicle" },
      { id: "ev_cat_qc", path: "/tmp/grin-qc.png", bytes: qc, category: "qc" },
    ];
    for (const item of cases) {
      const uploaded = await port.upload(
        originalUpload(item.id, RECEIPT, item.path, sha256Bytes(item.bytes), item.category)
      );
      assert.equal(uploaded.ok, true, item.id);
      assert.equal(uploaded.originalDurable, true, item.id);
      assert.equal(uploaded.category, item.category);
      assert.equal(uploaded.receiptId, RECEIPT);
      assert.equal(uploaded.actualSha256, sha256Bytes(item.bytes));
      assert.ok(uploaded.reservationId);
      const replayed = await port.upload(
        originalUpload(item.id, RECEIPT, item.path, sha256Bytes(item.bytes), item.category)
      );
      assert.equal(replayed.originalDurable, true, `${item.id} replay`);
      assert.equal(replayed.reservationId, uploaded.reservationId);
      assert.equal(replayed.generation, uploaded.generation);
      assert.equal(replayed.category, item.category);
    }
  }

  evidenceLabel("INJECTED_PORT", "W2-03 interrupted upload recovers without duplicate evidence");
  {
    const { adapter, blobs } = adapterPair();
    const bytes = pdfBytes(9);
    const files = new Map<string, Uint8Array>([["/tmp/grin-int.pdf", bytes]]);
    const reserved = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_port_int",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(bytes),
        claimedByteSize: bytes.byteLength,
      }
    );
    assert.equal(reserved.ok, true);
    if (!reserved.ok) throw new Error("reserve");
    await adapter.beginUpload({ uid: OWNER }, { evidenceId: "ev_port_int", ledgerId: LEDGER, receiptId: RECEIPT });
    await blobs.putIfAbsent(reserved.storagePath, bytes, "application/pdf");
    const port = makePort(adapter, blobs, files);
    const recovered = await port.upload(
      originalUpload("ev_port_int", RECEIPT, "/tmp/grin-int.pdf", sha256Bytes(bytes), "invoice")
    );
    assert.equal(recovered.ok, true);
    assert.equal(recovered.originalDurable, true);
    assert.equal(recovered.evidenceId, "ev_port_int");
    assert.equal(recovered.receiptId, RECEIPT);
    assert.equal(recovered.category, "invoice");
    assert.equal(recovered.reservationId, reserved.objectKey);
    assert.equal(blobs.objects.size, 1);
    const linked = await adapter.getRecord(
      { uid: OWNER },
      { evidenceId: "ev_port_int", ledgerId: LEDGER, receiptId: RECEIPT }
    );
    assert.equal(linked.ok, true);
    if (linked.ok) assert.equal(linked.state, "linked");
  }

  evidenceLabel("INJECTED_PORT", "W2-03 same receipt different local file is not durable");
  {
    const { adapter, blobs } = adapterPair();
    const first = pdfBytes(10);
    const second = pdfBytes(11);
    const files = new Map<string, Uint8Array>([
      ["/tmp/grin-a.pdf", first],
      ["/tmp/grin-b.pdf", second],
    ]);
    const port = makePort(adapter, blobs, files);
    const uploaded = await port.upload(
      originalUpload("ev_swap", RECEIPT, "/tmp/grin-a.pdf", sha256Bytes(first), "invoice")
    );
    assert.equal(uploaded.originalDurable, true);
    const swapped = await port.upload(
      originalUpload("ev_swap", RECEIPT, "/tmp/grin-b.pdf", sha256Bytes(second), "invoice")
    );
    assert.equal(swapped.originalDurable, false);
    assert.equal(swapped.ok, false);
    assert.equal(swapped.reservationId, null);
    assert.equal(blobs.objects.size, 1);
  }

  evidenceLabel("INJECTED_PORT", "stale complete cannot clobber newer verification");
  {
    const db = FAKE_createInjectedFirestore();
    const inner = new FAKE_MemoryBlobStore();
    FAKE_seedOwner(db, OWNER, LEDGER, RECEIPT);
    const blobs: G2BlobStore = {
      putIfAbsent: (path, bytes, contentType) => inner.putIfAbsent(path, bytes, contentType),
      async stat(path) {
        const result = await inner.stat(path);
        const raw = db.snapshot.get(evidenceObjectPath(OWNER, LEDGER, "ev_stale"));
        if (raw && result) {
          const rec = JSON.parse(raw) as Record<string, unknown>;
          if (rec.state === "uploading") {
            db.snapshot.set(
              evidenceObjectPath(OWNER, LEDGER, "ev_stale"),
              JSON.stringify({
                ...rec,
                state: "verified",
                generation: "newer-gen",
                actualSha256: sha256Bytes(sampleBytes(30)),
                actualByteSize: 32,
                verifiedAtUtc: "2026-10-01T12:00:00.000Z",
                lifecycleVersion: Number(rec.lifecycleVersion ?? 1) + 5,
                verifiedResult: {
                  evidenceId: "ev_stale",
                  ownerUid: OWNER,
                  ledgerId: LEDGER,
                  receiptId: RECEIPT,
                  category: "invoice",
                  mime: "application/pdf",
                  byteSize: 32,
                  rawSha256: "a".repeat(64),
                  storagePath: rec.storagePath,
                  generation: "newer-gen",
                  verifiedAtUtc: "2026-10-01T12:00:00.000Z",
                },
              })
            );
          }
        }
        return result;
      },
      open: (path) => inner.open(path),
    };
    const adapter = new GoodsEvidenceStorageAdapter(db, blobs, testClock());
    const bytes = sampleBytes(30);
    const reserved = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: "ev_stale",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(bytes),
        claimedByteSize: bytes.byteLength,
      }
    );
    assert.equal(reserved.ok, true);
    if (!reserved.ok) throw new Error("reserve");
    await adapter.beginUpload({ uid: OWNER }, { evidenceId: "ev_stale", ledgerId: LEDGER });
    await inner.putIfAbsent(reserved.storagePath, bytes, "application/pdf");
    const completed = await adapter.completeUpload({ uid: OWNER }, { evidenceId: "ev_stale", ledgerId: LEDGER });
    assert.equal(completed.ok, false);
    if (!completed.ok) assert.equal(completed.code, "invalid");
    const raw = db.snapshot.get(evidenceObjectPath(OWNER, LEDGER, "ev_stale"));
    assert.ok(raw);
    const stored = JSON.parse(raw) as { state: string; generation: string };
    assert.equal(stored.state, "verified");
    assert.equal(stored.generation, "newer-gen");
  }

  console.log("tools/goods-evidence-storage/injected.unit.test.ts: ok");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
