export {
  assembleReceiptAuditExport,
  boundExportBytes,
  downloadGrinOriginal,
  MAX_GRIN_EXPORT_BYTES,
  MAX_GRIN_EXPORT_FILES,
  type GrinOriginalDownloadInput,
  type GrinOriginalDownloadResult,
  type GrinReceiptAuditExport,
  type GrinOptionalZipResult,
} from "./receiptAuditExport";
export { buildStoreZip, type ZipEntry } from "./storeZip";

import {
  assembleReceiptAuditExport,
  boundExportBytes,
  downloadGrinOriginal,
  type GrinOriginalDownloadInput,
  type GrinOptionalZipResult,
  type GrinReceiptAuditExport,
} from "./receiptAuditExport";
import { buildStoreZip } from "./storeZip";

export function assembleOptionalOriginalZip(input: {
  sessionLive: boolean;
  files: GrinOriginalDownloadInput[];
  nowMs?: number;
}): GrinOptionalZipResult {
  if (!input.sessionLive) {
    return { ok: false, reason: "session_retired", missingOriginals: [], corruptOriginals: [] };
  }
  const downloads = input.files.map((file) => downloadGrinOriginal(file, { sessionLive: true }));
  const missingOriginals = downloads.filter((d) => d.reason === "missing").map((d) => d.evidenceId);
  const corruptOriginals = downloads
    .filter((d) => d.reason === "corrupt" || d.reason === "too_large")
    .map((d) => d.evidenceId);
  const okFiles = downloads.filter((d) => d.ok && d.bytes);
  if (okFiles.length === 0) {
    return { ok: false, reason: "no_bundleable_originals", missingOriginals, corruptOriginals };
  }
  if (corruptOriginals.length > 0) {
    return { ok: false, reason: "corrupt", missingOriginals, corruptOriginals };
  }
  const bound = boundExportBytes(okFiles.map((d) => ({ bytes: d.bytes! })));
  if (bound === "too_large") {
    return { ok: false, reason: "too_large", missingOriginals, corruptOriginals };
  }
  const zipBytes = buildStoreZip(
    okFiles.map((d) => ({ name: `${d.evidenceId}.bin`, bytes: d.bytes! })),
    input.nowMs ?? 0
  );
  let totalBytes = 0;
  for (const d of okFiles) totalBytes += d.bytes!.byteLength;
  return { ok: true, zipBytes, fileCount: okFiles.length, totalBytes };
}

export function assembleGrinExitExport(input: {
  receiptId: string;
  ownerUid: string;
  ledgerId: string;
  confirmed: unknown | null;
  sessionLive: boolean;
  files: GrinOriginalDownloadInput[];
}): {
  audit: GrinReceiptAuditExport | { ok: false; reason: "session_retired" };
  zip: GrinOptionalZipResult;
} {
  if (!input.sessionLive) {
    return {
      audit: { ok: false, reason: "session_retired" },
      zip: { ok: false, reason: "session_retired", missingOriginals: [], corruptOriginals: [] },
    };
  }
  const downloads = input.files.map((file) => downloadGrinOriginal(file, { sessionLive: true }));
  return {
    audit: assembleReceiptAuditExport({
      receiptId: input.receiptId,
      ownerUid: input.ownerUid,
      ledgerId: input.ledgerId,
      confirmed: input.confirmed,
      downloads,
    }),
    zip: assembleOptionalOriginalZip({ sessionLive: true, files: input.files }),
  };
}
