export type EvidenceCategory =
  | "invoice"
  | "ewb"
  | "lr_bilty"
  | "weighment"
  | "vehicle"
  | "unloading"
  | "qc"
  | "acknowledgement"
  | "stock_accounting"
  | "payment"
  | "gst"
  | "return_document";

export type EvidenceVerification = "pending" | "failed" | "verified";

export type DerivativeKind = "thumbnail" | "ocr" | "crop" | "rotation" | "redacted";

export interface OriginalEvidence {
  evidenceId: string;
  category: EvidenceCategory;
  originalFileName: string;
  mime: string;
  byteSize: number;
  rawSha256: string;
  storageObjectGeneration: string | null;
  captureProvenance: string;
  osConversionOccurred: boolean;
  verification: EvidenceVerification;
  isDerivative: false;
}

export interface DerivativeEvidence {
  evidenceId: string;
  parentEvidenceId: string;
  kind: DerivativeKind;
  mime: string;
  byteSize: number;
  ownSha256: string;
  isDerivative: true;
}

/**
 * Injected hasher for domain tests. Production must stream native/file bytes
 * in a Storage worker; this type is not that worker.
 */
export type ByteHasher = (bytes: Uint8Array) => string;

export function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

export function verifyOriginalBytes(
  claimedSha256: string,
  bytes: Uint8Array,
  hash: ByteHasher
): { ok: true } | { ok: false; actual: string } {
  const actual = hash(bytes);
  if (actual !== claimedSha256.toLowerCase()) return { ok: false, actual };
  return { ok: true };
}

/** Completeness badge stays pending until the server hash matches. */
export function evidenceCompleteness(verification: EvidenceVerification): "complete" | "not_complete" {
  return verification === "verified" ? "complete" : "not_complete";
}

export function derivativesMustNotReplaceOriginal(
  original: OriginalEvidence,
  derivative: DerivativeEvidence
): boolean {
  return (
    derivative.parentEvidenceId === original.evidenceId &&
    derivative.ownSha256 !== original.rawSha256 &&
    original.verification !== "pending"
  );
}
