/**
 * INJECTED focused F3 test: retrieve + link + pack-input assembly (A and B).
 * FAKE_* stores only. Not NATIVE_DEVICE. Not a live callable.
 *
 * Path A: confirmed events, no verified originals → mayMarkComplete false with explicit gaps.
 * Path B: Wave-1 originals satisfying coverage policy → mayMarkComplete true without forcing it.
 */
import assert from "node:assert/strict";

import { freezeCommand } from "../../src/goodsEvidence/command";
import { assembleEvidencePackInputs, type GrinPackOriginalInput } from "../../src/goodsEvidence/evidencePackInputs";
import { assembleManifest, mayMarkComplete } from "../../src/goodsEvidence/evidencePack";
import { InMemoryGoodsLedger } from "../../src/goodsEvidence/ledger";
import { sampleRegisterBody } from "../../src/goodsEvidence/testFixtures";
import { createInjectedGrinEvidencePort, type GrinEvidencePortUploadInput } from "./evidencePort";
import { FAKE_createInjectedFirestore, FAKE_seedOwner } from "./FAKE_injectedFirestore";
import { FAKE_MemoryBlobStore } from "./FAKE_memoryBlobStore";
import { GoodsEvidenceStorageAdapter } from "./adapter";
import { evidenceLabel, sha256Bytes, testClock } from "./testSupport";
import type { G2RetrieveSuccess } from "./types";

const OWNER = "owner_g2";
const OTHER = "mallory_g2";
const LEDGER = "ledger_g2";
const RECEIPT = "receipt_g2";
const OTHER_RECEIPT = "receipt_other";

function pdfBytes(fill: number, length = 16): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.set([0x25, 0x50, 0x44, 0x46]);
  bytes.fill(fill, 4);
  return bytes;
}

function jpegBytes(fill: number, length = 16): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.set([0xff, 0xd8, 0xff]);
  bytes.fill(fill, 3);
  return bytes;
}

function denyAdmission(db: ReturnType<typeof FAKE_createInjectedFirestore>): void {
  db.snapshot.set(
    `users/${OWNER}/goodsEvidenceAdmission/runtime`,
    JSON.stringify({ schemaVersion: 1, newCommands: "deny", reconciliation: "allow" })
  );
}

function packOriginalFromRetrieve(
  retrieved: G2RetrieveSuccess & { original: { evidenceId: string } | null }
): GrinPackOriginalInput {
  return {
    evidenceId: retrieved.evidenceId,
    ownerUid: retrieved.ownerUid,
    ledgerId: retrieved.ledgerId,
    receiptId: retrieved.receiptId,
    category: retrieved.category,
    mime: retrieved.mime,
    byteSize: retrieved.byteSize,
    rawSha256: retrieved.actualSha256,
    generation: retrieved.generation,
    originalFileName: retrieved.originalFileName,
    state: retrieved.state,
  };
}

