import type { OriginalEvidence } from "./evidence";
import { isSha256Hex } from "./evidence";
import type { ItcDisposition } from "./exceptions";
import { detectBrokenChain, hashOriginalSnapshot } from "./hashChain";
import { cloneSnapshot, freezeSnapshot } from "./snapshot";
import type { GrinEvent, ImmutableGrin } from "./types";

export const EVIDENCE_PACK_SECTIONS = [
  "supplier",
  "commercialDocuments",
  "movementEvidence",
  "receiptEvidence",
  "accountingPaymentEvidence",
  "gstEvidence",
] as const;

export type EvidencePackSection = (typeof EVIDENCE_PACK_SECTIONS)[number];

/** Versioned inventory of required coverage items. Integrity is separate from coverage. */
export const EVIDENCE_INVENTORY_VERSION = 1 as const;

export const REQUIRED_EVIDENCE_ITEMS = [
  { itemId: "supplier_identity", section: "supplier" },
  { itemId: "commercial_document", section: "commercialDocuments" },
  { itemId: "movement_evidence", section: "movementEvidence" },
  { itemId: "receipt_evidence", section: "receiptEvidence" },
  { itemId: "accounting_payment_evidence", section: "accountingPaymentEvidence" },
  { itemId: "gst_evidence", section: "gstEvidence" },
] as const;

export type EvidenceInventoryItemId = (typeof REQUIRED_EVIDENCE_ITEMS)[number]["itemId"];

export type EvidenceItemDisposition =
  | { itemId: EvidenceInventoryItemId; kind: "satisfied"; evidenceId: string }
  | {
      itemId: EvidenceInventoryItemId;
      kind: "satisfied_from_snapshot";
      snapshotReceiptId: string;
      reason: string;
    }
  | { itemId: EvidenceInventoryItemId; kind: "not_applicable"; reason: string }
  | { itemId: EvidenceInventoryItemId; kind: "missing"; reason: string }
  | { itemId: EvidenceInventoryItemId; kind: "unknown"; reason: string }
  | { itemId: EvidenceInventoryItemId; kind: "pending"; reason: string };

export type PackIntegrity = "verified" | "failed";
export type PackCoverage = "complete" | "incomplete";
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

/** Receipt-scoped evidence belongs to one included cut. Purchase-scoped evidence names every included receipt it supports. */
export type EvidenceLinkage =
  | {
      scope: "receipt";
      ownerUid: string;
      ledgerId: string;
      purchaseCaseId: string;
      receiptId: string;
    }
  | {
      scope: "purchase";
      ownerUid: string;
      ledgerId: string;
      purchaseCaseId: string;
      supportsReceiptIds: string[];
    };

export interface InventoryItemEvaluation {
  itemId: EvidenceInventoryItemId;
  section: EvidencePackSection;
  kind: EvidenceItemDisposition["kind"] | "unresolved";
  evidenceId: string | null;
  snapshotReceiptId: string | null;
  reason: string | null;
}

export interface PackVerificationAnchors {
  pinnedCuts: PinnedEventCut[];
  originalSnapshotHashes: Record<string, string>;
}

