/** Event, projection and command schema for this slice. Old events stay readable. */
export const GOODS_EVIDENCE_SCHEMA_VERSION = 1 as const;

/** Canonical JSON / hash-chain format. Bump only with a dual-read reducer. */
export const CANONICAL_JSON_VERSION = "1" as const;

/**
 * Printed on every GRIN. This module records what the business reported;
 * it does not issue a GST document or decide ITC.
 */
export const GRIN_DOCUMENT_FOOTER =
  "Internal goods receipt evidence — not a GST Receipt Voucher, tax invoice, or determination of ITC eligibility.";

export const OFFLINE_PENDING_BANNER = "Captured offline — server registration pending";

export const DEFAULT_GRIN_SERIES = "MAIN";

export const GOODS_EVIDENCE_TIME_ZONE = "Asia/Kolkata";

/** India Standard Time offset used for FY issuance (no DST). */
export const IST_UTC_OFFSET_MS = 19_800_000;

export const GRIN_SERIAL_PAD = 6;

export const MAX_DECIMAL_INTEGER_DIGITS = 18;
export const MAX_DECIMAL_FRACTION_DIGITS = 6;

/**
 * Review label for this slice. InMemoryGoodsLedger, injected byte hashers and
 * createOfflineCapture are domain fixtures. They are not a deployed command
 * API, Storage original pipeline, or SQLite outbox.
 */
export const GOODS_EVIDENCE_SIMULATION_NOTICE =
  "SIMULATED: in-memory domain fixture. Not distributed sequencing, not durable offline storage, not protected Storage originals.";