function originalUpload(
  evidenceId: string,
  localPath: string,
  claimedSha256: string,
  category: string,
  receiptId = RECEIPT
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

async function main(): Promise<void> {
  const db = FAKE_createInjectedFirestore();
  const blobs = new FAKE_MemoryBlobStore();
  FAKE_seedOwner(db, OWNER, LEDGER, RECEIPT);
  FAKE_seedOwner(db, OTHER, "ledger_other", OTHER_RECEIPT);
  db.snapshot.set(
    `users/${OWNER}/goodsEvidenceLedgers/${LEDGER}/receipts/${OTHER_RECEIPT}`,
    JSON.stringify({ original: { receiptId: OTHER_RECEIPT, ownerUid: OWNER, ledgerId: LEDGER } })
  );
  const adapter = new GoodsEvidenceStorageAdapter(db, blobs, testClock());
  const invoice = pdfBytes(1);
  const movement = pdfBytes(2);
  const unloading = jpegBytes(3);
  const files = new Map<string, Uint8Array>([
    ["/tmp/grin-invoice.pdf", invoice],
    ["/tmp/grin-lr.pdf", movement],
    ["/tmp/grin-unload.jpg", unloading],
  ]);
  const port = createInjectedGrinEvidencePort({
    adapter,
    blobs,
    readLocalFile: async (localPath) => {
      const found = files.get(localPath);
      if (!found) throw new Error("missing");
      return found;
    },
  });

  evidenceLabel("INJECTED", "F3 upload then link then retrieve identity");
  const uploadedInvoice = await port.upload(
    originalUpload("ev_pack_invoice", "/tmp/grin-invoice.pdf", sha256Bytes(invoice), "invoice")
  );
  assert.equal(uploadedInvoice.ok, true);
  assert.equal(uploadedInvoice.originalDurable, true);
  assert.equal(uploadedInvoice.category, "invoice");
  assert.ok(uploadedInvoice.reservationId);
  const uploadedMove = await port.upload(
    originalUpload("ev_pack_lr", "/tmp/grin-lr.pdf", sha256Bytes(movement), "lr_bilty")
  );
  assert.equal(uploadedMove.ok, true);
  const uploadedUnload = await port.upload(
    originalUpload("ev_pack_unload", "/tmp/grin-unload.jpg", sha256Bytes(unloading), "unloading")
  );
  assert.equal(uploadedUnload.ok, true);
  assert.equal(blobs.objects.size, 3);

  const invoiceRecord = await adapter.getRecord(
    { uid: OWNER },
    { evidenceId: "ev_pack_invoice", ledgerId: LEDGER, receiptId: RECEIPT }
  );
  assert.equal(invoiceRecord.ok, true);
  if (!invoiceRecord.ok || !invoiceRecord.verified) throw new Error("invoice verified");
  assert.equal(invoiceRecord.state, "linked");
  const linkedAgain = await port.linkVerified({ uid: OWNER, verified: invoiceRecord.verified });
  assert.equal(linkedAgain.ok, true);
  assert.equal(linkedAgain.originalDurable, true);
  assert.equal(linkedAgain.reservationId, uploadedInvoice.reservationId);

  evidenceLabel("INJECTED", "F3 reserved original is not retrievable; no duplicate objects on recovery");
  const reservedOnly = await adapter.reserve(
    { uid: OWNER },
    {
      evidenceId: "ev_pack_reserved",
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      category: "qc",
      mime: "application/pdf",
      claimedSha256: sha256Bytes(pdfBytes(9)),
      claimedByteSize: 16,
    }
  );
  assert.equal(reservedOnly.ok, true);
  const reservedRetrieve = await port.retrieveRetainedOriginal({
    uid: OWNER,
    ledgerId: LEDGER,
    receiptId: RECEIPT,
    evidenceId: "ev_pack_reserved",
  });
  assert.equal(reservedRetrieve.ok, false);
  if (!reservedRetrieve.ok) {
    assert.equal(reservedRetrieve.code, "invalid");
    assert.match(reservedRetrieve.detail, /not retained/);
  }

  const recovered = await port.upload(
    originalUpload("ev_pack_invoice", "/tmp/grin-invoice.pdf", sha256Bytes(invoice), "invoice")
  );
  assert.equal(recovered.originalDurable, true);
  assert.equal(recovered.reservationId, uploadedInvoice.reservationId);
  assert.equal(blobs.objects.size, 3);

  evidenceLabel("INJECTED", "F3 retained retrieve and list survive newCommands=deny");
  denyAdmission(db);
  const newUpload = await port.upload(
    originalUpload("ev_pack_after_deny", "/tmp/grin-invoice.pdf", sha256Bytes(invoice), "invoice")
  );
  assert.equal(newUpload.ok, false);
  assert.equal(newUpload.originalDurable, false);
  const getWhileDenied = await adapter.getRecord(
    { uid: OWNER },
    { evidenceId: "ev_pack_invoice", ledgerId: LEDGER, receiptId: RECEIPT }
  );
  assert.equal(getWhileDenied.ok, false);
  if (!getWhileDenied.ok) assert.equal(getWhileDenied.code, "policy_denied");
  const retrievedInvoice = await port.retrieveRetainedOriginal({
    uid: OWNER,
    ledgerId: LEDGER,
    receiptId: RECEIPT,
    evidenceId: "ev_pack_invoice",
  });
  assert.equal(retrievedInvoice.ok, true);
  if (!retrievedInvoice.ok) throw new Error("retrieve invoice");
  assert.equal(retrievedInvoice.state, "linked");
  assert.equal(retrievedInvoice.actualSha256, sha256Bytes(invoice));
  assert.equal(retrievedInvoice.claimedSha256, sha256Bytes(invoice));
  assert.equal(retrievedInvoice.reservationId, uploadedInvoice.reservationId);
  assert.equal(retrievedInvoice.originalDurable, true);
  assert.ok(retrievedInvoice.original);
  assert.equal(retrievedInvoice.original?.isDerivative, false);
  assert.equal("bytes" in retrievedInvoice, false);

  const listed = await port.listRetainedOriginals({ uid: OWNER, ledgerId: LEDGER, receiptId: RECEIPT });
  assert.equal(listed.ok, true);
  if (!listed.ok) throw new Error("list");
  const retainedIds = listed.retained.map((item) => item.evidenceId).sort();
  assert.deepEqual(retainedIds, ["ev_pack_invoice", "ev_pack_lr", "ev_pack_unload"]);
  assert.ok(listed.unverifiable.includes("ev_pack_reserved"));

  const mallory = await port.retrieveRetainedOriginal({
    uid: OTHER,
    ledgerId: LEDGER,
    receiptId: RECEIPT,
    evidenceId: "ev_pack_invoice",
  });
  assert.equal(mallory.ok, false);
  if (!mallory.ok) assert.equal(mallory.code, "forbidden");

  evidenceLabel("INJECTED", "F3 pack path A missing evidence has explicit gaps");
  let packSeq = 0;
  const ledger = new InMemoryGoodsLedger(
    OWNER,
    LEDGER,
    {
      nowMs: () => Date.UTC(2026, 8, 28, 12, 0, 0, 0),
      uuid: () => `pack_${++packSeq}`,
    },
    "simulated-domain-test"
  );
  const registered = ledger.register(
    freezeCommand({
      commandId: "pack_reg_g2",
      type: "registerGoodsReceipt",
      ownerUid: OWNER,
      ledgerId: LEDGER,
      body: sampleRegisterBody({ receiptId: RECEIPT }),
    })
  );
  assert.equal(registered.ok, true);
  if (!registered.ok) throw new Error("register fixture");
  const originalSnapshot = ledger.getOriginal(RECEIPT)!;
  const events = ledger.getEvents(RECEIPT);
  const confirmed = {
    receiptId: RECEIPT,
    events,
    originalSnapshot,
    eventVersion: 1,
    headHash: events[0]!.eventHash,
  };
  const pathA = assembleEvidencePackInputs({
    ownerUid: OWNER,
    ledgerId: LEDGER,
    purchaseCaseId: `case-${RECEIPT}`,
    confirmedCuts: [confirmed],
    originals: [],
  });
  assert.equal(pathA.verifiedOriginals.length, 0);
  assert.ok(pathA.missingOrUnverifiable.some((reason) => reason.includes("invoice reference is not a retained invoice original")));
  assert.ok(pathA.missingOrUnverifiable.some((reason) => reason.includes("movement_evidence")));
  const manifestA = assembleManifest({
    exportId: "g2-path-a",
    ownerUid: OWNER,
    ledgerId: LEDGER,
    purchaseCaseId: `case-${RECEIPT}`,
    pinnedCuts: pathA.pinnedCuts,
    verifiedOriginals: pathA.verifiedOriginals,
    artifactHashes: pathA.artifactHashes,
    missingOrUnverifiable: pathA.missingOrUnverifiable,
    eventStreams: pathA.eventStreams,
    originalSnapshots: pathA.originalSnapshots,
    inventoryDispositions: pathA.inventoryDispositions,
    evidenceLinks: pathA.evidenceLinks,
    templateVersion: "grin-g2-pack-v1",
  });
  assert.equal(manifestA.completeness, "incomplete");
  assert.equal(manifestA.itcDisposition, "not_determined");
  assert.equal(mayMarkComplete(manifestA), false);
  assert.notEqual(manifestA.completeness, "complete");

  evidenceLabel("INJECTED", "F3 pack path B Wave-1 originals satisfy coverage without forcing completeness");
  const retrievedMove = await port.retrieveRetainedOriginal({
    uid: OWNER,
    ledgerId: LEDGER,
    receiptId: RECEIPT,
    evidenceId: "ev_pack_lr",
  });
  const retrievedUnload = await port.retrieveRetainedOriginal({
    uid: OWNER,
    ledgerId: LEDGER,
    receiptId: RECEIPT,
    evidenceId: "ev_pack_unload",
  });
  assert.equal(retrievedMove.ok && retrievedUnload.ok, true);
  if (!retrievedMove.ok || !retrievedUnload.ok) throw new Error("retrieve wave-1");
  const pathB = assembleEvidencePackInputs({
    ownerUid: OWNER,
    ledgerId: LEDGER,
    purchaseCaseId: `case-${RECEIPT}`,
    confirmedCuts: [confirmed],
    originals: [
      packOriginalFromRetrieve(retrievedInvoice),
      packOriginalFromRetrieve(retrievedMove),
      packOriginalFromRetrieve(retrievedUnload),
    ],
    notApplicable: [
      {
        itemId: "accounting_payment_evidence",
        policyCode: "no_stock_or_payment_event_recorded_for_this_case",
        reason: "this goods receipt has no stock or payment event recorded",
      },
      {
        itemId: "gst_evidence",
        policyCode: "not_a_gst_reported_goods_purchase",
        reason: "this case is not a GST-reported goods purchase",
      },
    ],
  });
  assert.deepEqual(
    pathB.verifiedOriginals.map((item) => item.evidenceId).sort(),
    ["ev_pack_invoice", "ev_pack_lr", "ev_pack_unload"]
  );
  assert.equal(pathB.artifactHashes.ev_pack_invoice, sha256Bytes(invoice));
  assert.equal(pathB.evidenceLinks.ev_pack_invoice?.scope, "receipt");
  const manifestB = assembleManifest({
    exportId: "g2-path-b",
    ownerUid: OWNER,
    ledgerId: LEDGER,
    purchaseCaseId: `case-${RECEIPT}`,
    pinnedCuts: pathB.pinnedCuts,
    verifiedOriginals: pathB.verifiedOriginals,
    artifactHashes: pathB.artifactHashes,
    missingOrUnverifiable: pathB.missingOrUnverifiable,
    eventStreams: pathB.eventStreams,
    originalSnapshots: pathB.originalSnapshots,
    inventoryDispositions: pathB.inventoryDispositions,
    evidenceLinks: pathB.evidenceLinks,
    templateVersion: "grin-g2-pack-v1",
  });
  assert.equal(manifestB.itcDisposition, "not_determined");
  assert.equal(manifestB.supportPolicyVersion, 2);
  assert.equal(manifestB.inventoryEvaluation.find((item) => item.itemId === "commercial_document")?.kind, "satisfied");
  assert.equal(
    manifestB.inventoryEvaluation.find((item) => item.itemId === "commercial_document")?.evidenceId,
    "ev_pack_invoice"
  );
  assert.equal(
    manifestB.inventoryEvaluation.find((item) => item.itemId === "supplier_identity")?.kind,
    "satisfied_from_snapshot"
  );
  assert.equal(mayMarkComplete(manifestB), true);
  assert.equal(manifestB.completeness, "complete");

  evidenceLabel("INJECTED", "F3 wrong-receipt and corrupt originals stay incomplete");
  const wrongReceiptOriginal: GrinPackOriginalInput = {
    ...packOriginalFromRetrieve(retrievedInvoice),
    evidenceId: "ev_wrong_receipt",
    receiptId: OTHER_RECEIPT,
  };
  const corruptOriginal: GrinPackOriginalInput = {
    ...packOriginalFromRetrieve(retrievedInvoice),
    evidenceId: "ev_corrupt",
    rawSha256: "not-a-hash",
  };
  const tainted = assembleEvidencePackInputs({
    ownerUid: OWNER,
    ledgerId: LEDGER,
    purchaseCaseId: `case-${RECEIPT}`,
    confirmedCuts: [confirmed],
    originals: [packOriginalFromRetrieve(retrievedInvoice), wrongReceiptOriginal, corruptOriginal],
  });
  assert.ok(tainted.missingOrUnverifiable.some((reason) => reason.includes("ev_wrong_receipt")));
  assert.ok(tainted.missingOrUnverifiable.some((reason) => reason.includes("ev_corrupt")));
  assert.equal(tainted.verifiedOriginals.some((item) => item.evidenceId === "ev_wrong_receipt"), false);
  assert.equal(tainted.verifiedOriginals.some((item) => item.evidenceId === "ev_corrupt"), false);
  const taintedManifest = assembleManifest({
    exportId: "g2-tainted",
    ownerUid: OWNER,
    ledgerId: LEDGER,
    purchaseCaseId: `case-${RECEIPT}`,
    pinnedCuts: tainted.pinnedCuts,
    verifiedOriginals: tainted.verifiedOriginals,
    artifactHashes: tainted.artifactHashes,
    missingOrUnverifiable: tainted.missingOrUnverifiable,
    eventStreams: tainted.eventStreams,
    originalSnapshots: tainted.originalSnapshots,
    inventoryDispositions: tainted.inventoryDispositions,
    evidenceLinks: tainted.evidenceLinks,
    templateVersion: "grin-g2-pack-v1",
  });
  assert.equal(mayMarkComplete(taintedManifest), false);

  evidenceLabel("INJECTED", "F3 invoice reference still cannot satisfy commercial_document");
  const invoiceRefOnly = assembleEvidencePackInputs({
    ownerUid: OWNER,
    ledgerId: LEDGER,
    purchaseCaseId: `case-${RECEIPT}`,
    confirmedCuts: [confirmed],
    originals: [packOriginalFromRetrieve(retrievedMove), packOriginalFromRetrieve(retrievedUnload)],
    notApplicable: [
      {
        itemId: "accounting_payment_evidence",
        policyCode: "no_stock_or_payment_event_recorded_for_this_case",
        reason: "this goods receipt has no stock or payment event recorded",
      },
      {
        itemId: "gst_evidence",
        policyCode: "not_a_gst_reported_goods_purchase",
        reason: "this case is not a GST-reported goods purchase",
      },
    ],
  });
  assert.ok(
    invoiceRefOnly.missingOrUnverifiable.some((reason) =>
      reason.includes("invoice reference is not a retained invoice original")
    )
  );
  const invoiceRefManifest = assembleManifest({
    exportId: "g2-invoice-ref",
    ownerUid: OWNER,
    ledgerId: LEDGER,
    purchaseCaseId: `case-${RECEIPT}`,
    pinnedCuts: invoiceRefOnly.pinnedCuts,
    verifiedOriginals: invoiceRefOnly.verifiedOriginals,
    artifactHashes: invoiceRefOnly.artifactHashes,
    missingOrUnverifiable: invoiceRefOnly.missingOrUnverifiable,
    eventStreams: invoiceRefOnly.eventStreams,
    originalSnapshots: invoiceRefOnly.originalSnapshots,
    inventoryDispositions: invoiceRefOnly.inventoryDispositions,
    evidenceLinks: invoiceRefOnly.evidenceLinks,
    templateVersion: "grin-g2-pack-v1",
  });
  assert.equal(mayMarkComplete(invoiceRefManifest), false);

  console.log("tools/goods-evidence-storage/pack.injected.test.ts: ok");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
