import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { GOODS_EVIDENCE_SIMULATION_NOTICE } from "./constants";
import { derivativesMustNotReplaceOriginal, evidenceCompleteness, verifyOriginalBytes } from "./evidence";
import { freezeCommand } from "./command";
import {
  assembleManifest,
  cutMatchesHead,
  EVIDENCE_PACK_SECTIONS,
  mayMarkComplete,
  REQUIRED_EVIDENCE_ITEMS,
} from "./evidencePack";
import { hashEventEnvelope } from "./hashChain";
import { InMemoryGoodsLedger } from "./ledger";
import { sampleRegisterBody } from "./testFixtures";
import type { GrinEvent } from "./types";

assert.match(GOODS_EVIDENCE_SIMULATION_NOTICE, /^SIMULATED:/);

/** TEST DOUBLE — not a Storage worker or native streaming hasher. */
const hasher = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const original = new Uint8Array([1, 2, 3, 4]);
const originalHash = hasher(original);
assert.deepEqual(verifyOriginalBytes(originalHash, original, hasher), { ok: true });

const tampered = new Uint8Array([1, 2, 3, 5]);
const mismatch = verifyOriginalBytes(originalHash, tampered, hasher);
assert.equal(mismatch.ok, false);

const thumbnail = new Uint8Array([9, 9]);
const thumbnailHash = hasher(thumbnail);
assert.notEqual(thumbnailHash, originalHash, "thumbnails are separate bytes");

assert.equal(
  derivativesMustNotReplaceOriginal(
    {
      evidenceId: "ev_1",
      category: "invoice",
      originalFileName: "invoice.pdf",
      mime: "application/pdf",
      byteSize: original.byteLength,
      rawSha256: originalHash,
      storageObjectGeneration: null,
      captureProvenance: "test-double",
      osConversionOccurred: false,
      verification: "verified",
      isDerivative: false,
    },
    {
      evidenceId: "ev_1_thumb",
      parentEvidenceId: "ev_1",
      kind: "thumbnail",
      mime: "image/jpeg",
      byteSize: thumbnail.byteLength,
      ownSha256: thumbnailHash,
      isDerivative: true,
    }
  ),
  true
);

assert.equal(evidenceCompleteness("pending"), "not_complete");
assert.equal(evidenceCompleteness("verified"), "complete");

assert.equal(EVIDENCE_PACK_SECTIONS.length, 6);

const dummyCut = {
  receiptId: "r1",
  eventVersion: 2,
  headHash: "abc",
};
assert.equal(cutMatchesHead(dummyCut, { eventVersion: 3, headHash: "abc" }), false);
assert.equal(cutMatchesHead(dummyCut, { eventVersion: 2, headHash: "abc" }), true);

const incomplete = assembleManifest({
  exportId: "exp_1",
  ownerUid: "owner_1",
  ledgerId: "ledger_1",
  purchaseCaseId: "case_1",
  pinnedCuts: [dummyCut],
  verifiedOriginals: [],
  artifactHashes: { "invoice.pdf": originalHash },
  missingOrUnverifiable: ["ewb.pdf missing"],
  templateVersion: "1",
});
assert.equal(incomplete.completeness, "incomplete");
assert.equal(mayMarkComplete(incomplete), false);

const iso = "2026-09-28T12:00:00.000Z";
const eventFields = {
  eventId: "e1",
  receiptId: "r1",
  streamSequence: 1,
  type: "receipt_registered" as const,
  actorUid: "u1",
  serverAcceptedAtUtc: iso,
  clientObservedAtUtc: iso,
  reason: "issued",
  expectedPreviousVersion: 0,
  typedChanges: { issuedNumber: "GRIN/MAIN/FY2026-27/000001" },
  previousHash: null as string | null,
};
const eventHash = hashEventEnvelope(eventFields);
const streamEvent: GrinEvent = {
  schemaVersion: 1,
  ...eventFields,
  eventHash,
  firestoreCommitTime: null,
};
const validCut = {
  receiptId: "r1",
  eventVersion: 1,
  headHash: eventHash,
};

const verifiedOriginal = {
  evidenceId: "ev_1",
  category: "invoice" as const,
  originalFileName: "invoice.pdf",
  mime: "application/pdf",
  byteSize: original.byteLength,
  rawSha256: originalHash,
  storageObjectGeneration: null,
  captureProvenance: "test-double",
  osConversionOccurred: false,
  verification: "verified" as const,
  isDerivative: false as const,
};

