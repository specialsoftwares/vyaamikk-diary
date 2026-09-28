import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { GOODS_EVIDENCE_SIMULATION_NOTICE } from "./constants";
import { derivativesMustNotReplaceOriginal, evidenceCompleteness, verifyOriginalBytes } from "./evidence";
import {
  assembleManifest,
  cutMatchesHead,
  EVIDENCE_PACK_SECTIONS,
  mayMarkComplete,
} from "./evidencePack";
import { hashEventEnvelope } from "./hashChain";
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

const complete = assembleManifest({
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
assert.equal(mayMarkComplete(complete), true);

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

console.log("goodsEvidence/evidence.pack.test.ts: ok");
