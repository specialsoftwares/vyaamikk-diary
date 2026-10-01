/**
 * ER-5 CS-02: G2 upload-link recovery via Team 2 INJECTED evidence port.
 * Executes existing G2 unit tests, then createInjectedGrinEvidencePort replay.
 * Does not copy adapter lifecycle. STORAGE_EMULATOR only if hosts already set.
 * Not a matrix pass. Not G6. Not NATIVE_DEVICE.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GoodsEvidenceStorageAdapter } from "../../goods-evidence-storage/adapter";
import { createInjectedGrinEvidencePort } from "../../goods-evidence-storage/evidencePort";
import { FAKE_createInjectedFirestore, FAKE_seedOwner } from "../../goods-evidence-storage/FAKE_injectedFirestore";
import { FAKE_MemoryBlobStore } from "../../goods-evidence-storage/FAKE_memoryBlobStore";
import { sha256Bytes, testClock } from "../../goods-evidence-storage/testSupport";
import type { G2BlobStore } from "../../goods-evidence-storage/types";
import { logWorkflowExecution } from "../workflowEvidence";

const OWNER = "owner_cs02";
const LEDGER = "ledger_cs02";
const RECEIPT = "receipt_cs02";
const LOCAL_PATH = "/tmp/grin-cs02-orig.pdf";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function runExistingG2(script: string): void {
  const result = spawnSync("npm", ["run", script], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function executeInjectedPortReplay(): Promise<void> {
  const db = FAKE_createInjectedFirestore();
  const inner = new FAKE_MemoryBlobStore();
  FAKE_seedOwner(db, OWNER, LEDGER, RECEIPT);
  const adapter = new GoodsEvidenceStorageAdapter(db, inner, testClock());
  let putCalls = 0;
  const blobs: G2BlobStore = {
    putIfAbsent: async (path, bytes, contentType) => {
      putCalls += 1;
      return inner.putIfAbsent(path, bytes, contentType);
    },
    stat: (path) => inner.stat(path),
    open: (path) => inner.open(path),
  };
  const bytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
  const port = createInjectedGrinEvidencePort({
    adapter,
    blobs,
    readLocalFile: async (localPath) => {
      if (localPath !== LOCAL_PATH) throw new Error("missing");
      return bytes;
    },
  });
  assert.equal(port.portKind, "INJECTED");
  const input = {
    uid: OWNER,
    ledgerId: LEDGER,
    receiptId: RECEIPT,
    evidenceId: "ev_cs02",
    role: "original" as const,
    localPath: LOCAL_PATH,
    claimedSha256: sha256Bytes(bytes),
    category: "invoice" as const,
  };
  const uploaded = await port.upload(input);
  assert.equal(uploaded.ok, true);
  assert.equal(uploaded.originalDurable, true);
  assert.ok(uploaded.generation);
  assert.equal(putCalls, 1);
  assert.equal(inner.objects.size, 1);
  const replayed = await port.upload(input);
  assert.equal(replayed.ok, true);
  assert.equal(replayed.originalDurable, true);
  assert.equal(replayed.generation, uploaded.generation);
  assert.equal(putCalls, 1);
  assert.equal(inner.objects.size, 1);
}

async function main(): Promise<void> {
  runExistingG2("test:goods-evidence-g2-unit");
  await executeInjectedPortReplay();
  if (process.env.STORAGE_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST) {
    const emu = spawnSync(
      "npx",
      ["--yes", "tsx", join(root, "tools/goods-evidence-storage/storage.emulator.test.ts")],
      { cwd: root, stdio: "inherit", env: process.env }
    );
    if (emu.status !== 0) process.exit(emu.status ?? 1);
  } else {
    console.log("CS-02 STORAGE_EMULATOR not run (STORAGE_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST unset)");
  }
  logWorkflowExecution("CS-02", ["INJECTED_PORT"]);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
