import type { OriginalEvidence } from "./evidence";
import { isSha256Hex } from "./evidence";
import { detectBrokenChain } from "./hashChain";
import type { GrinEvent } from "./types";

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

export interface EventStreamCutInput {
  receiptId: string;
  events: GrinEvent[];
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

export function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

export function pinEventCut(input: PinnedEventCut): PinnedEventCut {
  const err = cutShapeError(input);
  if (err) throw new Error(`goodsEvidence: ${err}`);
  return { receiptId: input.receiptId.trim(), eventVersion: input.eventVersion, headHash: input.headHash };
}

export function cutShapeError(cut: PinnedEventCut): string | null {
  if (!cut.receiptId?.trim()) return "event cut missing receiptId";
  if (!isPositiveInt(cut.eventVersion)) return `event cut ${cut.receiptId} version must be a positive integer`;
  if (!isSha256Hex(cut.headHash ?? "")) return `event cut ${cut.receiptId} head hash is not SHA-256`;
  return null;
}

export function cutMatchesEventStream(cut: PinnedEventCut, events: GrinEvent[]): string | null {
  const shape = cutShapeError(cut);
  if (shape) return shape;
  const sliced = events.slice(0, cut.eventVersion);
  if (sliced.length !== cut.eventVersion) {
    return `event cut ${cut.receiptId} version exceeds stream`;
  }
  if (detectBrokenChain(sliced) !== null) {
    return `event cut ${cut.receiptId} stream is broken`;
  }
  const head = sliced[cut.eventVersion - 1]!;
  if (head.receiptId !== cut.receiptId) {
    return `event cut ${cut.receiptId} does not match stream receipt`;
  }
  if (head.streamSequence !== cut.eventVersion || head.eventHash !== cut.headHash) {
    return `event cut ${cut.receiptId} does not match stream head`;
  }
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
  eventStreams?: EventStreamCutInput[];
}): { completeness: PackCompleteness; incompleteReasons: string[] } {
  const reasons: string[] = [...input.missingOrUnverifiable];
  if (input.pinnedCuts.length === 0) {
    reasons.push("no valid event cut");
  }
  const streams = input.eventStreams ?? [];
  for (const cut of input.pinnedCuts) {
    const shape = cutShapeError(cut);
    if (shape) {
      reasons.push(shape);
      continue;
    }
    const stream = streams.find((item) => item.receiptId === cut.receiptId);
    if (!stream) {
      reasons.push(`event stream missing for ${cut.receiptId}`);
      continue;
    }
    const match = cutMatchesEventStream(cut, stream.events);
    if (match) reasons.push(match);
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
  eventStreams?: EventStreamCutInput[];
  templateVersion: string;
  parserVersions?: Record<string, string>;
}): EvidencePackManifest {
  const pinnedCuts = input.pinnedCuts.map((cut) => ({ ...cut }));
  const evaluated = evaluatePackCompleteness({
    pinnedCuts,
    verifiedOriginals: input.verifiedOriginals,
    artifactHashes: input.artifactHashes,
    missingOrUnverifiable: input.missingOrUnverifiable ?? [],
    eventStreams: input.eventStreams,
  });
  return {
    schemaVersion: 1,
    exportId: input.exportId,
    ownerUid: input.ownerUid,
    ledgerId: input.ledgerId,
    purchaseCaseId: input.purchaseCaseId,
    pinnedCuts,
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

export function cutMatchesHead(
  cut: PinnedEventCut,
  current: { eventVersion: number; headHash: string }
): boolean {
  return cut.eventVersion === current.eventVersion && cut.headHash === current.headHash;
}