const invoiceOnly = assembleManifest({
  exportId: "exp_2",
  ownerUid: "owner_1",
  ledgerId: "ledger_1",
  purchaseCaseId: "case_1",
  pinnedCuts: [validCut],
  verifiedOriginals: [verifiedOriginal],
  artifactHashes: { ev_1: originalHash },
  eventStreams: [{ receiptId: "r1", events: [streamEvent] }],
  missingOrUnverifiable: [],
  templateVersion: "1",
});
assert.equal(invoiceOnly.completeness, "incomplete");
assert.equal(invoiceOnly.itcDisposition, "not_determined");
assert.equal(mayMarkComplete(invoiceOnly), false);

const bogus = assembleManifest({
  exportId: "exp_bad",
  ownerUid: "owner_1",
  ledgerId: "ledger_1",
  purchaseCaseId: "case_1",
  pinnedCuts: [{ receiptId: "r1", eventVersion: 1.5, headHash: "not-a-hash" }],
  verifiedOriginals: [verifiedOriginal],
  artifactHashes: { ev_1: originalHash },
  eventStreams: [{ receiptId: "r1", events: [streamEvent] }],
  templateVersion: "1",
});
assert.equal(bogus.completeness, "incomplete");

let packSeq = 0;
const packStore = new InMemoryGoodsLedger(
  "owner_1",
  "ledger_1",
  {
    nowMs: () => Date.UTC(2026, 8, 28, 12, 0, 0, 0),
    uuid: () => `pack_${++packSeq}`,
  },
  "simulated-domain-test"
);
const registered = packStore.register(
  freezeCommand({
    commandId: "pack_reg",
    type: "registerGoodsReceipt",
    ownerUid: "owner_1",
    ledgerId: "ledger_1",
    body: sampleRegisterBody({ receiptId: "pack_receipt" }),
  })
);
assert.equal(registered.ok, true);
const originalSnapshot = packStore.getOriginal("pack_receipt")!;
const registeredEvents = packStore.getEvents("pack_receipt");
const pin = {
  receiptId: "pack_receipt",
  eventVersion: 1,
  headHash: registeredEvents[0]!.eventHash,
};
const receiptBytes = new Uint8Array([4, 5, 6, 7]);
const receiptHash = hasher(receiptBytes);
const invoiceEvidence = {
  ...verifiedOriginal,
  evidenceId: "ev_invoice",
  rawSha256: originalHash,
};
const receiptEvidence = {
  ...verifiedOriginal,
  evidenceId: "ev_receipt",
  category: "unloading" as const,
  originalFileName: "gate.jpg",
  mime: "image/jpeg",
  byteSize: receiptBytes.byteLength,
  rawSha256: receiptHash,
};
const packLink = {
  scope: "receipt" as const,
  ownerUid: "owner_1",
  ledgerId: "ledger_1",
  purchaseCaseId: "case_1",
  receiptId: "pack_receipt",
};
const booksBytes = new Uint8Array([8, 8, 8, 8]);
const booksHash = hasher(booksBytes);
const gstBytes = new Uint8Array([9, 9, 9, 9]);
const gstHash = hasher(gstBytes);
const booksEvidence = {
  ...verifiedOriginal,
  evidenceId: "ev_books",
  category: "stock_accounting" as const,
  originalFileName: "books-ledger.txt",
  mime: "text/plain",
  byteSize: booksBytes.byteLength,
  rawSha256: booksHash,
  captureProvenance: "labelled-simulation-fixture",
};
const gstEvidence = {
  ...verifiedOriginal,
  evidenceId: "ev_gst",
  category: "gst" as const,
  originalFileName: "gstr-fixture.json",
  mime: "application/json",
  byteSize: gstBytes.byteLength,
  rawSha256: gstHash,
  captureProvenance: "labelled-simulation-fixture",
};
const completeOriginals = [invoiceEvidence, receiptEvidence, booksEvidence, gstEvidence];
const completeHashes = {
  ev_invoice: originalHash,
  ev_receipt: receiptHash,
  ev_books: booksHash,
  ev_gst: gstHash,
};
const completeLinks = {
  ev_invoice: packLink,
  ev_receipt: packLink,
  ev_books: packLink,
  ev_gst: packLink,
};
const completeDispositions = [
  {
    itemId: "supplier_identity" as const,
    kind: "satisfied_from_snapshot" as const,
    snapshotReceiptId: "pack_receipt",
    reason: "supplier identity is recorded on the anchored GRIN snapshot",
  },
  { itemId: "commercial_document" as const, kind: "satisfied" as const, evidenceId: "ev_invoice" },
  {
    itemId: "movement_evidence" as const,
    kind: "satisfied_from_snapshot" as const,
    snapshotReceiptId: "pack_receipt",
    reason: "EWB is recorded as none on the anchored GRIN snapshot",
  },
  { itemId: "receipt_evidence" as const, kind: "satisfied" as const, evidenceId: "ev_receipt" },
  { itemId: "accounting_payment_evidence" as const, kind: "satisfied" as const, evidenceId: "ev_books" },
  { itemId: "gst_evidence" as const, kind: "satisfied" as const, evidenceId: "ev_gst" },
];
assert.equal(completeDispositions.length, REQUIRED_EVIDENCE_ITEMS.length);

