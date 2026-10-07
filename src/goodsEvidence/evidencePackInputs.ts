/**
 * G2 pack-input assembly for Team 4 `assembleManifest`.
 *
 * Does not force completeness. Hashes are not legal truth.
 * Invoice/challan numbers on a GRIN snapshot are references, not retained originals.
 * ITC is not determined here (`assembleManifest` hard-codes `not_determined`).
 *
 * Missing, corrupt, or wrong-receipt originals stay incomplete.
 * Support policy v2 is unchanged. Not a live callable.
 */

import {
  generationError,
  isEvidenceCategory,
  isRetainedOriginalState,
  isSha256Hex,
  normalizeOsConversionOccurred,
  type EvidenceCategory,
  type LabelledEvidenceSupport,
  type OriginalEvidence,
  type OsConversionOccurred,
} from "./evidence";
import {
  notApplicableError,
  originalSupportsItem,
  REQUIRED_EVIDENCE_ITEMS,
  SNAPSHOT_ELIGIBLE_ITEMS,
  snapshotSupport,
  type EvidenceInventoryItemId,
} from "./evidenceSupport";
import type {
  EvidenceItemDisposition,
  EvidenceLinkage,
  EventStreamCutInput,
  PinnedEventCut,
} from "./evidencePack";
import type { GrinEvent, ImmutableGrin } from "./types";

export type GrinPackOriginalInput = {
  evidenceId: string;
  ownerUid: string;
  ledgerId: string;
  receiptId: string;
  category: EvidenceCategory | string;
  mime: string;
  byteSize: number;
  rawSha256: string;
  generation: string | null;
  originalFileName: string | null;
  state: string;
  captureProvenance?: string | null;
  osConversionOccurred?: OsConversionOccurred;
  labelledSupport?: LabelledEvidenceSupport;
};

export type GrinConfirmedCutInput = {
  receiptId: string;
  events: GrinEvent[];
  originalSnapshot: ImmutableGrin;
  eventVersion: number;
  headHash: string;
};

export type GrinPackNotApplicable = {
  itemId: EvidenceInventoryItemId;
  policyCode: string;
  reason: string;
};

export type GrinEvidencePackInputs = {
  pinnedCuts: PinnedEventCut[];
  verifiedOriginals: OriginalEvidence[];
  artifactHashes: Record<string, string>;
  evidenceLinks: Record<string, EvidenceLinkage>;
  missingOrUnverifiable: string[];
  inventoryDispositions: EvidenceItemDisposition[];
  eventStreams: EventStreamCutInput[];
  originalSnapshots: ImmutableGrin[];
  /**
   * Coverage is inventory evaluation at the pinned cut.
   * This assembler does not copy original bytes into an export payload.
   */
  packPayloadKind: "manifest_and_hashes";
  originalBytesBundled: false;
};

function snapshotHasInvoiceReference(snapshot: ImmutableGrin): boolean {
  return snapshot.commercial?.supplierInvoiceNumber?.kind === "present";
}

function defaultReceiptLink(
  ownerUid: string,
  ledgerId: string,
  purchaseCaseId: string,
  receiptId: string
): EvidenceLinkage {
  return {
    scope: "receipt",
    ownerUid,
    ledgerId,
    purchaseCaseId,
    receiptId,
  };
}

/**
 * Given confirmed events + verified originals + associations, produce
 * `assembleManifest` inputs. Callers must not set completeness themselves.
 */
