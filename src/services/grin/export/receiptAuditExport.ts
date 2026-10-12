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

/**
 * Where `sha256` came from. Only `verified_bytes` means the supplied bytes were
 * hashed here and matched the trusted descriptor; the other two are passthrough.
 */
export type GrinOriginalSha256Source =
  | "verified_bytes"
  | "server_actual"
  | "claimed_unverified"
  | "computed_unbound";

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
  sha256Source?: GrinOriginalSha256Source | null;
};

/** Synchronous SHA-256 hex over supplied bytes (injected; no node:crypto import here). */
export type GrinBytesSha256Hex = (bytes: Uint8Array) => string;

export type GrinOriginalDownloadOptions = {
  sessionLive: boolean;
  maxBytes?: number;
  /**
   * When provided, supplied bytes are hashed and compared with the trusted
   * descriptor (`actualSha256`, else `claimedSha256`). A mismatch is `corrupt`.
   * Without it, no hash is verified and `sha256Source` says so.
   */
  sha256Hex?: GrinBytesSha256Hex;
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
      reason:
        | "no_bundleable_originals"
        | "too_large"
        | "session_retired"
        | "corrupt"
        | "unsafe_entry_name"
        | "duplicate_entry_name";
      missingOriginals: string[];
      corruptOriginals: string[];
    };

function isOriginalRole(role: string): boolean {
  return role === "original";
}

function isSha256HexLike(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

export function downloadGrinOriginal(
  input: GrinOriginalDownloadInput,
  options: GrinOriginalDownloadOptions = { sessionLive: true }
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
  const serverActual = isSha256HexLike(input.actualSha256) ? input.actualSha256.toLowerCase() : null;
  const claimed = isSha256HexLike(input.claimedSha256) ? input.claimedSha256.toLowerCase() : null;
  const expected = serverActual ?? claimed;
  let sha256: string | null = expected;
  let sha256Source: GrinOriginalSha256Source | null = serverActual
    ? "server_actual"
    : claimed
      ? "claimed_unverified"
      : null;
  if (options.sha256Hex) {
    const computed = options.sha256Hex(bytes).toLowerCase();
    if (expected != null && computed !== expected) {
      // Supplied bytes do not match the descriptor they claim to be — never bundle them.
      return { evidenceId: input.evidenceId, kind: "original", ok: false, reason: "corrupt" };
    }
    sha256 = computed;
    sha256Source = expected != null ? "verified_bytes" : "computed_unbound";
  }
  return {
    evidenceId: input.evidenceId,
    kind: "original",
    ok: true,
    bytes,
    byteSize: bytes.byteLength,
    mime: input.mime ?? null,
    sha256,
    sha256Source,
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