const completePack = assembleManifest({
  exportId: "exp_complete",
  ownerUid: "owner_1",
  ledgerId: "ledger_1",
  purchaseCaseId: "case_1",
  pinnedCuts: [pin],
  verifiedOriginals: completeOriginals,
  artifactHashes: completeHashes,
  eventStreams: [{ receiptId: "pack_receipt", events: registeredEvents }],
  originalSnapshots: [originalSnapshot],
  inventoryDispositions: completeDispositions,
  evidenceLinks: completeLinks,
  templateVersion: "1",
});
assert.equal(completePack.completeness, "complete");
assert.equal(completePack.integrity, "verified");
assert.equal(completePack.coverage, "complete");
assert.equal(completePack.itcDisposition, "not_determined");
assert.equal(mayMarkComplete(completePack), true);
assert.equal(
  completePack.inventoryEvaluation.find((item) => item.itemId === "supplier_identity")?.kind,
  "satisfied_from_snapshot"
);
assert.equal(
  completePack.inventoryEvaluation.find((item) => item.itemId === "accounting_payment_evidence")?.evidenceId,
  "ev_books"
);
const roundTrip = JSON.parse(JSON.stringify(completePack)) as typeof completePack;
assert.deepEqual(roundTrip.inventoryEvaluation, completePack.inventoryEvaluation);
assert.deepEqual(roundTrip.evidenceAssociations, completePack.evidenceAssociations);
packLink.receiptId = "MUTATED_AFTER_ASSEMBLY";
assert.equal(
  completePack.evidenceAssociations.ev_invoice && completePack.evidenceAssociations.ev_invoice.scope === "receipt"
    ? completePack.evidenceAssociations.ev_invoice.receiptId
    : "",
  "pack_receipt"
);
packLink.receiptId = "pack_receipt";

const otherReceipt = assembleManifest({
  exportId: "exp_other",
  ownerUid: "owner_1",
  ledgerId: "ledger_1",
  purchaseCaseId: "case_1",
  pinnedCuts: [pin],
  verifiedOriginals: completeOriginals,
  artifactHashes: completeHashes,
  eventStreams: [{ receiptId: "pack_receipt", events: registeredEvents }],
  originalSnapshots: [originalSnapshot],
  inventoryDispositions: completeDispositions,
  evidenceLinks: {
    ev_invoice: { ...packLink, receiptId: "OTHER" },
    ev_receipt: packLink,
    ev_books: packLink,
    ev_gst: packLink,
  },
  templateVersion: "1",
});
assert.equal(otherReceipt.completeness, "incomplete");

const missingBooks = assembleManifest({
  exportId: "exp_missing_books",
  ownerUid: "owner_1",
  ledgerId: "ledger_1",
  purchaseCaseId: "case_1",
  pinnedCuts: [pin],
  verifiedOriginals: [invoiceEvidence, receiptEvidence, gstEvidence],
  artifactHashes: { ev_invoice: originalHash, ev_receipt: receiptHash, ev_gst: gstHash },
  eventStreams: [{ receiptId: "pack_receipt", events: registeredEvents }],
  originalSnapshots: [originalSnapshot],
  inventoryDispositions: [
    ...completeDispositions.filter((item) => item.itemId !== "accounting_payment_evidence"),
    {
      itemId: "accounting_payment_evidence",
      kind: "missing",
      reason: "books are not in this simulation fixture",
    },
  ],
  evidenceLinks: { ev_invoice: packLink, ev_receipt: packLink, ev_gst: packLink },
  templateVersion: "1",
});
assert.equal(missingBooks.completeness, "incomplete");
assert.equal(
  missingBooks.inventoryEvaluation.find((item) => item.itemId === "accounting_payment_evidence")?.kind,
  "missing"
);