export function assembleEvidencePackInputs(input: {
  ownerUid: string;
  ledgerId: string;
  purchaseCaseId: string;
  confirmedCuts: GrinConfirmedCutInput[];
  originals: GrinPackOriginalInput[];
  associations?: Record<string, EvidenceLinkage>;
  notApplicable?: GrinPackNotApplicable[];
}): GrinEvidencePackInputs {
  const missingOrUnverifiable: string[] = [];
  const pinnedCuts: PinnedEventCut[] = [];
  const eventStreams: EventStreamCutInput[] = [];
  const originalSnapshots: ImmutableGrin[] = [];
  const includedReceiptIds = new Set<string>();

  for (const cut of input.confirmedCuts) {
    pinnedCuts.push({
      receiptId: cut.receiptId,
      eventVersion: cut.eventVersion,
      headHash: cut.headHash,
    });
    eventStreams.push({ receiptId: cut.receiptId, events: cut.events });
    originalSnapshots.push(cut.originalSnapshot);
    includedReceiptIds.add(cut.receiptId);
  }

  const verifiedOriginals: OriginalEvidence[] = [];
  const artifactHashes: Record<string, string> = {};
  const evidenceLinks: Record<string, EvidenceLinkage> = {};

  for (const original of input.originals) {
    if (original.ownerUid !== input.ownerUid) {
      missingOrUnverifiable.push(`${original.evidenceId} owner does not match pack`);
      continue;
    }
    if (original.ledgerId !== input.ledgerId) {
      missingOrUnverifiable.push(`${original.evidenceId} ledger does not match pack`);
      continue;
    }
    if (!includedReceiptIds.has(original.receiptId)) {
      missingOrUnverifiable.push(`${original.evidenceId} is associated with a receipt not in this pack`);
      continue;
    }
    if (!isRetainedOriginalState(original.state) || (original.state !== "verified" && original.state !== "linked")) {
      missingOrUnverifiable.push(`${original.evidenceId} original is not verified`);
      continue;
    }
    if (!isEvidenceCategory(original.category)) {
      missingOrUnverifiable.push(`${original.evidenceId} category is not a known evidence category`);
      continue;
    }
    if (!isSha256Hex(original.rawSha256)) {
      missingOrUnverifiable.push(`${original.evidenceId} hash is not SHA-256`);
      continue;
    }
    if (typeof original.byteSize !== "number" || !Number.isInteger(original.byteSize) || original.byteSize < 1) {
      missingOrUnverifiable.push(`${original.evidenceId} is corrupt`);
      continue;
    }
    if (original.generation === "verified") {
      missingOrUnverifiable.push(`${original.evidenceId} generation is not a storage object generation`);
      continue;
    }
    const genErr = generationError(original.generation);
    if (genErr) {
      missingOrUnverifiable.push(`${original.evidenceId} ${genErr}`);
      continue;
    }
    const mapped: OriginalEvidence = {
      evidenceId: original.evidenceId,
      category: original.category,
      originalFileName: original.originalFileName && original.originalFileName.trim() ? original.originalFileName : "original",
      mime: original.mime,
      byteSize: original.byteSize,
      rawSha256: original.rawSha256,
      storageObjectGeneration: original.generation,
      captureProvenance:
        original.captureProvenance && original.captureProvenance.trim()
          ? original.captureProvenance
          : "grin-g2-retained-original",
      osConversionOccurred: normalizeOsConversionOccurred(original.osConversionOccurred),
      verification: "verified",
      isDerivative: false,
      labelledSupport: original.labelledSupport,
    };
    const suppliedLink = input.associations?.[original.evidenceId];
    const link =
      suppliedLink ??
      defaultReceiptLink(input.ownerUid, input.ledgerId, input.purchaseCaseId, original.receiptId);
    if (link.ownerUid !== input.ownerUid || link.ledgerId !== input.ledgerId) {
      missingOrUnverifiable.push(`${original.evidenceId} evidence association does not match pack`);
      continue;
    }
    if (link.scope === "receipt" && link.receiptId !== original.receiptId) {
      missingOrUnverifiable.push(`${original.evidenceId} is associated with a receipt not in this pack`);
      continue;
    }
    if (link.scope === "receipt" && !includedReceiptIds.has(link.receiptId)) {
      missingOrUnverifiable.push(`${original.evidenceId} is associated with a receipt not in this pack`);
      continue;
    }
    verifiedOriginals.push(mapped);
    artifactHashes[mapped.evidenceId] = mapped.rawSha256;
    evidenceLinks[mapped.evidenceId] = link;
  }

  const inventoryDispositions: EvidenceItemDisposition[] = [];
  const naByItem = new Map<EvidenceInventoryItemId, GrinPackNotApplicable>();
  for (const item of input.notApplicable ?? []) {
    naByItem.set(item.itemId, item);
  }

  for (const required of REQUIRED_EVIDENCE_ITEMS) {
    const na = naByItem.get(required.itemId);
    if (na) {
      const naErr = notApplicableError(required.itemId, na.policyCode, na.reason);
      if (naErr) {
        missingOrUnverifiable.push(naErr);
        inventoryDispositions.push({
          itemId: required.itemId,
          kind: "missing",
          reason: naErr,
        });
        continue;
      }
      inventoryDispositions.push({
        itemId: required.itemId,
        kind: "not_applicable",
        policyCode: na.policyCode,
        reason: na.reason,
      });
      continue;
    }

    let matched: OriginalEvidence | null = null;
    for (const original of verifiedOriginals) {
      if (originalSupportsItem(original, required.itemId).ok) {
        matched = original;
        break;
      }
    }
    if (matched) {
      inventoryDispositions.push({
        itemId: required.itemId,
        kind: "satisfied",
        evidenceId: matched.evidenceId,
      });
      continue;
    }

    if (SNAPSHOT_ELIGIBLE_ITEMS.includes(required.itemId)) {
      let snapshotMatch: ImmutableGrin | null = null;
      for (const snapshot of originalSnapshots) {
        if (snapshotSupport(required.itemId, snapshot).ok) {
          snapshotMatch = snapshot;
          break;
        }
      }
      if (snapshotMatch) {
        inventoryDispositions.push({
          itemId: required.itemId,
          kind: "satisfied_from_snapshot",
          snapshotReceiptId: snapshotMatch.receiptId,
          reason:
            required.itemId === "supplier_identity"
              ? "supplier identity is recorded on the anchored GRIN snapshot"
              : "receipt facts are recorded on the anchored GRIN snapshot",
        });
        continue;
      }
    }

    if (required.itemId === "commercial_document") {
      const referenced = originalSnapshots.some(snapshotHasInvoiceReference);
      const reason = referenced
        ? "invoice reference is not a retained invoice original"
        : "required commercial original is missing";
      missingOrUnverifiable.push(reason);
      inventoryDispositions.push({ itemId: required.itemId, kind: "missing", reason });
      continue;
    }

    const reason = `required item ${required.itemId} is missing`;
    missingOrUnverifiable.push(reason);
    inventoryDispositions.push({ itemId: required.itemId, kind: "missing", reason });
  }

  return {
    pinnedCuts,
    verifiedOriginals,
    artifactHashes,
    evidenceLinks,
    missingOrUnverifiable,
    inventoryDispositions,
    eventStreams,
    originalSnapshots,
    packPayloadKind: "manifest_and_hashes",
    originalBytesBundled: false,
  };
}
