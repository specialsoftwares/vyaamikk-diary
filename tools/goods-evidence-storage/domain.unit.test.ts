/**
 * PURE_DOMAIN G2 Wave 1 tests. No Storage/Firestore emulators.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALLOWED_ORIGINAL_MIME,
  HASH_CHUNK_BYTES,
  MAX_CONCURRENT_UPLOADS_PER_OWNER,
  MAX_IMAGE_ORIGINAL_BYTES,
  MAX_ORIGINALS_PER_RECEIPT,
  MAX_PDF_ORIGINAL_BYTES,
  ORIGINAL_CAPTURE_PROVENANCES,
  UPLOAD_ORIGINAL_CATEGORIES,
  WAVE1_ORIGINAL_CATEGORIES,
  buildOriginalStoragePath,
  buildVerifiedEvidenceResult,
  concurrentUploadError,
  durableUploadIdentityError,
  evidenceReplayIdentityError,
  evidenceTransitionError,
  hashBoundedChunks,
  isEvidenceCategory,
  isOriginalCaptureProvenance,
  isPermittedEvidenceTransition,
  isUploadOriginalCategory,
  isWave1OriginalCategory,
  originalRetentionError,
  originalSizeError,
  originalEvidenceFromVerifiedResult,
  replacementMustUseNewObjectId,
  reservationIdentityError,
  splitIntoHashChunks,
  storagePathShapeError,
  verifiedEvidenceResultError,
  verifyOriginalBytes,
  wave1CategoryError,
  isRetainedOriginalState,
  type ChunkHasher,
} from "../../src/goodsEvidence/evidence";
import { EVIDENCE_STATE_TRANSITIONS, type EvidenceObjectState } from "../../src/goodsEvidence/ports";
import { evidenceLabel } from "./testSupport";

function nodeHasher(): ChunkHasher {
  const hash = createHash("sha256");
  return {
    update(chunk) {
      hash.update(chunk);
    },
    digestHex() {
      return hash.digest("hex");
    },
  };
}

async function main(): Promise<void> {
  evidenceLabel("PURE_DOMAIN", "state machine transitions and retries");
  const retryStates = Object.keys(EVIDENCE_STATE_TRANSITIONS) as EvidenceObjectState[];
  for (const state of retryStates) {
    assert.equal(isPermittedEvidenceTransition(state, state), true, `retry stays in ${state}`);
  }
  assert.equal(isPermittedEvidenceTransition("reserved", "uploading"), true);
  assert.equal(isPermittedEvidenceTransition("reserved", "rejected"), true);
  assert.equal(isPermittedEvidenceTransition("uploading", "uploaded_unverified"), true);
  assert.equal(isPermittedEvidenceTransition("uploading", "reserved"), true);
  assert.equal(isPermittedEvidenceTransition("uploading", "rejected"), true);
  assert.equal(isPermittedEvidenceTransition("uploaded_unverified", "verified"), true);
  assert.equal(isPermittedEvidenceTransition("uploaded_unverified", "rejected"), true);
  assert.equal(isPermittedEvidenceTransition("uploaded_unverified", "orphan_pending_review"), true);
  assert.equal(isPermittedEvidenceTransition("verified", "linked"), true);
  assert.equal(isPermittedEvidenceTransition("verified", "rejected"), true);
  assert.equal(isPermittedEvidenceTransition("orphan_pending_review", "verified"), true);
  assert.equal(isPermittedEvidenceTransition("orphan_pending_review", "rejected"), true);
  assert.equal(isPermittedEvidenceTransition("orphan_pending_review", "linked"), true);
  assert.ok(evidenceTransitionError("linked", "verified"));
  assert.ok(evidenceTransitionError("rejected", "reserved"));
  assert.ok(evidenceTransitionError("reserved", "verified"));
  assert.ok(evidenceTransitionError("uploading", "orphan_pending_review"));

  evidenceLabel("PURE_DOMAIN", "upload original categories include stock payment gst return_document");
  assert.deepEqual([...UPLOAD_ORIGINAL_CATEGORIES], [...WAVE1_ORIGINAL_CATEGORIES]);
  assert.deepEqual([...WAVE1_ORIGINAL_CATEGORIES], [
    "invoice",
    "ewb",
    "lr_bilty",
    "weighment",
    "vehicle",
    "unloading",
    "qc",
    "acknowledgement",
    "stock_accounting",
    "payment",
    "gst",
    "return_document",
  ]);
  for (const category of WAVE1_ORIGINAL_CATEGORIES) {
    assert.equal(isWave1OriginalCategory(category), true);
    assert.equal(isUploadOriginalCategory(category), true);
    assert.equal(isEvidenceCategory(category), true);
    assert.equal(wave1CategoryError(category), null);
  }
  assert.ok(wave1CategoryError(undefined));
  assert.ok(wave1CategoryError(null));
  assert.ok(wave1CategoryError(""));
  assert.ok(wave1CategoryError("Invoice"));
  assert.ok(wave1CategoryError("challan"));
  assert.ok(!isEvidenceCategory("invoice_reference"));
  assert.deepEqual([...ALLOWED_ORIGINAL_MIME], [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);
  assert.equal(originalSizeError("application/pdf", MAX_PDF_ORIGINAL_BYTES), null);
  assert.ok(originalSizeError("application/pdf", MAX_PDF_ORIGINAL_BYTES + 1));
  assert.ok(originalSizeError("image/jpeg", MAX_IMAGE_ORIGINAL_BYTES + 1));
  assert.ok(concurrentUploadError(MAX_CONCURRENT_UPLOADS_PER_OWNER));
  assert.equal(concurrentUploadError(MAX_CONCURRENT_UPLOADS_PER_OWNER - 1), null);
  assert.equal(MAX_ORIGINALS_PER_RECEIPT, 24);
  assert.equal(HASH_CHUNK_BYTES, 64 * 1024);

  evidenceLabel("PURE_DOMAIN", "object paths omit business details");
  const path = buildOriginalStoragePath("owner1", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(storagePathShapeError(path), null);
  assert.doesNotMatch(path, /invoice|ewb|receipt|GSTIN|INV-|bilty|weighment/i);
  assert.ok(storagePathShapeError("users/owner1/grinEvidence/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/invoice.pdf"));
  assert.ok(storagePathShapeError("users/owner1/attachments/receipt_1/photo.jpg"));
  assert.ok(storagePathShapeError("users/owner1/grinEvidence/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/original/INV-1"));

  evidenceLabel("PURE_DOMAIN", "bounded-memory hashing; no full-file base64");
  const payload = new Uint8Array(HASH_CHUNK_BYTES + 17);
  payload.fill(3);
  payload[0] = 9;
  const expected = createHash("sha256").update(payload).digest("hex");
  const chunks = splitIntoHashChunks(payload);
  assert.equal(chunks.length, 2);
  const hashed = await hashBoundedChunks(chunks, nodeHasher());
  assert.equal(hashed.sha256, expected);
  assert.equal(hashed.byteSize, payload.byteLength);
  assert.deepEqual(verifyOriginalBytes(expected, payload, (bytes) => createHash("sha256").update(bytes).digest("hex")), {
    ok: true,
  });
  const evidenceSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../src/goodsEvidence/evidence.ts"), "utf8");
  assert.doesNotMatch(evidenceSrc, /toString\(\s*["']base64["']\s*\)/);
  assert.doesNotMatch(evidenceSrc, /btoa\(/);
  assert.match(evidenceSrc, /HASH_CHUNK_BYTES = 64 \* 1024/);
  assert.match(evidenceSrc, /export async function hashBoundedChunks/);

  evidenceLabel("PURE_DOMAIN", "E4 original capture provenance is documented and distinct from receipt capture");
  assert.deepEqual([...ORIGINAL_CAPTURE_PROVENANCES], [
    "camera_capture",
    "imported_original",
    "os_conversion",
    "derivative",
  ]);
  assert.equal(isOriginalCaptureProvenance("camera_capture"), true);
  assert.equal(isOriginalCaptureProvenance("offline"), false);
  assert.equal(isOriginalCaptureProvenance("online"), false);

  evidenceLabel("PURE_DOMAIN", "VerifiedEvidenceResult shape matches ports.ts");
  const trusted = {
    kind: "trusted_storage" as const,
    sha256: expected,
    byteSize: payload.byteLength,
    generation: "1",
  };
  const verified = buildVerifiedEvidenceResult({
    evidenceId: "ev_ports_1",
    ownerUid: "owner1",
    ledgerId: "ledger1",
    receiptId: "receipt1",
    category: "invoice",
    mime: "application/pdf",
    trusted,
    storagePath: path,
    verifiedAtUtc: "2026-10-01T12:00:00.000Z",
  });
  assert.equal("ok" in verified, false);
  if ("ok" in verified) throw new Error("expected result");
  assert.deepEqual(Object.keys(verified).sort(), [
    "byteSize",
    "category",
    "evidenceId",
    "generation",
    "ledgerId",
    "mime",
    "ownerUid",
    "rawSha256",
    "receiptId",
    "storagePath",
    "verifiedAtUtc",
  ]);
  assert.equal(verifiedEvidenceResultError(verified), null);
  assert.equal(verified.rawSha256, expected);
  assert.equal(verified.generation, "1");

  evidenceLabel("PURE_DOMAIN", "retained original states and verified-to-original mapping");
  assert.equal(isRetainedOriginalState("uploaded_unverified"), true);
  assert.equal(isRetainedOriginalState("verified"), true);
  assert.equal(isRetainedOriginalState("linked"), true);
  assert.equal(isRetainedOriginalState("reserved"), false);
  assert.equal(isRetainedOriginalState("uploading"), false);
  assert.equal(isRetainedOriginalState("rejected"), false);
  assert.equal(isRetainedOriginalState("orphan_pending_review"), false);
  const mapped = originalEvidenceFromVerifiedResult(verified, { originalFileName: "invoice.pdf" });
  assert.equal(mapped.isDerivative, false);
  assert.equal(mapped.verification, "verified");
  assert.equal(mapped.rawSha256, expected);
  assert.equal(mapped.storageObjectGeneration, "1");
  assert.equal(mapped.originalFileName, "invoice.pdf");

  evidenceLabel("PURE_DOMAIN", "replay identity must match owner ledger receipt id category hash size");
  const identity = {
    ownerUid: "owner1",
    ledgerId: "ledger1",
    receiptId: "receipt1",
    evidenceId: "ev1",
    category: "invoice" as const,
    claimedSha256: expected,
    claimedByteSize: payload.byteLength,
  };
  assert.equal(evidenceReplayIdentityError(identity, identity), null);
  assert.ok(evidenceReplayIdentityError(identity, { ...identity, receiptId: "receipt2" }));
  assert.ok(evidenceReplayIdentityError(identity, { ...identity, claimedSha256: "b".repeat(64) }));
  assert.ok(evidenceReplayIdentityError(identity, { ...identity, category: "weighment" }));
  assert.ok(reservationIdentityError(null, "objectkeyobjectkey"));
  assert.equal(reservationIdentityError("aaaaaaaaaaaaaaaa", "aaaaaaaaaaaaaaaa"), null);

  evidenceLabel("PURE_DOMAIN", "replacement requires a new object id; derivatives cannot assert missing originals");
  assert.equal(replacementMustUseNewObjectId("aaa", "aaa"), false);
  assert.equal(replacementMustUseNewObjectId("aaa", "bbb"), true);
  assert.ok(originalRetentionError(false, false));
  assert.ok(originalRetentionError(true, false));
  assert.equal(originalRetentionError(true, true), null);

  evidenceLabel("PURE_DOMAIN", "E2 actualSha256 cannot be an echoed claim or missing hash");
  const expectedIdentity = {
    ownerUid: "owner1",
    ledgerId: "ledger1",
    receiptId: "receipt1",
    evidenceId: "ev_ports_1",
    category: "invoice" as const,
    mime: "application/pdf" as const,
    sizeBytes: payload.byteLength,
    storagePath: path,
    generation: "1",
    retainedSha256: expected,
  };
  const matchingUpload = {
    ok: true,
    originalDurable: true,
    ownerUid: "owner1",
    ledgerId: "ledger1",
    receiptId: "receipt1",
    evidenceId: "ev_ports_1",
    category: "invoice",
    mime: "application/pdf",
    sizeBytes: payload.byteLength,
    storagePath: path,
    generation: "1",
    claimedSha256: expected,
    actualSha256: expected,
    reservationId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
  assert.equal(durableUploadIdentityError(expectedIdentity, matchingUpload), null);
  const otherHash = "b".repeat(64);
  assert.ok(
    durableUploadIdentityError(expectedIdentity, {
      ...matchingUpload,
      claimedSha256: expected,
      actualSha256: otherHash,
    })
  );
  assert.ok(
    durableUploadIdentityError(expectedIdentity, {
      ...matchingUpload,
      claimedSha256: expected,
      actualSha256: null,
    })
  );
  assert.ok(
    durableUploadIdentityError(expectedIdentity, {
      ...matchingUpload,
      ownerUid: "other-owner",
    })
  );
  assert.ok(
    durableUploadIdentityError(expectedIdentity, {
      ...matchingUpload,
      receiptId: "receipt-other",
    })
  );
  assert.ok(
    durableUploadIdentityError(expectedIdentity, {
      ...matchingUpload,
      generation: "verified",
    })
  );

  evidenceLabel("PURE_DOMAIN", "policy v2 file not weakened");
  const support = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../src/goodsEvidence/evidenceSupport.ts"),
    "utf8"
  );
  assert.match(support, /EVIDENCE_SUPPORT_POLICY_VERSION = 2/);
  assert.match(support, /commercial_document cannot be satisfied from a GRIN snapshot/);
  assert.match(support, /CHALLAN_ORIGINAL_SUPPORT = "deferred"/);

  console.log("tools/goods-evidence-storage/domain.unit.test.ts: ok");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