const serviceNa = assembleManifest({
  exportId: "exp_na",
  ownerUid: "owner_1",
  ledgerId: "ledger_1",
  purchaseCaseId: "case_1",
  pinnedCuts: [pin],
  verifiedOriginals: [invoiceEvidence, receiptEvidence, booksEvidence],
  artifactHashes: { ev_invoice: originalHash, ev_receipt: receiptHash, ev_books: booksHash },
  eventStreams: [{ receiptId: "pack_receipt", events: registeredEvents }],
  originalSnapshots: [originalSnapshot],
  inventoryDispositions: [
    ...completeDispositions.filter((item) => item.itemId !== "gst_evidence"),
    {
      itemId: "gst_evidence",
      kind: "not_applicable",
      reason: "ISD credit; warehouse goods-receipt GST section does not apply",
    },
  ],
  evidenceLinks: { ev_invoice: packLink, ev_receipt: packLink, ev_books: packLink },
  templateVersion: "1",
});
assert.equal(serviceNa.completeness, "complete");
assert.equal(serviceNa.inventoryEvaluation.find((item) => item.itemId === "gst_evidence")?.kind, "not_applicable");
assert.match(
  serviceNa.inventoryEvaluation.find((item) => item.itemId === "gst_evidence")?.reason ?? "",
  /ISD credit/
);

const purchaseShared = assembleManifest({
  exportId: "exp_shared",
  ownerUid: "owner_1",
  ledgerId: "ledger_1",
  purchaseCaseId: "case_1",
  pinnedCuts: [pin],
  verifiedOriginals: completeOriginals,
  artifactHashes: completeHashes,
  eventStreams: [{ receiptId: "pack_receipt", events: registeredEvents }],
  originalSnapshots: [originalSnapshot],
  inventoryDispositions: completeDispositions,
  evidenceLinks: {
    ev_invoice: {
      scope: "purchase",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      purchaseCaseId: "case_1",
      supportsReceiptIds: ["pack_receipt"],
    },
    ev_receipt: packLink,
    ev_books: packLink,
    ev_gst: packLink,
  },
  templateVersion: "1",
});
assert.equal(purchaseShared.completeness, "complete");

const duplicateAssoc = assembleManifest({
  exportId: "exp_dup_assoc",
  ownerUid: "owner_1",
  ledgerId: "ledger_1",
  purchaseCaseId: "case_1",
  pinnedCuts: [pin],
  verifiedOriginals: completeOriginals,
  artifactHashes: completeHashes,
  eventStreams: [{ receiptId: "pack_receipt", events: registeredEvents }],
  originalSnapshots: [originalSnapshot],
  inventoryDispositions: completeDispositions,
  evidenceLinks: {
    ev_invoice: {
      scope: "purchase",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      purchaseCaseId: "case_1",
      supportsReceiptIds: ["pack_receipt", "pack_receipt"],
    },
    ev_receipt: packLink,
    ev_books: packLink,
    ev_gst: packLink,
  },
  templateVersion: "1",
});
assert.equal(duplicateAssoc.completeness, "incomplete");

const second = packStore.register(
  freezeCommand({
    commandId: "pack_reg_b",
    type: "registerGoodsReceipt",
    ownerUid: "owner_1",
    ledgerId: "ledger_1",
    body: sampleRegisterBody({ receiptId: "pack_receipt_b" }),
  })
);
assert.equal(second.ok, true);
const snapshotB = packStore.getOriginal("pack_receipt_b")!;
const eventsB = packStore.getEvents("pack_receipt_b");
const pinB = {
  receiptId: "pack_receipt_b",
  eventVersion: 1,
  headHash: eventsB[0]!.eventHash,
};
const twoCut = assembleManifest({
  exportId: "exp_two",
  ownerUid: "owner_1",
  ledgerId: "ledger_1",
  purchaseCaseId: "case_1",
  pinnedCuts: [pin, pinB],
  verifiedOriginals: completeOriginals,
  artifactHashes: completeHashes,
  eventStreams: [
    { receiptId: "pack_receipt", events: registeredEvents },
    { receiptId: "pack_receipt_b", events: eventsB },
  ],
  originalSnapshots: [originalSnapshot, snapshotB],
  inventoryDispositions: completeDispositions,
  evidenceLinks: {
    ev_invoice: {
      scope: "purchase",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      purchaseCaseId: "case_1",
      supportsReceiptIds: ["pack_receipt", "pack_receipt_b"],
    },
    ev_receipt: packLink,
    ev_books: packLink,
    ev_gst: packLink,
  },
  templateVersion: "1",
});
assert.equal(twoCut.completeness, "complete");

