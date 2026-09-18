/**
 * Letterhead diary-mirror billing policy — ADOPTED (Round 15).
 *
 * Parent `letterheadDocs` CREATE and its automatic `letterhead_matter`
 * diary mirror consume ZERO ordinary monthly quota. Ordinary diary,
 * purchase orders, Customer Credit and Professional Packs are unchanged.
 *
 * Mirror security is independent of quota: a client `entryType`, exemption
 * flag, supplied parent id, or deterministic id alone is not proof. Rules
 * require a pre-existing same-UID letterhead parent and the deterministic
 * mirror path.
 *
 * Historical two-slot production contract and the unadopted one-slot
 * proposal are retained below as historical evidence only.
 */

import { stableRecordId } from "@/services/records/stableRecordId";

import {
  LETTERHEAD_COMMERCIAL_POLICY_ID,
  LETTERHEAD_COMMERCIAL_POLICY_STATUS,
  letterheadCreatesConsumeOrdinaryQuota,
} from "./letterheadAccessPolicy";

export const LETTERHEAD_MIRROR_POLICY_STATUS = LETTERHEAD_COMMERCIAL_POLICY_STATUS;
export const LETTERHEAD_ZERO_QUOTA_ADOPTED = true;
export const LETTERHEAD_FULL_FLOW_BILLABLE_SLOTS = 0;
export const LETTERHEAD_HISTORICAL_REFUND_AUTHORIZED = false;
export const LETTERHEAD_PRODUCTION_BACKFILL_AUTHORIZED = false;

/** @deprecated Name kept so callers see the one-slot proposal was not adopted. Zero-quota is the adopted rule. */
export const LETTERHEAD_MIRROR_QUOTA_EXEMPTION_ADOPTED = true;

export const LETTERHEAD_MIRROR_ENTRY_TYPE = "letterhead_matter" as const;
export const LETTERHEAD_MIRROR_SOURCE = "letterhead" as const;
export const LETTERHEAD_MIRROR_ID_SUFFIX = ":matter" as const;

export const LETTERHEAD_MIRROR_PATH = {
  parentCollection: "letterheadDocs",
  parentIdRule: 'stableRecordId(letterheadClientRecordId, "lhd")',
  mirrorCollection: "entries",
  mirrorIdRule: 'stableRecordId(parentId + ":matter", "en")',
  firestorePath: "users/{uid}/entries/{deterministicMirrorId}",
} as const;

export function letterheadMirrorRecordId(parentId: string): string {
  const trimmed = parentId.trim();
  if (!trimmed) {
    throw new TypeError("letterhead parent id is required");
  }
  return stableRecordId(`${trimmed}${LETTERHEAD_MIRROR_ID_SUFFIX}`, "en");
}

export function letterheadParentIdFromMirrorRecordId(recordId: string): string | null {
  const suffix = LETTERHEAD_MIRROR_ID_SUFFIX;
  if (!recordId.endsWith(suffix)) return null;
  const parentId = recordId.slice(0, -suffix.length);
  return parentId.length > 0 ? parentId : null;
}

export const LETTERHEAD_MIRROR_PAYLOAD_KEYS = [
  "letterheadDocumentId",
  "subject",
  "reference",
  "body",
  "closing",
  "signerName",
  "designation",
  "place",
] as const;

export type LetterheadMirrorPayloadKey = (typeof LETTERHEAD_MIRROR_PAYLOAD_KEYS)[number];

const LETTERHEAD_MIRROR_PAYLOAD_KEY_SET = new Set<string>(LETTERHEAD_MIRROR_PAYLOAD_KEYS);

export function letterheadParentIdFromPayload(payload: unknown): string | null {
  if (payload == null || typeof payload !== "object") return null;
  const parentId = (payload as { letterheadDocumentId?: unknown }).letterheadDocumentId;
  if (typeof parentId !== "string") return null;
  const trimmed = parentId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isSupportedLetterheadMirrorPayload(payload: unknown): boolean {
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) return false;
  const keys = Object.keys(payload as Record<string, unknown>);
  if (keys.some((key) => !LETTERHEAD_MIRROR_PAYLOAD_KEY_SET.has(key))) return false;
  return letterheadParentIdFromPayload(payload) != null;
}

