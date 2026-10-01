/**
 * STORAGE_EMULATOR + FIRESTORE_EMULATOR adapter tests for G2 Wave 1.
 * Proves blob hashing against emulator bytes. Does not prove production IAM.
 */
import assert from "node:assert/strict";

import { GoodsEvidenceStorageAdapter } from "./adapter";
import {
  adminAppReady,
  fixedClock,
  seedOwner,
  wrapAdminBlobStore,
  wrapAdminFirestore,
} from "./harness";
import { evidenceLabel, sampleBytes, sha256Bytes } from "./testSupport";
import { evidenceObjectPath } from "./paths";

const OWNER = "owner_emu";
const OTHER = "mallory_emu";
const LEDGER = "ledger_emu";
const RECEIPT = "receipt_emu";
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0, 0);

async function main(): Promise<void> {
  const { db, bucket } = adminAppReady();
  const fs = wrapAdminFirestore(db);
  const blobs = wrapAdminBlobStore(bucket);
  await seedOwner(db, OWNER, LEDGER, RECEIPT);
  await seedOwner(db, OTHER, "ledger_other", "receipt_other");
  const adapter = new GoodsEvidenceStorageAdapter(fs, blobs, fixedClock(NOW));
  const otherAdapter = new GoodsEvidenceStorageAdapter(fs, blobs, fixedClock(NOW));

  evidenceLabel("STORAGE_EMULATOR", "trusted verify hashes emulator bytes and binds generation");
  const bytes = sampleBytes(21, 80);
  const reserved = await adapter.reserve(
    { uid: OWNER },
    {
      evidenceId: "ev_emu_1",
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
  assert.equal(storagePathIsSafe(reserved.storagePath), true);
  await adapter.beginUpload({ uid: OWNER }, { evidenceId: "ev_emu_1", ledgerId: LEDGER });
  const put = await blobs.putIfAbsent(reserved.storagePath, bytes, "application/pdf");
  assert.equal(put.ok, true);
  const completed = await adapter.completeUpload({ uid: OWNER }, { evidenceId: "ev_emu_1", ledgerId: LEDGER });
  assert.equal(completed.ok, true);
  const verified = await adapter.verify({ uid: OWNER }, { evidenceId: "ev_emu_1", ledgerId: LEDGER });
  assert.equal(verified.ok, true);
  if (!verified.ok || !verified.verified) throw new Error("verify");
  assert.equal(verified.state, "verified");
  assert.equal(verified.verified.rawSha256, sha256Bytes(bytes));
  assert.equal(verified.verified.byteSize, bytes.byteLength);
  assert.equal(verified.verified.storagePath, reserved.storagePath);
  assert.ok(verified.verified.generation);

  evidenceLabel("FIRESTORE_EMULATOR", "idempotent link writes evidenceLinks pointer");
  const linked = await adapter.link({ uid: OWNER }, verified.verified);
  const linkedAgain = await adapter.link({ uid: OWNER }, verified.verified);
  assert.equal(linked.ok && linkedAgain.ok, true);
  if (!linked.ok || !linkedAgain.ok) throw new Error("link");
  assert.equal(linkedAgain.replayed, true);
  assert.equal(linked.state, "linked");
  const linkSnap = await db
    .doc(`users/${OWNER}/goodsEvidenceLedgers/${LEDGER}/receipts/${RECEIPT}/evidenceLinks/ev_emu_1`)
    .get();
  assert.equal(linkSnap.exists, true);
  assert.equal(linkSnap.data()?.generation, verified.verified.generation);

  evidenceLabel("STORAGE_EMULATOR", "cross-owner adapter access is forbidden");
  const cross = await otherAdapter.getRecord(
    { uid: OTHER },
    { evidenceId: "ev_emu_1", ledgerId: LEDGER }
  );
  assert.equal(cross.ok, false);
  if (!cross.ok) assert.equal(cross.code, "forbidden");

  evidenceLabel("STORAGE_EMULATOR", "replaced generation after verify is rejected");
  const genBytes = sampleBytes(22, 80);
  const reservedGen = await adapter.reserve(
    { uid: OWNER },
    {
      evidenceId: "ev_emu_gen",
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      category: "vehicle",
      mime: "application/pdf",
      claimedSha256: sha256Bytes(genBytes),
      claimedByteSize: genBytes.byteLength,
    }
  );
  assert.equal(reservedGen.ok, true);
  if (!reservedGen.ok) throw new Error("reserve gen");
  await adapter.beginUpload({ uid: OWNER }, { evidenceId: "ev_emu_gen", ledgerId: LEDGER });
  await blobs.putIfAbsent(reservedGen.storagePath, genBytes, "application/pdf");
  await adapter.completeUpload({ uid: OWNER }, { evidenceId: "ev_emu_gen", ledgerId: LEDGER });
  const genVerified = await adapter.verify({ uid: OWNER }, { evidenceId: "ev_emu_gen", ledgerId: LEDGER });
  assert.equal(genVerified.ok, true);
  if (!genVerified.ok) throw new Error("gen verify");
  await blobs.emulatorOverwrite(reservedGen.storagePath, sampleBytes(29, 80), "application/pdf");
  const replaced = await adapter.verify({ uid: OWNER }, { evidenceId: "ev_emu_gen", ledgerId: LEDGER });
  assert.equal(replaced.ok, true);
  if (!replaced.ok) throw new Error("replaced");
  assert.equal(replaced.state, "rejected");

  evidenceLabel("STORAGE_EMULATOR", "missing blob after complete is orphan_pending_review");
  const bytes2 = sampleBytes(23, 64);
  const reserved2 = await adapter.reserve(
    { uid: OWNER },
    {
      evidenceId: "ev_emu_2",
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      category: "ewb",
      mime: "application/pdf",
      claimedSha256: sha256Bytes(bytes2),
      claimedByteSize: bytes2.byteLength,
    }
  );
  assert.equal(reserved2.ok, true);
  if (!reserved2.ok) throw new Error("reserve2");
  await adapter.beginUpload({ uid: OWNER }, { evidenceId: "ev_emu_2", ledgerId: LEDGER });
  await blobs.putIfAbsent(reserved2.storagePath, bytes2, "application/pdf");
  const completed2 = await adapter.completeUpload(
    { uid: OWNER },
    { evidenceId: "ev_emu_2", ledgerId: LEDGER }
  );
  assert.equal(completed2.ok, true);
  await blobs.emulatorDelete(reserved2.storagePath);
  const missing = await adapter.verify({ uid: OWNER }, { evidenceId: "ev_emu_2", ledgerId: LEDGER });
  assert.equal(missing.ok, true);
  if (!missing.ok) throw new Error("missing");
  assert.equal(missing.state, "orphan_pending_review");

  evidenceLabel("STORAGE_EMULATOR", "putIfAbsent refuses overwrite");
  const reserved3 = await adapter.reserve(
    { uid: OWNER },
    {
      evidenceId: "ev_emu_3",
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      category: "qc",
      mime: "image/png",
      claimedSha256: sha256Bytes(sampleBytes(24, 16)),
      claimedByteSize: 16,
    }
  );
  assert.equal(reserved3.ok, true);
  if (!reserved3.ok) throw new Error("reserve3");
  const first = await blobs.putIfAbsent(reserved3.storagePath, sampleBytes(24, 16), "image/png");
  const second = await blobs.putIfAbsent(reserved3.storagePath, sampleBytes(25, 16), "image/png");
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);

  evidenceLabel("STORAGE_EMULATOR", "stale complete cannot clobber newer verification");
  const staleBytes = sampleBytes(31, 32);
  const reservedStale = await adapter.reserve(
    { uid: OWNER },
    {
      evidenceId: "ev_emu_stale",
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      category: "invoice",
      mime: "application/pdf",
      claimedSha256: sha256Bytes(staleBytes),
      claimedByteSize: staleBytes.byteLength,
    }
  );
  assert.equal(reservedStale.ok, true);
  if (!reservedStale.ok) throw new Error("reserve stale");
  await adapter.beginUpload({ uid: OWNER }, { evidenceId: "ev_emu_stale", ledgerId: LEDGER });
  await blobs.putIfAbsent(reservedStale.storagePath, staleBytes, "application/pdf");
  const racing = wrapAdminBlobStore(bucket);
  const racingAdapter = new GoodsEvidenceStorageAdapter(fs, {
    putIfAbsent: (path, bytes, contentType) => racing.putIfAbsent(path, bytes, contentType),
    async stat(path) {
      const result = await racing.stat(path);
      const objectRef = db.doc(evidenceObjectPath(OWNER, LEDGER, "ev_emu_stale"));
      const snap = await objectRef.get();
      const rec = snap.data();
      if (rec && rec.state === "uploading") {
        await objectRef.set({
          ...rec,
          state: "verified",
          generation: "emu-newer-gen",
          actualSha256: "a".repeat(64),
          actualByteSize: staleBytes.byteLength,
          verifiedAtUtc: "2026-10-01T12:00:00.000Z",
          lifecycleVersion: Number(rec.lifecycleVersion ?? 1) + 5,
          verifiedResult: {
            evidenceId: "ev_emu_stale",
            ownerUid: OWNER,
            ledgerId: LEDGER,
            receiptId: RECEIPT,
            category: "invoice",
            mime: "application/pdf",
            byteSize: staleBytes.byteLength,
            rawSha256: "a".repeat(64),
            storagePath: rec.storagePath,
            generation: "emu-newer-gen",
            verifiedAtUtc: "2026-10-01T12:00:00.000Z",
          },
        });
      }
      return result;
    },
    open: (path) => racing.open(path),
  }, fixedClock(NOW));
  const staleComplete = await racingAdapter.completeUpload(
    { uid: OWNER },
    { evidenceId: "ev_emu_stale", ledgerId: LEDGER }
  );
  assert.equal(staleComplete.ok, false);
  if (!staleComplete.ok) assert.equal(staleComplete.code, "invalid");
  const after = await db.doc(evidenceObjectPath(OWNER, LEDGER, "ev_emu_stale")).get();
  assert.equal(after.data()?.state, "verified");
  assert.equal(after.data()?.generation, "emu-newer-gen");

  evidenceLabel("STORAGE_EMULATOR", "retrieve hashes retained bytes when newCommands=deny");
  await db.doc(`users/${OWNER}/goodsEvidenceAdmission/runtime`).set({
    schemaVersion: 1,
    newCommands: "deny",
    reconciliation: "allow",
  });
  const retrieved = await adapter.retrieveOriginal(
    { uid: OWNER },
    { evidenceId: "ev_emu_1", ledgerId: LEDGER, receiptId: RECEIPT }
  );
  assert.equal(retrieved.ok, true);
  if (!retrieved.ok) throw new Error("retrieve");
  assert.equal(retrieved.state, "linked");
  assert.equal(retrieved.actualSha256, sha256Bytes(bytes));
  assert.equal(retrieved.claimedSha256, sha256Bytes(bytes));
  assert.ok(retrieved.reservationId);
  const listed = await adapter.listReceiptEvidenceIds(
    { uid: OWNER },
    { ledgerId: LEDGER, receiptId: RECEIPT }
  );
  assert.equal(listed.ok, true);
  if (!listed.ok) throw new Error("list");
  assert.ok(listed.evidenceIds.includes("ev_emu_1"));
  const verifyDenied = await adapter.verify(
    { uid: OWNER },
    { evidenceId: "ev_emu_1", ledgerId: LEDGER, receiptId: RECEIPT }
  );
  assert.equal(verifyDenied.ok, false);
  if (!verifyDenied.ok) assert.equal(verifyDenied.code, "policy_denied");

  console.log("tools/goods-evidence-storage/storage.emulator.test.ts: ok");
}

function storagePathIsSafe(path: string): boolean {
  return (
    path.startsWith(`users/${OWNER}/grinEvidence/`) &&
    path.endsWith("/original") &&
    !path.includes("invoice") &&
    !path.includes(RECEIPT)
  );
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
