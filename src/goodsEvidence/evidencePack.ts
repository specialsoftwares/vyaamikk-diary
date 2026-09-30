import type { OriginalEvidence } from "./evidence";
import { isSha256Hex } from "./evidence";
import type { ItcDisposition } from "./exceptions";
import { detectBrokenChain, hashOriginalSnapshot } from "./hashChain";
import { cloneSnapshot, freezeSnapshot } from "./snapshot";
import type { GrinEvent, ImmutableGrin } from "./types";
import {
  EVIDENCE_SUPPORT_POLICY_VERSION,
  notApplicableError,
  originalSupportsItem,
  REQUIRED_EVIDENCE_ITEMS,
  snapshotSupport,
  type EvidenceInventoryItemId,
} from "./evidenceSupport";

export { EVIDENCE_SUPPORT_POLICY_VERSION, REQUIRED_EVIDENCE_ITEMS } from "./evidenceSupport";
export type { EvidenceInventoryItemId } from "./evidenceSupport";

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

export type EvidenceItemDisposition =
  | { itemId: EvidenceInventoryItemId; kind: "satisfied"; evidenceId: string }
  | {
      itemId: EvidenceInventoryItemId;
      kind: "satisfied_from_snapshot";
      snapshotReceiptId: string;
      reason: string;
    }
  | { itemId: EvidenceInventoryItemId; kind: "not_applicable"; policyCode: string; reason: string }
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
  policyCode: string | null;
  supportPolicyVersion: typeof EVIDENCE_SUPPORT_POLICY_VERSION;
  supportingFields: string[];
  supportingEvidenceIds: string[];
  provenance:
    | "grin_snapshot_assertion"
    | "labelled_original"
    | "not_applicable"
    | "missing"
    | "unknown"
    | "pending"
    | "unresolved";
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
  supportPolicyVersion: typeof EVIDENCE_SUPPORT_POLICY_VERSION;
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

function parseDisposition(value: unknown): EvidenceItemDisposition | { error: string } {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return { error: "inventory disposition is not an object" };
  }
  const record = value as Record<string, unknown>;
  const itemId = record.itemId;
  const requiredIds = new Set<string>(REQUIRED_EVIDENCE_ITEMS.map((item) => item.itemId));
  if (typeof itemId !== "string" || !requiredIds.has(itemId)) {
    return { error: `unknown inventory item ${String(itemId)}` };
  }
  const id = itemId as EvidenceInventoryItemId;
  const kind = record.kind;
  if (kind === "satisfied") {
    if (typeof record.evidenceId !== "string" || !record.evidenceId.trim()) {
      return { error: `${id} satisfied disposition is missing evidenceId` };
    }
    return { itemId: id, kind: "satisfied", evidenceId: record.evidenceId };
  }
  if (kind === "satisfied_from_snapshot") {
    if (typeof record.snapshotReceiptId !== "string" || !record.snapshotReceiptId.trim()) {
      return { error: `${id} snapshot disposition is missing snapshotReceiptId` };
    }
    if (typeof record.reason !== "string" || !record.reason.trim()) {
      return { error: `${id} snapshot support reason is empty` };
    }
    return {
      itemId: id,
      kind: "satisfied_from_snapshot",
      snapshotReceiptId: record.snapshotReceiptId,
      reason: record.reason,
    };
  }
  if (kind === "not_applicable") {
    return {
      itemId: id,
      kind: "not_applicable",
      policyCode: typeof record.policyCode === "string" ? record.policyCode : "",
      reason: typeof record.reason === "string" ? record.reason : "",
    };
  }
  if (kind === "missing" || kind === "unknown" || kind === "pending") {
    if (typeof record.reason !== "string" || !record.reason.trim()) {
      return { error: `${id} ${kind} reason is empty` };
    }
    return { itemId: id, kind, reason: record.reason };
  }
  return { error: `${id} has unsupported disposition kind` };
}

