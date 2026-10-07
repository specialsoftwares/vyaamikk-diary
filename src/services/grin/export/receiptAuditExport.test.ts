import assert from "node:assert/strict";

import {
  assembleGrinExitExport,
  assembleOptionalOriginalZip,
  assembleReceiptAuditExport,
  boundExportBytes,
  downloadGrinOriginal,
  MAX_GRIN_EXPORT_BYTES,
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

console.log("receiptAuditExport.test.ts: ok (INJECTED)");
