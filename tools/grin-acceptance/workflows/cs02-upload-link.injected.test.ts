/**
 * CS-02 QA: G2 upload completes, blob disappears, verify → orphan_pending_review.
 * INJECTED_PORT only. Not STORAGE_EMULATOR. Not a G6 pass.
 */
import assert from "node:assert/strict";

import { GoodsEvidenceStorageAdapter } from "../../goods-evidence-storage/adapter";
import { FAKE_createInjectedFirestore, FAKE_seedOwner } from "../../goods-evidence-storage/FAKE_injectedFirestore";
import { FAKE_MemoryBlobStore } from "../../goods-evidence-storage/FAKE_memoryBlobStore";
import { sampleBytes, sha256Bytes, testClock } from "../../goods-evidence-storage/testSupport";
import { logWorkflowExecution } from "../workflowEvidence";

const OWNER = "owner_cs02";
const LEDGER = "ledger_cs02";
const RECEIPT = "receipt_cs02";

async function main(): Promise<void> {
  const db = FAKE_createInjectedFirestore();
  const blobs = new FAKE_MemoryBlobStore();
  FAKE_seedOwner(db, OWNER, LEDGER, RECEIPT);
  const adapter = new GoodsEvidenceStorageAdapter(db, blobs, testClock());
  const bytes = sampleBytes(21);
  const reserved = await adapter.reserve(
    { uid: OWNER },
    {
      evidenceId: "ev_cs02",
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
  const began = await adapter.beginUpload({ uid: OWNER }, { evidenceId: "ev_cs02", ledgerId: LEDGER });
  assert.equal(began.ok, true);
  const put = await blobs.putIfAbsent(reserved.storagePath, bytes, "application/pdf");
  assert.equal(put.ok, true);
  const completed = await adapter.completeUpload({ uid: OWNER }, { evidenceId: "ev_cs02", ledgerId: LEDGER });
  assert.equal(completed.ok, true);
  blobs.FAKE_deleteObject(reserved.storagePath);
  const missing = await adapter.verify({ uid: OWNER }, { evidenceId: "ev_cs02", ledgerId: LEDGER });
  assert.equal(missing.ok, true);
  if (!missing.ok) throw new Error("verify");
  assert.equal(missing.state, "orphan_pending_review");
  logWorkflowExecution("CS-02", ["INJECTED_PORT"]);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
