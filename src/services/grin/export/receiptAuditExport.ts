/**
 * Receipt/audit export and original download. Pack PDF remains a summary
 * (`originalsBundled=false`) and is not a complete archive.
 *
 * ZIP is optional. Missing/corrupt originals are reported, never invented.
 * Large exports fail closed at MAX_GRIN_EXPORT_BYTES.
 * Session retirement is the caller's `assertLive` / `isSessionCurrent`.
 */

export const MAX_GRIN_EXPORT_BYTES = 64 * 1024 * 1024;
export const MAX_GRIN_EXPORT_FILES = 48;

export type GrinExportSession = {
  ownerUid: string;
  dispatchGeneration: number;
};

export type GrinOriginalDownloadInput = {
  evidenceId: string;
  role: "original" | "thumbnail" | "metadata" | string;
  localPath?: string | null;
  bytes?: Uint8Array | null;
  claimedSha256?: string | null;
  actualSha256?: string | null;
  byteSize?: number | null;
  mime?: string | null;
  originalDurable?: boolean;
};

export type GrinOriginalDownloadResult = {
  evidenceId: string;
  kind: "original";
  ok: boolean;
  reason?:
    | "missing"
    | "corrupt"
    | "too_large"
    | "session_retired"
    | "derivative_not_original"
    | "bound_exceeded";
  bytes?: Uint8Array;
  byteSize?: number;
  mime?: string | null;
  sha256?: string | null;
};

export type GrinReceiptAuditExport = {
  kind: "receipt_audit_json";
  originalsBundled: false;
  packIsCompleteArchive: false;
  receiptId: string;
  ownerUid: string;
  ledgerId: string;
  confirmed: unknown | null;
  missingOriginals: string[];
  corruptOriginals: string[];
  originalCount: number;
  exportKind: "receipt_audit";
};

export type GrinOptionalZipResult =
  | {
      ok: true;
      zipBytes: Uint8Array;
      fileCount: number;
      totalBytes: number;
    }
  | {
      ok: false;
      reason: "no_bundleable_originals" | "too_large" | "session_retired" | "corrupt";
      missingOriginals: string[];
      corruptOriginals: string[];
    };

function isOriginalRole(role: string): boolean {
  return role === "original";
}

export function downloadGrinOriginal(
  input: GrinOriginalDownloadInput,
  options: { sessionLive: boolean; maxBytes?: number } = { sessionLive: true }
): GrinOriginalDownloadResult {
  if (!options.sessionLive) {
    return { evidenceId: input.evidenceId, kind: "original", ok: false, reason: "session_retired" };
  }
  if (!isOriginalRole(input.role)) {
    return {
      evidenceId: input.evidenceId,
      kind: "original",
      ok: false,
      reason: "derivative_not_original",
    };
  }
  const maxBytes = options.maxBytes ?? MAX_GRIN_EXPORT_BYTES;
  const bytes = input.bytes;
  if (bytes == null || bytes.byteLength < 1) {
    return { evidenceId: input.evidenceId, kind: "original", ok: false, reason: "missing" };
  }
  if (bytes.byteLength > maxBytes) {
    return { evidenceId: input.evidenceId, kind: "original", ok: false, reason: "too_large" };
  }
  if (typeof input.byteSize === "number" && input.byteSize !== bytes.byteLength) {
    return { evidenceId: input.evidenceId, kind: "original", ok: false, reason: "corrupt" };
  }
  const trusted = input.actualSha256 ?? input.claimedSha256 ?? null;
  return {
    evidenceId: input.evidenceId,
    kind: "original",
    ok: true,
    bytes,
    byteSize: bytes.byteLength,
    mime: input.mime ?? null,
    sha256: trusted,
  };
}

export function assembleReceiptAuditExport(input: {
  receiptId: string;
  ownerUid: string;
  ledgerId: string;
  confirmed: unknown | null;
  downloads: GrinOriginalDownloadResult[];
}): GrinReceiptAuditExport {
  const missingOriginals = input.downloads
    .filter((item) => !item.ok && item.reason === "missing")
    .map((item) => item.evidenceId);
  const corruptOriginals = input.downloads
    .filter((item) => !item.ok && (item.reason === "corrupt" || item.reason === "too_large"))
    .map((item) => item.evidenceId);
  return {
    kind: "receipt_audit_json",
    originalsBundled: false,
    packIsCompleteArchive: false,
    receiptId: input.receiptId,
    ownerUid: input.ownerUid,
    ledgerId: input.ledgerId,
    confirmed: input.confirmed,
    missingOriginals,
    corruptOriginals,
    originalCount: input.downloads.filter((item) => item.ok).length,
    exportKind: "receipt_audit",
  };
}

export function boundExportBytes(files: { bytes: Uint8Array }[]): "ok" | "too_large" {
  if (files.length > MAX_GRIN_EXPORT_FILES) return "too_large";
  let total = 0;
  for (const file of files) {
    total += file.bytes.byteLength;
    if (total > MAX_GRIN_EXPORT_BYTES) return "too_large";
  }
  return "ok";
}
