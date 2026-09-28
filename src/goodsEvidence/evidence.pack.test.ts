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
  ownerUid: "owner_1",
  ledgerId: "ledger_1",
  purchaseCaseId: "case_1",
  receiptId: "pack_receipt",
};
const na = (itemId: "supplier_identity" | "movement_evidence" | "accounting_payment_evidence" | "gst_evidence", reason: string) =>
  ({ itemId, kind: "not_applicable" as const, reason });
const completeDispositions = [
  na("supplier_identity", "supplier identity is on the labelled GRIN snapshot; no separate original in this fixture"),
  { itemId: "commercial_document" as const, kind: "satisfied" as const, evidenceId: "ev_invoice" },
  na("movement_evidence", "EWB kind none; no movement original in this labelled fixture"),
  { itemId: "receipt_evidence" as const, kind: "satisfied" as const, evidenceId: "ev_receipt" },
  na("accounting_payment_evidence", "books are not in this simulation fixture"),
  na("gst_evidence", "GSTR import is not in this simulation fixture"),
];
assert.equal(completeDispositions.length, REQUIRED_EVIDENCE_ITEMS.length);

const completePack = assembleManifest({
  exportId: "exp_complete",
  ownerUid: "owner_1",
  ledgerId: "ledger_1",
  purchaseCaseId: "case_1",
  pinnedCuts: [pin],
  verifiedOriginals: [invoiceEvidence, receiptEvidence],
  artifactHashes: { ev_invoice: originalHash, ev_receipt: receiptHash },
  eventStreams: [{ receiptId: "pack_receipt", events: registeredEvents }],
  originalSnapshots: [originalSnapshot],
  inventoryDispositions: completeDispositions,
  evidenceLinks: { ev_invoice: packLink, ev_receipt: packLink },
  templateVersion: "1",
});
assert.equal(completePack.completeness, "complete");
assert.equal(completePack.integrity, "verified");
assert.equal(completePack.coverage, "complete");
assert.equal(completePack.itcDisposition, "not_determined");
assert.equal(mayMarkComplete(completePack), true);

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
  verifiedOriginals: [invoiceEvidence, receiptEvidence],
  artifactHashes: { ev_invoice: originalHash, ev_receipt: receiptHash },
  eventStreams: [{ receiptId: "pack_receipt", events: laterEvents }],
  originalSnapshots: [originalSnapshot],
  inventoryDispositions: completeDispositions,
  evidenceLinks: { ev_invoice: packLink, ev_receipt: packLink },
  templateVersion: "1",
});
assert.equal(pinnedAfterLater.completeness, completePack.completeness);
assert.equal(pinnedAfterLater.pinnedCuts[0]?.headHash, completePack.pinnedCuts[0]?.headHash);

console.log("goodsEvidence/evidence.pack.test.ts: ok");
