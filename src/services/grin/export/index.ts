export {
  assembleReceiptAuditExport,
  boundExportBytes,
  downloadGrinOriginal,
  MAX_GRIN_EXPORT_BYTES,
  MAX_GRIN_EXPORT_FILES,
  type GrinBytesSha256Hex,
  type GrinOriginalDownloadInput,
  type GrinOriginalDownloadOptions,
  type GrinOriginalDownloadResult,
  type GrinOriginalSha256Source,
  type GrinReceiptAuditExport,
  type GrinOptionalZipResult,
} from "./receiptAuditExport";
export {
  assertZipEntries,
  buildStoreZip,
  isSafeZipEntryName,
  zipEntryNameRejection,
  ZipEntryError,
  type ZipEntry,
  type ZipEntryNameRejection,
} from "./storeZip";

import {
  assembleReceiptAuditExport,
  boundExportBytes,
  downloadGrinOriginal,
  type GrinBytesSha256Hex,
  type GrinOriginalDownloadInput,
  type GrinOptionalZipResult,
  type GrinReceiptAuditExport,
} from "./receiptAuditExport";
import { assertZipEntries, buildStoreZip, ZipEntryError, type ZipEntry } from "./storeZip";

/** Archive entry name for one original. Validated by assertZipEntries before any bytes are laid out. */
export function zipEntryNameForOriginal(evidenceId: string): string {
  return `${evidenceId}.bin`;
}

export function assembleOptionalOriginalZip(input: {
  sessionLive: boolean;
  files: GrinOriginalDownloadInput[];
  nowMs?: number;
  /** Optional actual-byte hasher; see GrinOriginalDownloadOptions.sha256Hex. */
  sha256Hex?: GrinBytesSha256Hex;
}): GrinOptionalZipResult {
  if (!input.sessionLive) {
    return { ok: false, reason: "session_retired", missingOriginals: [], corruptOriginals: [] };
  }
  const downloads = input.files.map((file) =>
    downloadGrinOriginal(file, { sessionLive: true, sha256Hex: input.sha256Hex })
  );
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
  const entries: ZipEntry[] = okFiles.map((d) => ({
    name: zipEntryNameForOriginal(d.evidenceId),
    bytes: d.bytes!,
  }));
  try {
    assertZipEntries(entries);
  } catch (error) {
    if (error instanceof ZipEntryError) {
      const reason = error.code === "duplicate_entry_name" ? "duplicate_entry_name" : "unsafe_entry_name";
      return { ok: false, reason, missingOriginals, corruptOriginals };
    }
    throw error;
  }
  const zipBytes = buildStoreZip(entries, input.nowMs ?? 0);
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
  sha256Hex?: GrinBytesSha256Hex;
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
  const downloads = input.files.map((file) =>
    downloadGrinOriginal(file, { sessionLive: true, sha256Hex: input.sha256Hex })
  );
  return {
    audit: assembleReceiptAuditExport({
      receiptId: input.receiptId,
      ownerUid: input.ownerUid,
      ledgerId: input.ledgerId,
      confirmed: input.confirmed,
      downloads,
    }),
    zip: assembleOptionalOriginalZip({
      sessionLive: true,
      files: input.files,
      sha256Hex: input.sha256Hex,
    }),
  };
}
