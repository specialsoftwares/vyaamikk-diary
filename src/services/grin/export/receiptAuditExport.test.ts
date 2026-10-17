import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  assembleGrinExitExport,
  assembleOptionalOriginalZip,
  assembleReceiptAuditExport,
  boundExportBytes,
  buildStoreZip,
  downloadGrinOriginal,
  MAX_GRIN_EXPORT_BYTES,
  ZipEntryError,
  zipEntryNameRejection,
} from "./index";

assert.equal(
  downloadGrinOriginal(
    { evidenceId: "ev1", role: "original", bytes: null },
    { sessionLive: true }
  ).reason,
  "missing"
);
assert.equal(
  downloadGrinOriginal(
    { evidenceId: "ev2", role: "thumbnail", bytes: new Uint8Array([1]) },
    { sessionLive: true }
  ).reason,
  "derivative_not_original"
);
assert.equal(
  downloadGrinOriginal(
    { evidenceId: "ev3", role: "original", bytes: new Uint8Array([1, 2]), byteSize: 9 },
    { sessionLive: true }
  ).reason,
  "corrupt"
);
assert.equal(
  downloadGrinOriginal(
    { evidenceId: "ev4", role: "original", bytes: new Uint8Array([1]) },
    { sessionLive: false }
  ).reason,
  "session_retired"
);

const ok = downloadGrinOriginal(
  {
    evidenceId: "ev5",
    role: "original",
    bytes: Uint8Array.from([1, 2, 3, 4]),
    byteSize: 4,
    mime: "application/pdf",
    actualSha256: "ab".repeat(32),
  },
  { sessionLive: true }
);
assert.equal(ok.ok, true);

const audit = assembleReceiptAuditExport({
  receiptId: "r1",
  ownerUid: "u1",
  ledgerId: "led",
  confirmed: { receiptId: "r1" },
  downloads: [
    ok,
    downloadGrinOriginal({ evidenceId: "missing", role: "original" }, { sessionLive: true }),
  ],
});
assert.equal(audit.originalsBundled, false);
assert.equal(audit.packIsCompleteArchive, false);
assert.deepEqual(audit.missingOriginals, ["missing"]);
assert.equal(audit.originalCount, 1);

assert.equal(boundExportBytes([{ bytes: new Uint8Array(MAX_GRIN_EXPORT_BYTES + 1) }]), "too_large");

const zip = assembleOptionalOriginalZip({
  sessionLive: true,
  files: [
    {
      evidenceId: "ev5",
      role: "original",
      bytes: Uint8Array.from([1, 2, 3, 4]),
      byteSize: 4,
    },
  ],
});
assert.equal(zip.ok, true);
if (zip.ok) {
  assert.ok(zip.zipBytes.byteLength > 4);
  assert.equal(zip.zipBytes[0], 0x50);
  assert.equal(zip.zipBytes[1], 0x4b);
}

const retired = assembleGrinExitExport({
  receiptId: "r1",
  ownerUid: "u1",
  ledgerId: "led",
  confirmed: null,
  sessionLive: false,
  files: [],
});
assert.equal("ok" in retired.audit && retired.audit.ok === false, true);
if (retired.zip.ok) {
  throw new Error("retired session must not produce a ZIP");
}
assert.equal(retired.zip.reason, "session_retired");

// ---- Archive entry-name safety (G07): traversal / absolute / duplicate names never reach the ZIP ----
const bytes4 = Uint8Array.from([1, 2, 3, 4]);
for (const bad of ["../escape", "/abs", "a\\b", "a//b", "./x", "C:evil", "nul\u0000", ""]) {
  assert.notEqual(zipEntryNameRejection(bad), null, `unsafe name rejected: ${JSON.stringify(bad)}`);
  assert.throws(
    () => buildStoreZip([{ name: bad, bytes: bytes4 }]),
    (e: unknown) => e instanceof ZipEntryError && e.code === "unsafe_entry_name",
    `buildStoreZip rejects ${JSON.stringify(bad)}`
  );
}
assert.equal(zipEntryNameRejection("gev_abc.bin"), null);
assert.equal(zipEntryNameRejection("sub/dir/file.pdf"), null);
assert.throws(
  () =>
    buildStoreZip([
      { name: "Same.bin", bytes: bytes4 },
      { name: "same.bin", bytes: bytes4 },
    ]),
  (e: unknown) => e instanceof ZipEntryError && e.code === "duplicate_entry_name"
);

