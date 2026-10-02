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
import { assembleManifest, cutMatchesHead, mayMarkComplete } from "../../src/goodsEvidence/evidencePack";
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
  const stock = pdfBytes(4);
  const payment = pdfBytes(5);
  const gst = pdfBytes(6);
  const ret = pdfBytes(7);
  const files = new Map<string, Uint8Array>([
    ["/tmp/grin-invoice.pdf", invoice],
    ["/tmp/grin-lr.pdf", movement],
    ["/tmp/grin-unload.jpg", unloading],
    ["/tmp/grin-stock.pdf", stock],
    ["/tmp/grin-pay.pdf", payment],
    ["/tmp/grin-gst.pdf", gst],
    ["/tmp/grin-return.pdf", ret],
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
  const uploadedStock = await port.upload(
    originalUpload("ev_pack_stock", "/tmp/grin-stock.pdf", sha256Bytes(stock), "stock_accounting")
  );
  assert.equal(uploadedStock.ok, true);
  assert.equal(uploadedStock.category, "stock_accounting");
  const uploadedPay = await port.upload(
    originalUpload("ev_pack_pay", "/tmp/grin-pay.pdf", sha256Bytes(payment), "payment")
  );
  assert.equal(uploadedPay.ok, true);
  const uploadedGst = await port.upload(
    originalUpload("ev_pack_gst", "/tmp/grin-gst.pdf", sha256Bytes(gst), "gst")
  );
  assert.equal(uploadedGst.ok, true);
  const uploadedReturn = await port.upload(
    originalUpload("ev_pack_return", "/tmp/grin-return.pdf", sha256Bytes(ret), "return_document")
  );
  assert.equal(uploadedReturn.ok, true);
  assert.equal(blobs.objects.size, 7);

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
  assert.equal(blobs.objects.size, 7);

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
  assert.deepEqual(retainedIds, [
    "ev_pack_gst",
    "ev_pack_invoice",
    "ev_pack_lr",
    "ev_pack_pay",
    "ev_pack_return",
    "ev_pack_stock",
    "ev_pack_unload",
  ]);
  assert.ok(listed.unverifiable.includes("ev_pack_reserved"));

  const mallory = await port.retrieveRetainedOriginal({
    uid: OTHER,
    ledgerId: LEDGER,
    receiptId: RECEIPT,
    evidenceId: "ev_pack_invoice",
  });
  assert.equal(mallory.ok, false);
  if (!mallory.ok) assert.equal(mallory.code, "forbidden");

  evidenceLabel("INJECTED", "E5 pack path A missing evidence has specific incompleteReasons");
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
  assert.equal(pathA.originalBytesBundled, false);
  assert.equal(pathA.packPayloadKind, "manifest_and_hashes");
  assert.ok(pathA.missingOrUnverifiable.some((reason) => reason.includes("invoice reference is not a retained invoice original")));
  assert.ok(pathA.missingOrUnverifiable.some((reason) => reason.includes("movement_evidence")));
  assert.ok(pathA.missingOrUnverifiable.some((reason) => reason.includes("accounting_payment_evidence")));
  assert.ok(pathA.missingOrUnverifiable.some((reason) => reason.includes("gst_evidence")));
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
  assert.equal(manifestA.coverage, "incomplete");
  assert.equal(manifestA.itcDisposition, "not_determined");
  assert.equal(mayMarkComplete(manifestA), false);
  assert.ok(manifestA.incompleteReasons.some((reason) => reason.includes("invoice reference is not a retained invoice original")));
  assert.ok(manifestA.incompleteReasons.some((reason) => reason.includes("movement_evidence")));
  assert.ok(manifestA.incompleteReasons.some((reason) => reason.includes("accounting_payment_evidence")));
  assert.ok(manifestA.incompleteReasons.some((reason) => reason.includes("gst_evidence")));

  evidenceLabel("INJECTED", "E5 pack path B all required categories via real originals");
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
  const retrievedStock = await port.retrieveRetainedOriginal({
    uid: OWNER,
    ledgerId: LEDGER,
    receiptId: RECEIPT,
    evidenceId: "ev_pack_stock",
  });
  const retrievedPay = await port.retrieveRetainedOriginal({
    uid: OWNER,
    ledgerId: LEDGER,
    receiptId: RECEIPT,
    evidenceId: "ev_pack_pay",
  });
  const retrievedGst = await port.retrieveRetainedOriginal({
    uid: OWNER,
    ledgerId: LEDGER,
    receiptId: RECEIPT,
    evidenceId: "ev_pack_gst",
  });
  const retrievedReturn = await port.retrieveRetainedOriginal({
    uid: OWNER,
    ledgerId: LEDGER,
    receiptId: RECEIPT,
    evidenceId: "ev_pack_return",
  });
  assert.equal(
    retrievedMove.ok &&
      retrievedUnload.ok &&
      retrievedStock.ok &&
      retrievedPay.ok &&
      retrievedGst.ok &&
      retrievedReturn.ok,
    true
  );
  if (
    !retrievedMove.ok ||
    !retrievedUnload.ok ||
    !retrievedStock.ok ||
    !retrievedPay.ok ||
    !retrievedGst.ok ||
    !retrievedReturn.ok
  ) {
    throw new Error("retrieve required originals");
  }
  assert.equal(retrievedInvoice.actualSha256, sha256Bytes(invoice));
  assert.equal(retrievedStock.actualSha256, sha256Bytes(stock));
  assert.equal(retrievedGst.actualSha256, sha256Bytes(gst));
  const pathBOriginals = [
    packOriginalFromRetrieve(retrievedInvoice),
    packOriginalFromRetrieve(retrievedMove),
    packOriginalFromRetrieve(retrievedUnload),
    packOriginalFromRetrieve(retrievedStock),
    packOriginalFromRetrieve(retrievedPay),
    packOriginalFromRetrieve(retrievedGst),
    packOriginalFromRetrieve(retrievedReturn),
  ];
  const pathB = assembleEvidencePackInputs({
    ownerUid: OWNER,
    ledgerId: LEDGER,
    purchaseCaseId: `case-${RECEIPT}`,
    confirmedCuts: [confirmed],
    originals: pathBOriginals,
  });
  assert.equal(pathB.originalBytesBundled, false);
  assert.equal(pathB.packPayloadKind, "manifest_and_hashes");
  assert.deepEqual(
    pathB.verifiedOriginals.map((item) => item.evidenceId).sort(),
    [
      "ev_pack_gst",
      "ev_pack_invoice",
      "ev_pack_lr",
      "ev_pack_pay",
      "ev_pack_return",
      "ev_pack_stock",
      "ev_pack_unload",
    ]
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
  assert.equal(manifestB.coverage, "complete");
  assert.equal(manifestB.inventoryEvaluation.find((item) => item.itemId === "commercial_document")?.kind, "satisfied");
  assert.equal(
    manifestB.inventoryEvaluation.find((item) => item.itemId === "commercial_document")?.evidenceId,
    "ev_pack_invoice"
  );
  assert.equal(
    manifestB.inventoryEvaluation.find((item) => item.itemId === "accounting_payment_evidence")?.kind,
    "satisfied"
  );
  assert.equal(manifestB.inventoryEvaluation.find((item) => item.itemId === "gst_evidence")?.kind, "satisfied");
  assert.equal(
    manifestB.inventoryEvaluation.find((item) => item.itemId === "supplier_identity")?.kind,
    "satisfied_from_snapshot"
  );
  assert.equal(mayMarkComplete(manifestB), true);
  assert.equal(manifestB.completeness, "complete");
  assert.equal(manifestB.incompleteReasons.length, 0);

  evidenceLabel("INJECTED", "E5 pack path C corrupt wrong-receipt wrong-generation stay incomplete");
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
  const wrongGenerationOriginal: GrinPackOriginalInput = {
    ...packOriginalFromRetrieve(retrievedInvoice),
    evidenceId: "ev_wrong_generation",
    generation: "verified",
  };
  const tainted = assembleEvidencePackInputs({
    ownerUid: OWNER,
    ledgerId: LEDGER,
    purchaseCaseId: `case-${RECEIPT}`,
    confirmedCuts: [confirmed],
    originals: [
      packOriginalFromRetrieve(retrievedInvoice),
      wrongReceiptOriginal,
      corruptOriginal,
      wrongGenerationOriginal,
    ],
  });
  assert.ok(tainted.missingOrUnverifiable.some((reason) => reason.includes("ev_wrong_receipt")));
  assert.ok(tainted.missingOrUnverifiable.some((reason) => reason.includes("ev_corrupt")));
  assert.ok(tainted.missingOrUnverifiable.some((reason) => reason.includes("ev_wrong_generation")));
  assert.equal(tainted.verifiedOriginals.some((item) => item.evidenceId === "ev_wrong_receipt"), false);
  assert.equal(tainted.verifiedOriginals.some((item) => item.evidenceId === "ev_corrupt"), false);
  assert.equal(tainted.verifiedOriginals.some((item) => item.evidenceId === "ev_wrong_generation"), false);
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
  assert.ok(taintedManifest.incompleteReasons.length > 0);

  evidenceLabel("INJECTED", "E5 pack path D pinned cut unchanged by later receipt events");
  const pinnedBefore = pathB.pinnedCuts.map((cut) => ({ ...cut }));
  const amended = ledger.amend(
    freezeCommand({
      commandId: "pack_amd_g2",
      type: "amendFields",
      ownerUid: OWNER,
      ledgerId: LEDGER,
      body: {
        receiptId: RECEIPT,
        expectedVersion: 1,
        reason: "later remark",
        changes: { remarks: { kind: "present", value: "after pin" } },
        clientObservedAtUtc: "2026-09-28T13:00:00.000Z",
      },
    })
  );
  assert.equal(amended.ok, true);
  const laterEvents = ledger.getEvents(RECEIPT);
  assert.ok(laterEvents.length > events.length);
  const pathD = assembleEvidencePackInputs({
    ownerUid: OWNER,
    ledgerId: LEDGER,
    purchaseCaseId: `case-${RECEIPT}`,
    confirmedCuts: [
      {
        ...confirmed,
        events: laterEvents,
        eventVersion: pinnedBefore[0]!.eventVersion,
        headHash: pinnedBefore[0]!.headHash,
      },
    ],
    originals: pathBOriginals,
  });
  assert.deepEqual(pathD.pinnedCuts, pinnedBefore);
  const manifestD = assembleManifest({
    exportId: "g2-path-d",
    ownerUid: OWNER,
    ledgerId: LEDGER,
    purchaseCaseId: `case-${RECEIPT}`,
    pinnedCuts: pathD.pinnedCuts,
    verifiedOriginals: pathD.verifiedOriginals,
    artifactHashes: pathD.artifactHashes,
    missingOrUnverifiable: pathD.missingOrUnverifiable,
    eventStreams: pathD.eventStreams,
    originalSnapshots: pathD.originalSnapshots,
    inventoryDispositions: pathD.inventoryDispositions,
    evidenceLinks: pathD.evidenceLinks,
    templateVersion: "grin-g2-pack-v1",
  });
  assert.deepEqual(manifestD.pinnedCuts, pinnedBefore);
  assert.deepEqual(manifestD.verificationAnchors.pinnedCuts, pinnedBefore);
  assert.equal(mayMarkComplete(manifestD), true);
  assert.equal(
    cutMatchesHead(pathD.pinnedCuts[0]!, {
      eventVersion: laterEvents.length,
      headHash: laterEvents[laterEvents.length - 1]!.eventHash,
    }),
    false
  );
  assert.equal(ledger.getOriginal(RECEIPT)!.originalSnapshotHash, originalSnapshot.originalSnapshotHash);

  evidenceLabel("INJECTED", "F3 invoice reference still cannot satisfy commercial_document");
  const invoiceRefOnly = assembleEvidencePackInputs({
    ownerUid: OWNER,
    ledgerId: LEDGER,
    purchaseCaseId: `case-${RECEIPT}`,
    confirmedCuts: [confirmed],
    originals: [packOriginalFromRetrieve(retrievedMove), packOriginalFromRetrieve(retrievedUnload)],
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
  assert.equal(invoiceRefManifest.itcDisposition, "not_determined");

  console.log("tools/goods-evidence-storage/pack.injected.test.ts: ok");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
