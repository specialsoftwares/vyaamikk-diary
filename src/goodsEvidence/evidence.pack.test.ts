import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { GOODS_EVIDENCE_SIMULATION_NOTICE } from "./constants";
import { derivativesMustNotReplaceOriginal, evidenceCompleteness, verifyOriginalBytes } from "./evidence";
import { assembleManifest, cutMatchesHead, EVIDENCE_PACK_SECTIONS, mayMarkComplete, pinEventCut } from "./evidencePack";

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

const cut = pinEventCut({
  receiptId: "r1",
  eventVersion: 2,
  headHash: "abc",
});
assert.equal(cutMatchesHead(cut, { eventVersion: 3, headHash: "abc" }), false);
assert.equal(cutMatchesHead(cut, { eventVersion: 2, headHash: "abc" }), true);

const incomplete = assembleManifest({
  exportId: "exp_1",
  ownerUid: "owner_1",
  ledgerId: "ledger_1",
  purchaseCaseId: "case_1",
  pinnedCuts: [cut],
  artifactHashes: { "invoice.pdf": originalHash },
  missingOrUnverifiable: ["ewb.pdf missing"],
  templateVersion: "1",
});
assert.equal(incomplete.completeness, "incomplete");
assert.equal(mayMarkComplete(incomplete), false);

const complete = assembleManifest({
  exportId: "exp_2",
  ownerUid: "owner_1",
  ledgerId: "ledger_1",
  purchaseCaseId: "case_1",
  pinnedCuts: [cut],
  artifactHashes: { "invoice.pdf": originalHash },
  missingOrUnverifiable: [],
  templateVersion: "1",
});
assert.equal(mayMarkComplete(complete), true);

console.log("goodsEvidence/evidence.pack.test.ts: ok");