export interface EvidencePackManifest {
  schemaVersion: 1;
  inventoryVersion: typeof EVIDENCE_INVENTORY_VERSION;
  exportId: string;
  ownerUid: string;
  ledgerId: string;
  purchaseCaseId: string;
  pinnedCuts: PinnedEventCut[];
  sections: EvidencePackSection[];
  integrity: PackIntegrity;
  coverage: PackCoverage;
  completeness: PackCompleteness;
  incompleteReasons: string[];
  inventoryEvaluation: InventoryItemEvaluation[];
  evidenceAssociations: Record<string, EvidenceLinkage>;
  verificationAnchors: PackVerificationAnchors;
  artifactHashes: Record<string, string>;
  templateVersion: string;
  parserVersions: Record<string, string>;
  itcDisposition: ItcDisposition;
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
  for (const event of sliced) {
    if (event.receiptId !== cut.receiptId) {
      return `event cut ${cut.receiptId} stream mixes receipts`;
    }
  }
  if (detectBrokenChain(sliced) !== null) {
    return `event cut ${cut.receiptId} stream is broken`;
  }
  const head = sliced[cut.eventVersion - 1]!;
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

function linkageError(
  evidenceId: string,
  link: EvidenceLinkage | undefined,
  subject: {
    ownerUid: string;
    ledgerId: string;
    purchaseCaseId: string;
    includedReceiptIds: Set<string>;
  }
): string | null {
  if (!link || typeof link !== "object") return `evidence link missing for ${evidenceId}`;
  if (link.ownerUid !== subject.ownerUid) return `${evidenceId} owner does not match pack`;
  if (link.ledgerId !== subject.ledgerId) return `${evidenceId} ledger does not match pack`;
  if (link.purchaseCaseId !== subject.purchaseCaseId) return `${evidenceId} purchase case does not match pack`;
  if (link.scope === "receipt") {
    if (typeof link.receiptId !== "string" || !link.receiptId.trim()) {
      return `${evidenceId} receipt association is missing receiptId`;
    }
    if (!subject.includedReceiptIds.has(link.receiptId)) {
      return `${evidenceId} receipt is not included in this pack`;
    }
    return null;
  }
  if (link.scope === "purchase") {
    if (!Array.isArray(link.supportsReceiptIds) || link.supportsReceiptIds.length === 0) {
      return `${evidenceId} purchase association must name supported receipts`;
    }
    const seen = new Set<string>();
    for (const receiptId of link.supportsReceiptIds) {
      if (typeof receiptId !== "string" || !receiptId.trim()) {
        return `${evidenceId} purchase association has an invalid receipt id`;
      }
      if (seen.has(receiptId)) return `${evidenceId} purchase association has duplicate receipt ids`;
      seen.add(receiptId);
      if (!subject.includedReceiptIds.has(receiptId)) {
        return `${evidenceId} purchase association names a receipt not included in this pack`;
      }
    }
    return null;
  }
  return `${evidenceId} evidence association scope is invalid`;
}

function issuanceAnchorError(
  events: GrinEvent[],
  originalSnapshot: ImmutableGrin | undefined,
  subject: { ownerUid: string; ledgerId: string; receiptId: string }
): string | null {
  if (!originalSnapshot) return "original snapshot missing";
  const issued = events.find((event) => event.type === "receipt_registered");
  if (!issued) return "issuance event missing";
  if (issued.receiptId !== subject.receiptId) return "issuance event receipt does not match cut";
  if (originalSnapshot.receiptId !== subject.receiptId) return "original snapshot receipt does not match cut";
  if (originalSnapshot.ownerUid !== subject.ownerUid) return "original snapshot owner does not match pack";
  if (originalSnapshot.ledgerId !== subject.ledgerId) return "original snapshot ledger does not match pack";
  const recomputed = hashOriginalSnapshot(originalSnapshot);
  if (originalSnapshot.originalSnapshotHash && originalSnapshot.originalSnapshotHash !== recomputed) {
    return "original snapshot hash does not match snapshot bytes";
  }
  if (issued.typedChanges.originalSnapshotHash !== recomputed) {
    return "issuance snapshot anchor mismatch";
  }
  return null;
}

function streamIdentityError(
  events: GrinEvent[],
  subject: { ownerUid: string; receiptId: string }
): string | null {
  for (const event of events) {
    if (event.receiptId !== subject.receiptId) return "event stream mixes receipts";
    if (event.actorUid !== subject.ownerUid) return "event stream owner does not match pack";
  }
  return null;
}

export function evaluatePackCompleteness(input: {
  ownerUid: string;
  ledgerId: string;
  purchaseCaseId: string;
  pinnedCuts: PinnedEventCut[];
  verifiedOriginals: OriginalEvidence[];
  artifactHashes: Record<string, string>;
  missingOrUnverifiable: string[];
  eventStreams?: EventStreamCutInput[];
  originalSnapshots?: ImmutableGrin[];
  inventoryDispositions?: EvidenceItemDisposition[];
  evidenceLinks?: Record<string, EvidenceLinkage>;
}): {
  integrity: PackIntegrity;
  coverage: PackCoverage;
  completeness: PackCompleteness;
  incompleteReasons: string[];
  inventoryEvaluation: InventoryItemEvaluation[];
} {
  const reasons: string[] = [...input.missingOrUnverifiable];
  const integrityReasons: string[] = [];
  if (input.pinnedCuts.length === 0) {
    integrityReasons.push("no valid event cut");
  }
  const streams = input.eventStreams ?? [];
  const snapshots = input.originalSnapshots ?? [];
  const links = input.evidenceLinks ?? {};
  const originalsById = new Map(input.verifiedOriginals.map((item) => [item.evidenceId, item]));
  const includedReceiptIds = new Set(
    input.pinnedCuts.map((cut) => cut.receiptId).filter((id) => typeof id === "string" && id.trim().length > 0)
  );
  const cutReceipts = input.pinnedCuts.map((cut) => cut.receiptId);
  if (new Set(cutReceipts).size !== cutReceipts.length) {
    integrityReasons.push("duplicate receipt cuts");
  }
  const streamReceipts = streams.map((item) => item.receiptId);
  if (new Set(streamReceipts).size !== streamReceipts.length) {
    integrityReasons.push("duplicate event stream receipt");
  }
  const snapshotReceipts = snapshots.map((item) => item.receiptId);
  if (new Set(snapshotReceipts).size !== snapshotReceipts.length) {
    integrityReasons.push("duplicate original snapshot receipt");
  }
  const snapshotsByReceipt = new Map(snapshots.map((item) => [item.receiptId, item]));

  const subject = {
    ownerUid: input.ownerUid,
    ledgerId: input.ledgerId,
    purchaseCaseId: input.purchaseCaseId,
    includedReceiptIds,
  };

  for (const cut of input.pinnedCuts) {
    const shape = cutShapeError(cut);
    if (shape) {
      integrityReasons.push(shape);
      continue;
    }
    const stream = streams.find((item) => item.receiptId === cut.receiptId);
    if (!stream) {
      integrityReasons.push(`event stream missing for ${cut.receiptId}`);
      continue;
    }
    const identity = streamIdentityError(stream.events, { ownerUid: input.ownerUid, receiptId: cut.receiptId });
    if (identity) integrityReasons.push(identity);
    const match = cutMatchesEventStream(cut, stream.events);
    if (match) integrityReasons.push(match);
    const snapshot = snapshotsByReceipt.get(cut.receiptId);
    const anchor = issuanceAnchorError(stream.events, snapshot, {
      ownerUid: input.ownerUid,
      ledgerId: input.ledgerId,
      receiptId: cut.receiptId,
    });
    if (anchor) integrityReasons.push(anchor);
  }

  if (input.verifiedOriginals.length === 0) {
    reasons.push("no verified originals");
  }
  for (const original of input.verifiedOriginals) {
    const err = originalError(original);
    if (err) integrityReasons.push(err);
    const hashed = input.artifactHashes[original.evidenceId];
    if (hashed !== original.rawSha256) {
      integrityReasons.push(`artifact hash missing or mismatched for ${original.evidenceId}`);
    }
    const linkErr = linkageError(original.evidenceId, links[original.evidenceId], subject);
    if (linkErr) integrityReasons.push(linkErr);
  }
  for (const artifactId of Object.keys(input.artifactHashes)) {
    if (!originalsById.has(artifactId)) {
      integrityReasons.push(`artifact ${artifactId} is not in the included evidence`);
    }
  }

  const dispositions = input.inventoryDispositions ?? [];
  const seenItems = new Set<string>();
  const requiredIds = new Set<string>(REQUIRED_EVIDENCE_ITEMS.map((item) => item.itemId));
  const byItem = new Map<string, EvidenceItemDisposition>();
  for (const disposition of dispositions) {
    if (!requiredIds.has(disposition.itemId)) {
      reasons.push(`unknown inventory item ${disposition.itemId}`);
      continue;
    }
    if (seenItems.has(disposition.itemId)) {
      reasons.push(`duplicate inventory item ${disposition.itemId}`);
      continue;
    }
    seenItems.add(disposition.itemId);
    byItem.set(disposition.itemId, disposition);
    if (disposition.kind === "not_applicable") {
      if (typeof disposition.reason !== "string" || !disposition.reason.trim()) {
        reasons.push(`${disposition.itemId} not-applicable reason is empty`);
      }
      continue;
    }
    if (
      disposition.kind === "missing" ||
      disposition.kind === "unknown" ||
      disposition.kind === "pending"
    ) {
      if (typeof disposition.reason !== "string" || !disposition.reason.trim()) {
        reasons.push(`${disposition.itemId} ${disposition.kind} reason is empty`);
      } else {
        reasons.push(`required item ${disposition.itemId} is ${disposition.kind}`);
      }
      continue;
    }
    if (disposition.kind === "satisfied_from_snapshot") {
      if (typeof disposition.reason !== "string" || !disposition.reason.trim()) {
        reasons.push(`${disposition.itemId} snapshot support reason is empty`);
      }
      if (!includedReceiptIds.has(disposition.snapshotReceiptId)) {
        reasons.push(`${disposition.itemId} snapshot receipt is not included in this pack`);
      }
      if (!snapshotsByReceipt.has(disposition.snapshotReceiptId)) {
        reasons.push(`${disposition.itemId} snapshot is not supplied`);
      }
      continue;
    }
    const original = originalsById.get(disposition.evidenceId);
    if (!original) {
      reasons.push(`required artifact omitted for ${disposition.itemId}`);
      continue;
    }
    const originalErr = originalError(original);
    if (originalErr) reasons.push(originalErr);
    const hashed = input.artifactHashes[original.evidenceId];
    if (hashed !== original.rawSha256) {
      reasons.push(`artifact hash missing or mismatched for ${original.evidenceId}`);
    }
  }
  for (const required of REQUIRED_EVIDENCE_ITEMS) {
    if (!seenItems.has(required.itemId)) {
      reasons.push(`required item ${required.itemId} is unresolved`);
    }
  }

  const inventoryEvaluation: InventoryItemEvaluation[] = REQUIRED_EVIDENCE_ITEMS.map((required) => {
    const disposition = byItem.get(required.itemId);
    if (!disposition) {
      return {
        itemId: required.itemId,
        section: required.section,
        kind: "unresolved",
        evidenceId: null,
        snapshotReceiptId: null,
        reason: null,
      };
    }
    return {
      itemId: required.itemId,
      section: required.section,
      kind: disposition.kind,
      evidenceId: "evidenceId" in disposition ? disposition.evidenceId : null,
      snapshotReceiptId: "snapshotReceiptId" in disposition ? disposition.snapshotReceiptId : null,
      reason: "reason" in disposition ? disposition.reason : null,
    };
  });

  const uniqueIntegrity = [...new Set(integrityReasons)];
  const uniqueCoverage = [...new Set(reasons)];
  const integrity: PackIntegrity = uniqueIntegrity.length === 0 ? "verified" : "failed";
  const coverage: PackCoverage = uniqueCoverage.length === 0 ? "complete" : "incomplete";
  const incompleteReasons = [...new Set([...uniqueIntegrity, ...uniqueCoverage])];
  return {
    integrity,
    coverage,
    completeness: integrity === "verified" && coverage === "complete" ? "complete" : "incomplete",
    incompleteReasons,
    inventoryEvaluation,
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
  originalSnapshots?: ImmutableGrin[];
  inventoryDispositions?: EvidenceItemDisposition[];
  evidenceLinks?: Record<string, EvidenceLinkage>;
  templateVersion: string;
  parserVersions?: Record<string, string>;
}): EvidencePackManifest {
  const pinnedCuts = cloneSnapshot(input.pinnedCuts);
  const inventoryDispositions = cloneSnapshot(input.inventoryDispositions ?? []);
  const evidenceLinks = cloneSnapshot(input.evidenceLinks ?? {});
  const evaluated = evaluatePackCompleteness({
    ownerUid: input.ownerUid,
    ledgerId: input.ledgerId,
    purchaseCaseId: input.purchaseCaseId,
    pinnedCuts,
    verifiedOriginals: input.verifiedOriginals,
    artifactHashes: input.artifactHashes,
    missingOrUnverifiable: input.missingOrUnverifiable ?? [],
    eventStreams: input.eventStreams,
    originalSnapshots: input.originalSnapshots,
    inventoryDispositions,
    evidenceLinks,
  });
  const originalSnapshotHashes: Record<string, string> = {};
  for (const snapshot of input.originalSnapshots ?? []) {
    if (snapshot.originalSnapshotHash) {
      originalSnapshotHashes[snapshot.receiptId] = snapshot.originalSnapshotHash;
    }
  }
  return {
    schemaVersion: 1,
    inventoryVersion: EVIDENCE_INVENTORY_VERSION,
    exportId: input.exportId,
    ownerUid: input.ownerUid,
    ledgerId: input.ledgerId,
    purchaseCaseId: input.purchaseCaseId,
    pinnedCuts,
    sections: [...EVIDENCE_PACK_SECTIONS],
    integrity: evaluated.integrity,
    coverage: evaluated.coverage,
    completeness: evaluated.completeness,
    incompleteReasons: evaluated.incompleteReasons,
    inventoryEvaluation: freezeSnapshot(evaluated.inventoryEvaluation),
    evidenceAssociations: freezeSnapshot(evidenceLinks),
    verificationAnchors: freezeSnapshot({
      pinnedCuts,
      originalSnapshotHashes,
    }),
    artifactHashes: { ...input.artifactHashes },
    templateVersion: input.templateVersion,
    parserVersions: input.parserVersions ?? {},
    itcDisposition: "not_determined",
  };
}

export function mayMarkComplete(manifest: EvidencePackManifest): boolean {
  return (
    manifest.completeness === "complete" &&
    manifest.integrity === "verified" &&
    manifest.coverage === "complete" &&
    manifest.incompleteReasons.length === 0 &&
    manifest.itcDisposition === "not_determined"
  );
}

export function cutMatchesHead(
  cut: PinnedEventCut,
  current: { eventVersion: number; headHash: string }
): boolean {
  return cut.eventVersion === current.eventVersion && cut.headHash === current.headHash;
}