function emptyEvaluation(
  required: (typeof REQUIRED_EVIDENCE_ITEMS)[number],
  kind: InventoryItemEvaluation["kind"],
  provenance: InventoryItemEvaluation["provenance"]
): InventoryItemEvaluation {
  return {
    itemId: required.itemId,
    section: required.section,
    kind,
    evidenceId: null,
    snapshotReceiptId: null,
    reason: null,
    policyCode: null,
    supportPolicyVersion: EVIDENCE_SUPPORT_POLICY_VERSION,
    supportingFields: [],
    supportingEvidenceIds: [],
    provenance,
  };
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
  const evaluations = new Map<string, InventoryItemEvaluation>();
  for (const raw of dispositions) {
    const parsed = parseDisposition(raw);
    if ("error" in parsed) {
      reasons.push(parsed.error);
      continue;
    }
    if (seenItems.has(parsed.itemId)) {
      reasons.push(`duplicate inventory item ${parsed.itemId}`);
      continue;
    }
    seenItems.add(parsed.itemId);
    const required = REQUIRED_EVIDENCE_ITEMS.find((item) => item.itemId === parsed.itemId)!;
    if (parsed.kind === "not_applicable") {
      const naErr = notApplicableError(parsed.itemId, parsed.policyCode, parsed.reason);
      if (naErr) reasons.push(naErr);
      evaluations.set(parsed.itemId, {
        ...emptyEvaluation(required, "not_applicable", "not_applicable"),
        reason: parsed.reason,
        policyCode: parsed.policyCode,
      });
      continue;
    }
    if (parsed.kind === "missing" || parsed.kind === "unknown" || parsed.kind === "pending") {
      reasons.push(`required item ${parsed.itemId} is ${parsed.kind}`);
      evaluations.set(parsed.itemId, {
        ...emptyEvaluation(required, parsed.kind, parsed.kind),
        reason: parsed.reason,
      });
      continue;
    }
    if (parsed.kind === "satisfied_from_snapshot") {
      if (typeof parsed.reason !== "string" || !parsed.reason.trim()) {
        reasons.push(`${parsed.itemId} snapshot support reason is empty`);
      }
      if (!includedReceiptIds.has(parsed.snapshotReceiptId)) {
        reasons.push(`${parsed.itemId} snapshot receipt is not included in this pack`);
      }
      const snapshot = snapshotsByReceipt.get(parsed.snapshotReceiptId);
      const support = snapshotSupport(parsed.itemId, snapshot);
      if (!support.ok) {
        reasons.push(support.detail);
        evaluations.set(parsed.itemId, {
          ...emptyEvaluation(required, "satisfied_from_snapshot", "grin_snapshot_assertion"),
          snapshotReceiptId: parsed.snapshotReceiptId,
          reason: parsed.reason,
        });
        continue;
      }
      evaluations.set(parsed.itemId, {
        ...emptyEvaluation(required, "satisfied_from_snapshot", "grin_snapshot_assertion"),
        snapshotReceiptId: parsed.snapshotReceiptId,
        reason: parsed.reason,
        supportingFields: support.fields,
      });
      continue;
    }
    const original = originalsById.get(parsed.evidenceId);
    if (!original) {
      reasons.push(`required artifact omitted for ${parsed.itemId}`);
      evaluations.set(parsed.itemId, {
        ...emptyEvaluation(required, "satisfied", "labelled_original"),
        evidenceId: parsed.evidenceId,
      });
      continue;
    }
    const originalErr = originalError(original);
    if (originalErr) reasons.push(originalErr);
    const hashed = input.artifactHashes[original.evidenceId];
    if (hashed !== original.rawSha256) {
      reasons.push(`artifact hash missing or mismatched for ${original.evidenceId}`);
    }
    const support = originalSupportsItem(original, parsed.itemId);
    if (!support.ok) {
      reasons.push(support.detail);
    }
    evaluations.set(parsed.itemId, {
      ...emptyEvaluation(required, "satisfied", "labelled_original"),
      evidenceId: parsed.evidenceId,
      supportingEvidenceIds: [parsed.evidenceId],
      supportingFields: support.ok ? support.facts : [],
    });
  }
  for (const required of REQUIRED_EVIDENCE_ITEMS) {
    if (!seenItems.has(required.itemId)) {
      reasons.push(`required item ${required.itemId} is unresolved`);
    }
  }

  const inventoryEvaluation: InventoryItemEvaluation[] = REQUIRED_EVIDENCE_ITEMS.map(
    (required) => evaluations.get(required.itemId) ?? emptyEvaluation(required, "unresolved", "unresolved")
  );

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
    supportPolicyVersion: EVIDENCE_SUPPORT_POLICY_VERSION,
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