export function isSupportedLetterheadParentData(data: Record<string, unknown> | undefined | null): boolean {
  if (!data) return false;
  if (typeof data.userId !== "string" || data.userId.trim().length === 0) return false;
  if (typeof data.title !== "string" || data.title.trim().length === 0) return false;
  const input = data.input;
  return input != null && typeof input === "object" && !Array.isArray(input);
}

function isAbsentOrNull(value: unknown): boolean {
  return value == null;
}

export function isSupportedLetterheadMirrorCreateShape(input: {
  notes?: unknown;
  reminder?: unknown;
  attachments?: unknown;
  payload: unknown;
}): boolean {
  if (!isAbsentOrNull(input.notes)) return false;
  if (!isAbsentOrNull(input.reminder)) return false;
  if (Array.isArray(input.attachments) && input.attachments.length > 0) return false;
  return isSupportedLetterheadMirrorPayload(input.payload);
}

/** Deterministic new-create exemption. Legacy arbitrary IDs are not proof. */
export function isValidatedLetterheadMirrorInput(
  input: {
    entryType: string;
    source?: string | null;
    notes?: unknown;
    reminder?: unknown;
    attachments?: unknown;
    payload: unknown;
  },
  recordId: string
): boolean {
  if (input.entryType !== LETTERHEAD_MIRROR_ENTRY_TYPE) return false;
  if ((input.source ?? "composer") !== LETTERHEAD_MIRROR_SOURCE) return false;
  if (!isSupportedLetterheadMirrorCreateShape(input)) return false;
  const parentId = letterheadParentIdFromPayload(input.payload);
  if (!parentId) return false;
  return recordId === letterheadMirrorRecordId(parentId) && parentId !== recordId;
}

/** Existing-record recovery: UID, type, source, and parent linkage. ID may be legacy. */
export function isLegitimateExistingLetterheadMirror(
  entry: {
    userId?: string;
    entryType?: string;
    source?: string | null;
    payload?: unknown;
  },
  userId: string
): boolean {
  if (entry.userId !== userId) return false;
  if (entry.entryType !== LETTERHEAD_MIRROR_ENTRY_TYPE) return false;
  if (entry.source !== LETTERHEAD_MIRROR_SOURCE) return false;
  return letterheadParentIdFromPayload(entry.payload) != null;
}

export function isLegacyLetterheadMirrorForParent(
  entry: {
    entryType?: string;
    source?: string | null;
    payload?: unknown;
  },
  parentId: string
): boolean {
  if (entry.entryType !== LETTERHEAD_MIRROR_ENTRY_TYPE) return false;
  if (entry.source !== LETTERHEAD_MIRROR_SOURCE) return false;
  return letterheadParentIdFromPayload(entry.payload) === parentId;
}

