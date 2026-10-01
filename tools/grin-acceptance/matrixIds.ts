/**
 * Canonical matrix ID catalogue for Wave 1 scaffolding.
 * Human source of truth: docs/release/GRIN_ACCEPTANCE_MATRIX.md
 * This module must stay in lockstep with table IDs in that file.
 *
 * Combined workflows are not executed here. Stubs only prove IDs exist.
 */

export const EVIDENCE_LABELS = [
  "PURE_DOMAIN",
  "INJECTED_PORT",
  "SQLITE_HOST",
  "FIRESTORE_EMULATOR",
  "STORAGE_EMULATOR",
  "MOUNTED_REACT_INERT_NATIVE",
  "NATIVE_DEVICE",
  "PLAY_INSTALLED",
] as const;

export type EvidenceLabel = (typeof EVIDENCE_LABELS)[number];

export const MATRIX_STATUSES = [
  "tbd",
  "path_present_unapproved",
  "wave1_scaffold",
  "device_pending",
  "play_pending",
  "unresolved_policy",
] as const;

export type MatrixStatus = (typeof MATRIX_STATUSES)[number];

function seq(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(2, "0")}`);
}

/** Counts must match the Wave 1 matrix tables. */
export const MATRIX_ID_COUNTS = {
  "G1-R": 36,
  "G2-R": 16,
  "G3-R": 13,
  "G4-R": 21,
  "G5-R": 11,
  "G6-R": 8,
  "CS-": 11,
  "SEC-": 8,
  "REG-": 5,
  "DEV-": 6,
  "PLAY-": 2,
} as const;

export const MATRIX_IDS: readonly string[] = [
  ...seq("G1-R", MATRIX_ID_COUNTS["G1-R"]),
  ...seq("G2-R", MATRIX_ID_COUNTS["G2-R"]),
  ...seq("G3-R", MATRIX_ID_COUNTS["G3-R"]),
  ...seq("G4-R", MATRIX_ID_COUNTS["G4-R"]),
  ...seq("G5-R", MATRIX_ID_COUNTS["G5-R"]),
  ...seq("G6-R", MATRIX_ID_COUNTS["G6-R"]),
  ...seq("CS-", MATRIX_ID_COUNTS["CS-"]),
  ...seq("SEC-", MATRIX_ID_COUNTS["SEC-"]),
  ...seq("REG-", MATRIX_ID_COUNTS["REG-"]),
  ...seq("DEV-", MATRIX_ID_COUNTS["DEV-"]),
  ...seq("PLAY-", MATRIX_ID_COUNTS["PLAY-"]),
];

export const COMBINED_SCENARIO_IDS = seq("CS-", MATRIX_ID_COUNTS["CS-"]);
export const SECURITY_IDS = seq("SEC-", MATRIX_ID_COUNTS["SEC-"]);
export const DEVICE_PENDING_IDS = seq("DEV-", MATRIX_ID_COUNTS["DEV-"]);
export const PLAY_PENDING_IDS = seq("PLAY-", MATRIX_ID_COUNTS["PLAY-"]);

export const ID_LINE =
  /^\| (G[1-6]-R\d{2}|CS-\d{2}|SEC-\d{2}|REG-\d{2}|DEV-\d{2}|PLAY-\d{2}) \|/;

export function isMatrixId(value: string): boolean {
  return MATRIX_IDS.includes(value);
}
