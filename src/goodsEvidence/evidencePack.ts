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
  if (!input.headHash || input.eventVersion < 1) {
    throw new Error("goodsEvidence: export cut requires a versioned head hash");
  }
  return { ...input };
}

export function assembleManifest(input: {
  exportId: string;
  ownerUid: string;
  ledgerId: string;
  purchaseCaseId: string;
  pinnedCuts: PinnedEventCut[];
  artifactHashes: Record<string, string>;
  missingOrUnverifiable: string[];
  templateVersion: string;
  parserVersions?: Record<string, string>;
}): EvidencePackManifest {
  const incomplete = input.missingOrUnverifiable.length > 0;
  return {
    schemaVersion: 1,
    exportId: input.exportId,
    ownerUid: input.ownerUid,
    ledgerId: input.ledgerId,
    purchaseCaseId: input.purchaseCaseId,
    pinnedCuts: input.pinnedCuts.map(pinEventCut),
    sections: [...EVIDENCE_PACK_SECTIONS],
    completeness: incomplete ? "incomplete" : "complete",
    incompleteReasons: [...input.missingOrUnverifiable],
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