export const LETTERHEAD_ADOPTED_MIRROR_POLICY = {
  status: LETTERHEAD_MIRROR_POLICY_STATUS,
  policyId: LETTERHEAD_COMMERCIAL_POLICY_ID,
  adopted: true,
  billableSlots: LETTERHEAD_FULL_FLOW_BILLABLE_SLOTS,
  consumesOrdinaryQuota: letterheadCreatesConsumeOrdinaryQuota(),
  parentCollection: "letterheadDocs",
  mirrorCollection: "entries",
  mirrorEntryType: LETTERHEAD_MIRROR_ENTRY_TYPE,
  mirrorPath: LETTERHEAD_MIRROR_PATH,
  parentRelationship: {
    sameUidRequired: true,
    deterministicIdInsufficient: true,
    parentMustExistBeforeMirrorBatch: true,
    parentMustExistInSameUid: true,
    parentShapeRequired: true,
    skeletalParentInsufficient: true,
    authoritativeLinkage:
      "server-validated parent document exists before the mirror CREATE, parent.userId == request.auth.uid, parent has title+input, mirror id == parentId + ':matter', and mirror.payload.letterheadDocumentId == parent id",
    clientProvidedParentId: "insufficient",
    clientEntryType: "insufficient",
    clientExemptionFlag: "denied",
    supportedPayloadKeys: LETTERHEAD_MIRROR_PAYLOAD_KEYS,
  },
  restrictions: {
    arbitraryDiaryContent: "denied_on_quota_free_path",
    secondMirrorForSameParent: "denied_at_deterministic_path; legacy arbitrary-id mirrors are left in place and not converted",
    conversionToArbitraryDiary: "denied",
    quotaExemptFlagOnClient: "denied",
  },
  deletion: {
    parentDeletedMirrorRemains: "orphan remains; no auto-delete; no quota refund",
    mirrorDeletedParentRemains: "parent remains; recreate mirror only at the deterministic path if the parent still exists",
    recreateParentAfterDelete: "new parent is a new letterhead CREATE; must not reuse a prior mirror as exemption proof",
  },
  existingArbitraryIdMirrors: {
    treatment: "preserved; no silent conversion; no production backfill; not a second quota-free create path",
    interruptedMigration: "leave existing documents; do not half-apply a new id",
  },
  rulesAccessBudget: {
    letterheadCreateGets: "static source estimate: isActiveUser get(users/uid)",
    mirrorCreateGets: "static source estimate: isActiveUser get(users/uid) + get(letterheadDocs/parentId)",
    estimateMethod: "static_source_count",
    measuredAtRuntime: false,
  },
  historicalQuotaRefund: LETTERHEAD_HISTORICAL_REFUND_AUTHORIZED,
  productionBackfill: LETTERHEAD_PRODUCTION_BACKFILL_AUTHORIZED,
} as const;

/** Historical Option-C contract: both documents consumed quota. Superseded. */
export const LETTERHEAD_HISTORICAL_TWO_SLOT_CONTRACT = {
  status: "superseded",
  billableSlots: 2,
  note: "letterheadDocs CREATE and the automatic diary mirror were separately billable",
} as const;

/**
 * Unadopted one-slot proposal. Retained as historical evidence. Round 15
 * did not adopt parent-consumes-one / mirror-exempt.
 */
export const LETTERHEAD_SINGLE_SLOT_MIRROR_PATH = LETTERHEAD_MIRROR_PATH;

export type LetterheadSingleSlotProposal = {
  status: "unadopted_superseded";
  adopted: false;
  consumingDocument: "letterheadDocs";
  parentConsumesOneSlot: true;
  mirrorCollection: "entries";
  mirrorEntryType: "letterhead_matter";
  mirrorPath: typeof LETTERHEAD_MIRROR_PATH;
  parentRelationship: {
    sameUidRequired: true;
    deterministicIdInsufficient: true;
    parentMustExistInSameUid: true;
    authoritativeLinkage: string;
    clientProvidedParentId: "denied";
  };
  historicalQuotaRefund: false;
};

export const LETTERHEAD_SINGLE_SLOT_PROPOSAL: LetterheadSingleSlotProposal = {
  status: "unadopted_superseded",
  adopted: false,
  consumingDocument: "letterheadDocs",
  parentConsumesOneSlot: true,
  mirrorCollection: "entries",
  mirrorEntryType: "letterhead_matter",
  mirrorPath: LETTERHEAD_SINGLE_SLOT_MIRROR_PATH,
  parentRelationship: {
    sameUidRequired: true,
    deterministicIdInsufficient: true,
    parentMustExistInSameUid: true,
    authoritativeLinkage:
      "server-validated parent document exists, parent.userId == request.auth.uid, and mirror.payload.letterheadDocumentId == parent.id",
    clientProvidedParentId: "denied",
  },
  historicalQuotaRefund: false,
};
