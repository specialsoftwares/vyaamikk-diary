/**
 * CS-07 QA: missing original → pack incomplete; G2 derivative cannot reserve without original.
 * PURE_DOMAIN + INJECTED_PORT. Not STORAGE_EMULATOR live bytes. Not a G6 pass.
 */
import assert from "node:assert/strict";

import { evaluatePackCompleteness } from "@/goodsEvidence/evidencePack";

import { GoodsEvidenceStorageAdapter } from "../../goods-evidence-storage/adapter";
import { FAKE_createInjectedFirestore, FAKE_seedOwner } from "../../goods-evidence-storage/FAKE_injectedFirestore";
import { FAKE_MemoryBlobStore } from "../../goods-evidence-storage/FAKE_memoryBlobStore";
import { sampleBytes, sha256Bytes, testClock } from "../../goods-evidence-storage/testSupport";
import { logWorkflowExecution } from "../workflowEvidence";

async function main(): Promise<void> {
  const evaluated = evaluatePackCompleteness({
    ownerUid: "owner_cs07",
    ledgerId: "ledger_cs07",
    purchaseCaseId: "case_cs07",
    pinnedCuts: [],
    verifiedOriginals: [],
    artifactHashes: {},
    missingOrUnverifiable: ["original invoice bytes missing"],
  });
  assert.equal(evaluated.completeness, "incomplete");
  assert.ok(evaluated.incompleteReasons.includes("original invoice bytes missing"));

  const db = FAKE_createInjectedFirestore();
  const blobs = new FAKE_MemoryBlobStore();
  FAKE_seedOwner(db, "owner_cs07", "ledger_cs07", "receipt_cs07");
  const adapter = new GoodsEvidenceStorageAdapter(db, blobs, testClock());
  const bytes = sampleBytes(9);
  const reserved = await adapter.reserve(
    { uid: "owner_cs07" },
    {
      evidenceId: "ev_cs07",
      ledgerId: "ledger_cs07",
      receiptId: "receipt_cs07",
      category: "invoice",
      mime: "application/pdf",
      claimedSha256: sha256Bytes(bytes),
      claimedByteSize: bytes.byteLength,
    }
  );
  assert.equal(reserved.ok, true);
  const early = await adapter.reserveDerivative(
    { uid: "owner_cs07" },
    { evidenceId: "ev_cs07", ledgerId: "ledger_cs07", kind: "thumbnail" }
  );
  assert.equal(early.ok, false);
  logWorkflowExecution("CS-07", ["PURE_DOMAIN", "INJECTED_PORT"]);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