const traversalZip = assembleOptionalOriginalZip({
  sessionLive: true,
  files: [{ evidenceId: "../../etc/passwd", role: "original", bytes: bytes4, byteSize: 4 }],
});
assert.equal(traversalZip.ok, false);
if (!traversalZip.ok) assert.equal(traversalZip.reason, "unsafe_entry_name");

const duplicateZip = assembleOptionalOriginalZip({
  sessionLive: true,
  files: [
    { evidenceId: "gev_dup", role: "original", bytes: bytes4, byteSize: 4 },
    { evidenceId: "gev_dup", role: "original", bytes: Uint8Array.from([9, 9]), byteSize: 2 },
  ],
});
assert.equal(duplicateZip.ok, false);
if (!duplicateZip.ok) assert.equal(duplicateZip.reason, "duplicate_entry_name");

// ---- Actual-byte hashing vs supplied hash fields (G07) ----
const sha256Hex = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const realHash = sha256Hex(bytes4);

const unverified = downloadGrinOriginal(
  { evidenceId: "ev6", role: "original", bytes: bytes4, byteSize: 4, actualSha256: realHash },
  { sessionLive: true }
);
assert.equal(unverified.ok, true);
assert.equal(unverified.sha256Source, "server_actual", "without a hasher the hash is passthrough, not verified");

const claimedOnly = downloadGrinOriginal(
  { evidenceId: "ev6c", role: "original", bytes: bytes4, byteSize: 4, claimedSha256: realHash },
  { sessionLive: true }
);
assert.equal(claimedOnly.sha256Source, "claimed_unverified");

const verified = downloadGrinOriginal(
  { evidenceId: "ev7", role: "original", bytes: bytes4, byteSize: 4, actualSha256: realHash.toUpperCase() },
  { sessionLive: true, sha256Hex }
);
assert.equal(verified.ok, true);
assert.equal(verified.sha256, realHash);
assert.equal(verified.sha256Source, "verified_bytes");

const forged = downloadGrinOriginal(
  { evidenceId: "ev8", role: "original", bytes: bytes4, byteSize: 4, actualSha256: "ab".repeat(32) },
  { sessionLive: true, sha256Hex }
);
assert.equal(forged.ok, false);
assert.equal(forged.reason, "corrupt", "bytes that do not hash to the trusted descriptor are corrupt, not bundled");

const forgedClaimed = downloadGrinOriginal(
  { evidenceId: "ev8c", role: "original", bytes: bytes4, byteSize: 4, claimedSha256: "cd".repeat(32) },
  { sessionLive: true, sha256Hex }
);
assert.equal(forgedClaimed.reason, "corrupt");

const forgedZip = assembleOptionalOriginalZip({
  sessionLive: true,
  sha256Hex,
  files: [
    { evidenceId: "gev_ok", role: "original", bytes: bytes4, byteSize: 4, actualSha256: realHash },
    { evidenceId: "gev_bad", role: "original", bytes: bytes4, byteSize: 4, actualSha256: "ab".repeat(32) },
  ],
});
assert.equal(forgedZip.ok, false);
if (!forgedZip.ok) {
  assert.equal(forgedZip.reason, "corrupt");
  assert.deepEqual(forgedZip.corruptOriginals, ["gev_bad"]);
}

const exitWithHasher = assembleGrinExitExport({
  receiptId: "r2",
  ownerUid: "u1",
  ledgerId: "led",
  confirmed: null,
  sessionLive: true,
  sha256Hex,
  files: [
    { evidenceId: "gev_ok", role: "original", bytes: bytes4, byteSize: 4, actualSha256: realHash },
    { evidenceId: "gev_missing", role: "original", bytes: null, actualSha256: realHash },
  ],
});
assert.ok(!("ok" in exitWithHasher.audit));
if (!("ok" in exitWithHasher.audit)) {
  assert.deepEqual(exitWithHasher.audit.missingOriginals, ["gev_missing"], "missing originals stay missing");
  assert.equal(exitWithHasher.audit.originalCount, 1);
}
assert.equal(exitWithHasher.zip.ok, true);

console.log("receiptAuditExport.test.ts: ok (INJECTED)");
