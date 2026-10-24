"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GOODS_EVIDENCE_SIMULATION_NOTICE = exports.MAX_DECIMAL_FRACTION_DIGITS = exports.MAX_DECIMAL_INTEGER_DIGITS = exports.GRIN_SERIAL_PAD = exports.IST_UTC_OFFSET_MS = exports.GOODS_EVIDENCE_TIME_ZONE = exports.DEFAULT_GRIN_SERIES = exports.OFFLINE_PENDING_BANNER = exports.GRIN_DOCUMENT_FOOTER = exports.CANONICAL_JSON_VERSION = exports.GOODS_EVIDENCE_SCHEMA_VERSION = void 0;
/** Event, projection and command schema for this slice. Old events stay readable. */
exports.GOODS_EVIDENCE_SCHEMA_VERSION = 1;
/** Canonical JSON / hash-chain format. Bump only with a dual-read reducer. */
exports.CANONICAL_JSON_VERSION = "1";
/**
 * Printed on every GRIN. This module records what the business reported;
 * it does not issue a GST document or decide ITC.
 */
exports.GRIN_DOCUMENT_FOOTER = "Internal goods receipt evidence — not a GST Receipt Voucher, tax invoice, or determination of ITC eligibility.";
exports.OFFLINE_PENDING_BANNER = "Captured offline — server registration pending";
exports.DEFAULT_GRIN_SERIES = "MAIN";
exports.GOODS_EVIDENCE_TIME_ZONE = "Asia/Kolkata";
/** India Standard Time offset used for FY issuance (no DST). */
exports.IST_UTC_OFFSET_MS = 19_800_000;
exports.GRIN_SERIAL_PAD = 6;
exports.MAX_DECIMAL_INTEGER_DIGITS = 18;
exports.MAX_DECIMAL_FRACTION_DIGITS = 6;
/**
 * Review label for this slice. InMemoryGoodsLedger, injected byte hashers and
 * createOfflineCapture are domain fixtures. They are not a deployed command
 * API, Storage original pipeline, or SQLite outbox.
 */
exports.GOODS_EVIDENCE_SIMULATION_NOTICE = "SIMULATED: in-memory domain fixture. Not distributed sequencing, not durable offline storage, not protected Storage originals.";
//# sourceMappingURL=constants.js.map