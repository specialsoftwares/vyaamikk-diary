import type { OriginalEvidence } from "./evidence";
import { isSha256Hex } from "./evidence";

export const EVIDENCE_PACK_SECTIONS = [
  "supplier",
  "commercialDocuments",
  "movementEvidence",
  "receiptEvidence",
  "accountingPaymentEvidence",
  "gstEvidence",
] as const;

export type EvidencePackSection = (typeof EVIDENCE_PACK_SECTIONS)[number];

export type PackCompleteness = "complete" | "incomplete";

export interface PinnedEventCut {
  receiptId: string;
  eventVersion: number;
  headHash: string;
}

export interface EvidencePackManifest {
  schemaVersion: 1;
  exportId: string;
  ownerUid: string;
  ledgerId: string;
  purchaseCaseId: string;
  pinnedCuts: PinnedEventCut[];
  sections: EvidencePackSection[];
  completeness: PackCompleteness;
  incompleteReasons: string[];
  artifactHashes: Record<string, string>;
  templateVersion: string;
  parserVersions: Record<string, string>;
}

export function pinEventCut(input: PinnedEventCut): PinnedEventCut {
  if (!input.receiptId.trim()) {
    throw new Error("goodsEvidence: export cut requires a receiptId");
  }
  if (!input.headHash.trim() || input.eventVersion < 1) {
    throw new Error("goodsEvidence: export cut requires a versioned head hash");
  }
  return { ...input };
}

function cutError(cut: PinnedEventCut): string | null {
  if (!cut.receiptId?.trim()) return "event cut missing receiptId";
  if (cut.eventVersion < 1) return `event cut ${cut.receiptId} has no version`;
  if (!cut.headHash?.trim()) return `event cut ${cut.receiptId} has no head hash`;
  return null;
}

function originalError(item: OriginalEvidence): string | null {
  if (item.isDerivative) return `${item.evidenceId} is a derivative, not an original`;
  if (item.verification !== "verified") return `${item.evidenceId} is not a verified original`;
  if (!isSha256Hex(item.rawSha256)) return `${item.evidenceId} hash is not SHA-256`;
  return null;
}

export function evaluatePackCompleteness(input: {
  pinnedCuts: PinnedEventCut[];
  verifiedOriginals: OriginalEvidence[];
  artifactHashes: Record<string, string>;
  missingOrUnverifiable: string[];
}): { completeness: PackCompleteness; incompleteReasons: string[] } {
  const reasons: string[] = [...input.missingOrUnverifiable];
  if (input.pinnedCuts.length === 0) {
    reasons.push("no valid event cut");
  }
  for (const cut of input.pinnedCuts) {
    const err = cutError(cut);
    if (err) reasons.push(err);
  }
  if (input.verifiedOriginals.length === 0) {
    reasons.push("no verified originals");
  }
  for (const original of input.verifiedOriginals) {
    const err = originalError(original);
    if (err) reasons.push(err);
    const hashed = input.artifactHashes[original.evidenceId];
    if (hashed !== original.rawSha256) {
      reasons.push(`artifact hash missing or mismatched for ${original.evidenceId}`);
    }
  }
  const unique = [...new Set(reasons)];
  return {
    completeness: unique.length === 0 ? "complete" : "incomplete",
    incompleteReasons: unique,
  };
}

export function assembleManifest(input: {
  exportId: string;
  ownerUid: string;
  ledgerId: string;
  purchaseCaseId: string;
  pinnedCuts: PinnedEventCut[];
  verifiedOriginals: OriginalEvidence[];
  artifactHashes: Record<string, string>;
  missingOrUnverifiable?: string[];
  templateVersion: string;
  parserVersions?: Record<string, string>;
}): EvidencePackManifest {
  const pinnedCuts = input.pinnedCuts.map((cut) => ({ ...cut }));
  const evaluated = evaluatePackCompleteness({
    pinnedCuts,
    verifiedOriginals: input.verifiedOriginals,
    artifactHashes: input.artifactHashes,
    missingOrUnverifiable: input.missingOrUnverifiable ?? [],
  });
  return {
    schemaVersion: 1,
    exportId: input.exportId,
    ownerUid: input.ownerUid,
    ledgerId: input.ledgerId,
    purchaseCaseId: input.purchaseCaseId,
    pinnedCuts: pinnedCuts.map((cut) =>
      cutError(cut) ? cut : pinEventCut(cut)
    ),
    sections: [...EVIDENCE_PACK_SECTIONS],
    completeness: evaluated.completeness,
    incompleteReasons: evaluated.incompleteReasons,
    artifactHashes: { ...input.artifactHashes },
    templateVersion: input.templateVersion,
    parserVersions: input.parserVersions ?? {},
  };
}

export function mayMarkComplete(manifest: EvidencePackManifest): boolean {
  return manifest.completeness === "complete" && manifest.incompleteReasons.length === 0;
}

/**
 * Concurrent amendments after pinEventCut must not be mixed into this pack.
 * A later head hash is a different export.
 */
export function cutMatchesHead(
  cut: PinnedEventCut,
  current: { eventVersion: number; headHash: string }
): boolean {
  return cut.eventVersion === current.eventVersion && cut.headHash === current.headHash;
}
