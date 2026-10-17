/**
 * WAVE-2 APPLICATION repository labels. Team 5: this is not GrinFixtureRepository.
 * issuedNumber stays null until a G1 server issues it. Do not treat SQLITE_HOST
 * tests as NATIVE_DEVICE process-death proof.
 */

export const GRIN_APPLICATION_REPOSITORY_LABEL =
  "APPLICATION / WAVE-2: GrinApplicationRepository. Reads and writes via GrinOutbox (listForOwner / listForOwnerAndLedger when present / persistDraftAndQueue / persistMutationAndQueue when present). Does not invent issuedNumber. Does not revive a retired session. Not GrinFixtureRepository. Not Firestore.";

export const GRIN_APPLICATION_REPOSITORY_KIND = "GrinApplicationRecord" as const;

/** Single-ledger Wave 2 binding until a ledger picker exists. Not a fixture id. */
export const GRIN_APPLICATION_LEDGER_ID = "primary";

export const GRIN_PRICING_QUOTA_UNRESOLVED =
  "GRIN is included in existing Starter/Professional/Business (no separate SKU; SOURCE expected paise only, not Play). Issuance uses the ordinary monthly record allowance in source. Owner-selected retained-storage caps are wired in source and must not be advertised.";

export function grinRepositoryIsFake(label: string): boolean {
  return label.startsWith("FAKE /") || label.includes("FAKE / WAVE-");
}
