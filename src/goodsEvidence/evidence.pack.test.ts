import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { GOODS_EVIDENCE_SIMULATION_NOTICE } from "./constants";
import { derivativesMustNotReplaceOriginal, evidenceCompleteness, verifyOriginalBytes } from "./evidence";
import { freezeCommand } from "./command";
import {
  assembleManifest,
  cutMatchesHead,
  EVIDENCE_PACK_SECTIONS,
  EVIDENCE_SUPPORT_POLICY_VERSION,
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
const movementBytes = new Uint8Array([3, 3, 3, 3]);
const movementHash = hasher(movementBytes);
const movementEvidence = {
  ...verifiedOriginal,
  evidenceId: "ev_move",
  category: "lr_bilty" as const,
  originalFileName: "lr.pdf",
  mime: "application/pdf",
  byteSize: movementBytes.byteLength,
  rawSha256: movementHash,
  captureProvenance: "labelled-simulation-fixture",
};
const completeOriginals = [invoiceEvidence, receiptEvidence, booksEvidence, gstEvidence, movementEvidence];
const completeHashes = {
  ev_invoice: originalHash,
  ev_receipt: receiptHash,
  ev_books: booksHash,
  ev_gst: gstHash,
  ev_move: movementHash,
};
const completeLinks = {
  ev_invoice: packLink,
  ev_receipt: packLink,
  ev_books: packLink,
  ev_gst: packLink,
  ev_move: packLink,
};
const completeDispositions = [
  {
    itemId: "supplier_identity" as const,
    kind: "satisfied_from_snapshot" as const,
    snapshotReceiptId: "pack_receipt",
    reason: "supplier identity is recorded on the anchored GRIN snapshot",
  },
  { itemId: "commercial_document" as const, kind: "satisfied" as const, evidenceId: "ev_invoice" },
  { itemId: "movement_evidence" as const, kind: "satisfied" as const, evidenceId: "ev_move" },
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
assert.equal(completePack.supportPolicyVersion, EVIDENCE_SUPPORT_POLICY_VERSION);
assert.ok(
  (completePack.inventoryEvaluation.find((item) => item.itemId === "supplier_identity")?.supportingFields.length ?? 0) > 0
);
assert.ok(
  completePack.inventoryEvaluation
    .find((item) => item.itemId === "supplier_identity")
    ?.supportingFields.includes("supplier.name")
);
assert.ok(
  completePack.inventoryEvaluation
    .find((item) => item.itemId === "supplier_identity")
    ?.supportingFields.includes("supplier.registration.gstin")
);
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
    ev_move: packLink,
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
  verifiedOriginals: [invoiceEvidence, receiptEvidence, gstEvidence, movementEvidence],
  artifactHashes: { ev_invoice: originalHash, ev_receipt: receiptHash, ev_gst: gstHash, ev_move: movementHash },
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
  evidenceLinks: { ev_invoice: packLink, ev_receipt: packLink, ev_gst: packLink, ev_move: packLink },
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
  verifiedOriginals: [invoiceEvidence, receiptEvidence, booksEvidence, movementEvidence],
  artifactHashes: { ev_invoice: originalHash, ev_receipt: receiptHash, ev_books: booksHash, ev_move: movementHash },
  eventStreams: [{ receiptId: "pack_receipt", events: registeredEvents }],
  originalSnapshots: [originalSnapshot],
  inventoryDispositions: [
    ...completeDispositions.filter((item) => item.itemId !== "gst_evidence"),
    {
      itemId: "gst_evidence",
      kind: "not_applicable",
      policyCode: "not_a_gst_reported_goods_purchase",
      reason: "ISD credit; warehouse goods-receipt GST section does not apply",
    },
  ],
  evidenceLinks: { ev_invoice: packLink, ev_receipt: packLink, ev_books: packLink, ev_move: packLink },
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
    ev_move: packLink,
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
    ev_move: packLink,
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
    ev_move: packLink,
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

{
  const snapshotAll = REQUIRED_EVIDENCE_ITEMS.map((item) => ({
    itemId: item.itemId,
    kind: "satisfied_from_snapshot" as const,
    snapshotReceiptId: "pack_receipt",
    reason: "GRIN snapshot is present",
  }));
  const overstated = assembleManifest({
    exportId: "exp_all_snapshot",
    ownerUid: "owner_1",
    ledgerId: "ledger_1",
    purchaseCaseId: "case_1",
    pinnedCuts: [pin],
    verifiedOriginals: completeOriginals,
    artifactHashes: completeHashes,
    eventStreams: [{ receiptId: "pack_receipt", events: registeredEvents }],
    originalSnapshots: [originalSnapshot],
    inventoryDispositions: snapshotAll,
    evidenceLinks: completeLinks,
    templateVersion: "1",
  });
  assert.equal(overstated.completeness, "incomplete");
  assert.equal(overstated.itcDisposition, "not_determined");
  assert.ok(overstated.incompleteReasons.some((reason) => /accounting_payment_evidence/.test(reason)));
  assert.ok(overstated.incompleteReasons.some((reason) => /gst_evidence/.test(reason)));
  assert.ok(overstated.incompleteReasons.some((reason) => /movement_evidence/.test(reason)));
}

{
  const ewbNone = assembleManifest({
    exportId: "exp_ewb_none",
    ownerUid: "owner_1",
    ledgerId: "ledger_1",
    purchaseCaseId: "case_1",
    pinnedCuts: [pin],
    verifiedOriginals: completeOriginals,
    artifactHashes: completeHashes,
    eventStreams: [{ receiptId: "pack_receipt", events: registeredEvents }],
    originalSnapshots: [originalSnapshot],
    inventoryDispositions: [
      ...completeDispositions.filter((item) => item.itemId !== "movement_evidence"),
      {
        itemId: "movement_evidence",
        kind: "satisfied_from_snapshot",
        snapshotReceiptId: "pack_receipt",
        reason: "EWB is recorded as none on the anchored GRIN snapshot",
      },
    ],
    evidenceLinks: completeLinks,
    templateVersion: "1",
  });
  assert.equal(ewbNone.completeness, "incomplete");
  assert.ok(ewbNone.incompleteReasons.some((reason) => /movement_evidence cannot be satisfied from a GRIN snapshot/.test(reason)));
}

{
  const unknownSupplier = packStore.register(
    freezeCommand({
      commandId: "unknown_sup",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({
        receiptId: "unknown_sup",
        supplier: {
          name: { kind: "unknown", reason: "not on document" },
          registration: { kind: "not_supplied" },
          address: { kind: "not_supplied" },
          contact: { kind: "not_supplied" },
        },
      }),
    })
  );
  assert.equal(unknownSupplier.ok, true);
  const unknownSnap = packStore.getOriginal("unknown_sup")!;
  const unknownEvents = packStore.getEvents("unknown_sup");
  const unknownPin = {
    receiptId: "unknown_sup",
    eventVersion: 1,
    headHash: unknownEvents[0]!.eventHash,
  };
  const unknownLink = { ...packLink, receiptId: "unknown_sup" };
  const unknownIdentity = assembleManifest({
    exportId: "exp_unknown_sup",
    ownerUid: "owner_1",
    ledgerId: "ledger_1",
    purchaseCaseId: "case_1",
    pinnedCuts: [unknownPin],
    verifiedOriginals: completeOriginals.map((item) => item),
    artifactHashes: completeHashes,
    eventStreams: [{ receiptId: "unknown_sup", events: unknownEvents }],
    originalSnapshots: [unknownSnap],
    inventoryDispositions: [
      {
        itemId: "supplier_identity",
        kind: "satisfied_from_snapshot",
        snapshotReceiptId: "unknown_sup",
        reason: "snapshot exists",
      },
      ...completeDispositions.filter((item) => item.itemId !== "supplier_identity"),
    ],
    evidenceLinks: {
      ev_invoice: unknownLink,
      ev_receipt: unknownLink,
      ev_books: unknownLink,
      ev_gst: unknownLink,
      ev_move: unknownLink,
    },
    templateVersion: "1",
  });
  assert.equal(unknownIdentity.completeness, "incomplete");
  assert.ok(
    unknownIdentity.incompleteReasons.some((reason) => /supplier_identity snapshot fields are absent or unknown/.test(reason))
  );
}

{
  const unrelated = assembleManifest({
    exportId: "exp_unrelated",
    ownerUid: "owner_1",
    ledgerId: "ledger_1",
    purchaseCaseId: "case_1",
    pinnedCuts: [pin],
    verifiedOriginals: completeOriginals,
    artifactHashes: completeHashes,
    eventStreams: [{ receiptId: "pack_receipt", events: registeredEvents }],
    originalSnapshots: [originalSnapshot],
    inventoryDispositions: [
      ...completeDispositions.filter((item) => item.itemId !== "gst_evidence"),
      { itemId: "gst_evidence", kind: "satisfied", evidenceId: "ev_invoice" },
    ],
    evidenceLinks: completeLinks,
    templateVersion: "1",
  });
  assert.equal(unrelated.completeness, "incomplete");
  assert.ok(unrelated.incompleteReasons.some((reason) => /does not support gst_evidence/.test(reason)));
}

{
  const parsedKind = JSON.parse(
    JSON.stringify([
      ...completeDispositions.filter((item) => item.itemId !== "gst_evidence"),
      { itemId: "gst_evidence", kind: "looks_fine", evidenceId: "ev_gst" },
    ])
  );
  const unsupportedKind = assembleManifest({
    exportId: "exp_kind",
    ownerUid: "owner_1",
    ledgerId: "ledger_1",
    purchaseCaseId: "case_1",
    pinnedCuts: [pin],
    verifiedOriginals: completeOriginals,
    artifactHashes: completeHashes,
    eventStreams: [{ receiptId: "pack_receipt", events: registeredEvents }],
    originalSnapshots: [originalSnapshot],
    inventoryDispositions: parsedKind,
    evidenceLinks: completeLinks,
    templateVersion: "1",
  });
  assert.equal(unsupportedKind.completeness, "incomplete");
  assert.ok(unsupportedKind.incompleteReasons.some((reason) => /unsupported disposition kind/.test(reason)));
}

{
  const reasonOnly = assembleManifest({
    exportId: "exp_reason",
    ownerUid: "owner_1",
    ledgerId: "ledger_1",
    purchaseCaseId: "case_1",
    pinnedCuts: [pin],
    verifiedOriginals: completeOriginals,
    artifactHashes: completeHashes,
    eventStreams: [{ receiptId: "pack_receipt", events: registeredEvents }],
    originalSnapshots: [originalSnapshot],
    inventoryDispositions: [
      ...completeDispositions.filter((item) => item.itemId !== "movement_evidence"),
      {
        itemId: "movement_evidence",
        kind: "satisfied_from_snapshot",
        snapshotReceiptId: "pack_receipt",
        reason: "EWB not required below any statutory threshold",
      },
    ],
    evidenceLinks: completeLinks,
    templateVersion: "1",
  });
  assert.equal(reasonOnly.completeness, "incomplete");
}

{
  const sharedInvoice = {
    ...invoiceEvidence,
    labelledSupport: {
      inventoryItemIds: ["commercial_document", "supplier_identity"],
      facts: ["invoice_number", "supplier_name_on_invoice"],
    },
  };
  const shared = assembleManifest({
    exportId: "exp_shared_doc",
    ownerUid: "owner_1",
    ledgerId: "ledger_1",
    purchaseCaseId: "case_1",
    pinnedCuts: [pin],
    verifiedOriginals: [sharedInvoice, receiptEvidence, booksEvidence, gstEvidence, movementEvidence],
    artifactHashes: completeHashes,
    eventStreams: [{ receiptId: "pack_receipt", events: registeredEvents }],
    originalSnapshots: [originalSnapshot],
    inventoryDispositions: [
      { itemId: "supplier_identity", kind: "satisfied", evidenceId: "ev_invoice" },
      { itemId: "commercial_document", kind: "satisfied", evidenceId: "ev_invoice" },
      { itemId: "movement_evidence", kind: "satisfied", evidenceId: "ev_move" },
      { itemId: "receipt_evidence", kind: "satisfied", evidenceId: "ev_receipt" },
      { itemId: "accounting_payment_evidence", kind: "satisfied", evidenceId: "ev_books" },
      { itemId: "gst_evidence", kind: "satisfied", evidenceId: "ev_gst" },
    ],
    evidenceLinks: completeLinks,
    templateVersion: "1",
  });
  assert.equal(shared.completeness, "complete");
  assert.equal(shared.itcDisposition, "not_determined");
}

{
  const missingSourceAsNa = assembleManifest({
    exportId: "exp_na_missing",
    ownerUid: "owner_1",
    ledgerId: "ledger_1",
    purchaseCaseId: "case_1",
    pinnedCuts: [pin],
    verifiedOriginals: [invoiceEvidence, receiptEvidence, booksEvidence, movementEvidence],
    artifactHashes: { ev_invoice: originalHash, ev_receipt: receiptHash, ev_books: booksHash, ev_move: movementHash },
    eventStreams: [{ receiptId: "pack_receipt", events: registeredEvents }],
    originalSnapshots: [originalSnapshot],
    inventoryDispositions: [
      ...completeDispositions.filter((item) => item.itemId !== "gst_evidence"),
      {
        itemId: "gst_evidence",
        kind: "not_applicable",
        policyCode: "not_a_gst_reported_goods_purchase",
        reason: "GSTR import is not implemented",
      },
    ],
    evidenceLinks: { ev_invoice: packLink, ev_receipt: packLink, ev_books: packLink, ev_move: packLink },
    templateVersion: "1",
  });
  assert.equal(missingSourceAsNa.completeness, "incomplete");
  assert.ok(missingSourceAsNa.incompleteReasons.some((reason) => /missing source, not inapplicability/.test(reason)));
}

{
  const snapshotFacts = assembleManifest({
    exportId: "exp_snapshot_facts",
    ownerUid: "owner_1",
    ledgerId: "ledger_1",
    purchaseCaseId: "case_1",
    pinnedCuts: [pin],
    verifiedOriginals: [booksEvidence, gstEvidence, movementEvidence],
    artifactHashes: { ev_books: booksHash, ev_gst: gstHash, ev_move: movementHash },
    eventStreams: [{ receiptId: "pack_receipt", events: registeredEvents }],
    originalSnapshots: [originalSnapshot],
    inventoryDispositions: [
      {
        itemId: "supplier_identity",
        kind: "satisfied_from_snapshot",
        snapshotReceiptId: "pack_receipt",
        reason: "supplier identity is recorded on the anchored GRIN snapshot",
      },
      {
        itemId: "commercial_document",
        kind: "satisfied_from_snapshot",
        snapshotReceiptId: "pack_receipt",
        reason: "supplier invoice number is recorded on the anchored GRIN snapshot",
      },
      { itemId: "movement_evidence", kind: "satisfied", evidenceId: "ev_move" },
      {
        itemId: "receipt_evidence",
        kind: "satisfied_from_snapshot",
        snapshotReceiptId: "pack_receipt",
        reason: "issued receipt facts are recorded on the anchored GRIN snapshot",
      },
      { itemId: "accounting_payment_evidence", kind: "satisfied", evidenceId: "ev_books" },
      { itemId: "gst_evidence", kind: "satisfied", evidenceId: "ev_gst" },
    ],
    evidenceLinks: { ev_books: packLink, ev_gst: packLink, ev_move: packLink },
    templateVersion: "1",
  });
  assert.equal(snapshotFacts.completeness, "complete");
  assert.equal(snapshotFacts.itcDisposition, "not_determined");
  const receiptEval = snapshotFacts.inventoryEvaluation.find((item) => item.itemId === "receipt_evidence");
  assert.equal(receiptEval?.kind, "satisfied_from_snapshot");
  assert.ok(receiptEval?.supportingFields.includes("issuedNumber"));
  assert.ok(receiptEval?.supportingFields.includes("reportedArrivalAt"));
  assert.ok(receiptEval?.supportingFields.includes("warehouse"));
  assert.ok(receiptEval?.supportingFields.includes("lines.physicallyReceived"));
  const commercialEval = snapshotFacts.inventoryEvaluation.find((item) => item.itemId === "commercial_document");
  assert.ok(commercialEval?.supportingFields.includes("commercial.supplierInvoiceNumber"));
}

{
  const invoiceForIdentity = assembleManifest({
    exportId: "exp_invoice_identity_unlabelled",
    ownerUid: "owner_1",
    ledgerId: "ledger_1",
    purchaseCaseId: "case_1",
    pinnedCuts: [pin],
    verifiedOriginals: completeOriginals,
    artifactHashes: completeHashes,
    eventStreams: [{ receiptId: "pack_receipt", events: registeredEvents }],
    originalSnapshots: [originalSnapshot],
    inventoryDispositions: [
      { itemId: "supplier_identity", kind: "satisfied", evidenceId: "ev_invoice" },
      ...completeDispositions.filter((item) => item.itemId !== "supplier_identity"),
    ],
    evidenceLinks: completeLinks,
    templateVersion: "1",
  });
  assert.equal(invoiceForIdentity.completeness, "incomplete");
  assert.ok(invoiceForIdentity.incompleteReasons.some((reason) => /does not default-support supplier_identity/.test(reason)));
}

const replayRoundTrip = JSON.parse(JSON.stringify(completePack));
assert.equal(replayRoundTrip.supportPolicyVersion, EVIDENCE_SUPPORT_POLICY_VERSION);
assert.ok(Array.isArray(replayRoundTrip.inventoryEvaluation[0].supportingFields));
assert.deepEqual(replayRoundTrip.inventoryEvaluation, completePack.inventoryEvaluation);
const naRoundTrip = JSON.parse(JSON.stringify(serviceNa));
assert.equal(naRoundTrip.supportPolicyVersion, EVIDENCE_SUPPORT_POLICY_VERSION);
assert.equal(
  naRoundTrip.inventoryEvaluation.find((item: { itemId: string }) => item.itemId === "gst_evidence")?.policyCode,
  "not_a_gst_reported_goods_purchase"
);
assert.equal(
  naRoundTrip.inventoryEvaluation.find((item: { itemId: string }) => item.itemId === "gst_evidence")?.kind,
  "not_applicable"
);

console.log("goodsEvidence/evidence.pack.test.ts: ok");