const crossOwner = assembleManifest({
  exportId: "exp_cross",
  ownerUid: "owner_1",
  ledgerId: "ledger_1",
  purchaseCaseId: "case_1",
  pinnedCuts: [pin],
  verifiedOriginals: [invoiceEvidence, receiptEvidence],
  artifactHashes: { ev_invoice: originalHash, ev_receipt: receiptHash },
  eventStreams: [{ receiptId: "pack_receipt", events: registeredEvents }],
  originalSnapshots: [originalSnapshot],
  inventoryDispositions: completeDispositions,
  evidenceLinks: {
    ev_invoice: { ...packLink, ownerUid: "other" },
    ev_receipt: packLink,
  },
  templateVersion: "1",
});
assert.equal(crossOwner.completeness, "incomplete");

const missingAnchor = assembleManifest({
  exportId: "exp_no_anchor",
  ownerUid: "owner_1",
  ledgerId: "ledger_1",
  purchaseCaseId: "case_1",
  pinnedCuts: [pin],
  verifiedOriginals: [invoiceEvidence, receiptEvidence],
  artifactHashes: { ev_invoice: originalHash, ev_receipt: receiptHash },
  eventStreams: [{ receiptId: "pack_receipt", events: registeredEvents }],
  inventoryDispositions: completeDispositions,
  evidenceLinks: { ev_invoice: packLink, ev_receipt: packLink },
  templateVersion: "1",
});
assert.equal(missingAnchor.completeness, "incomplete");

const mixedStream = assembleManifest({
  exportId: "exp_mixed",
  ownerUid: "owner_1",
  ledgerId: "ledger_1",
  purchaseCaseId: "case_1",
  pinnedCuts: [pin],
  verifiedOriginals: [invoiceEvidence, receiptEvidence],
  artifactHashes: { ev_invoice: originalHash, ev_receipt: receiptHash },
  eventStreams: [{ receiptId: "pack_receipt", events: [registeredEvents[0]!, { ...registeredEvents[0]!, receiptId: "other" }] }],
  originalSnapshots: [originalSnapshot],
  inventoryDispositions: completeDispositions,
  evidenceLinks: { ev_invoice: packLink, ev_receipt: packLink },
  templateVersion: "1",
});
assert.equal(mixedStream.completeness, "incomplete");

const omittedArtifact = assembleManifest({
  exportId: "exp_omit",
  ownerUid: "owner_1",
  ledgerId: "ledger_1",
  purchaseCaseId: "case_1",
  pinnedCuts: [pin],
  verifiedOriginals: [invoiceEvidence],
  artifactHashes: { ev_invoice: originalHash },
  eventStreams: [{ receiptId: "pack_receipt", events: registeredEvents }],
  originalSnapshots: [originalSnapshot],
  inventoryDispositions: completeDispositions,
  evidenceLinks: { ev_invoice: packLink },
  templateVersion: "1",
});
assert.equal(omittedArtifact.completeness, "incomplete");

packStore.amend(
  freezeCommand({
    commandId: "pack_amd",
    type: "amendFields",
    ownerUid: "owner_1",
    ledgerId: "ledger_1",
    body: {
      receiptId: "pack_receipt",
      expectedVersion: 1,
      reason: "later note",
      changes: { remarks: { kind: "present", value: "later" } },
      clientObservedAtUtc: iso,
    },
  })
);
const laterEvents = packStore.getEvents("pack_receipt");
assert.equal(laterEvents.length, 2);
const pinnedAfterLater = assembleManifest({
  exportId: "exp_pinned",
  ownerUid: "owner_1",
  ledgerId: "ledger_1",
  purchaseCaseId: "case_1",
  pinnedCuts: [pin],
  verifiedOriginals: completeOriginals,
  artifactHashes: completeHashes,
  eventStreams: [{ receiptId: "pack_receipt", events: laterEvents }],
  originalSnapshots: [originalSnapshot],
  inventoryDispositions: completeDispositions,
  evidenceLinks: completeLinks,
  templateVersion: "1",
});
assert.equal(pinnedAfterLater.completeness, completePack.completeness);
assert.equal(pinnedAfterLater.pinnedCuts[0]?.headHash, completePack.pinnedCuts[0]?.headHash);

console.log("goodsEvidence/evidence.pack.test.ts: ok");
