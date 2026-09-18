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

/**
 * `title` is a required key on the form payload and may be the blank string
 * the create screen defaults to. Document title is resolved separately
 * (`input.title || input.subject`) and must be nonempty.
 */
export const LETTERHEAD_PARENT_INPUT_REQUIRED_KEYS = [
  "title",
  "date",
  "subject",
  "body",
  "closing",
  "name",
  "designation",
  "place",
] as const;

export const LETTERHEAD_PARENT_INPUT_OPTIONAL_KEYS = [
  "reference",
  "recipientName",
  "recipientDesignation",
  "recipientCompany",
  "recipientAddress",
  "salutation",
  "useSignature",
  "useStamp",
] as const;

const LETTERHEAD_PARENT_INPUT_KEY_SET = new Set<string>([
  ...LETTERHEAD_PARENT_INPUT_REQUIRED_KEYS,
  ...LETTERHEAD_PARENT_INPUT_OPTIONAL_KEYS,
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Form title: present string, including the supported blank default. */
function isSupportedLetterheadFormTitle(value: unknown): value is string {
  return typeof value === "string" && value.length <= 200;
}

function isOptionalLetterString(value: unknown): boolean {
  return value == null || typeof value === "string";
}

function isOptionalLetterBool(value: unknown): boolean {
  return value == null || typeof value === "boolean";
}

function isLetterDate(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);
}

export function letterheadParentIdFromPayload(payload: unknown): string | null {
  if (!isPlainObject(payload)) return null;
  const parentId = payload.letterheadDocumentId;
  if (typeof parentId !== "string") return null;
  const trimmed = parentId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isSupportedMirrorPayloadValue(key: string, value: unknown): boolean {
  if (key === "letterheadDocumentId") return isNonEmptyString(value);
  if (key === "body") return typeof value === "string" && value.length > 0 && !Array.isArray(value);
  return isOptionalLetterString(value);
}

export function isSupportedLetterheadMirrorPayload(payload: unknown): boolean {
  if (!isPlainObject(payload)) return false;
  const keys = Object.keys(payload);
  if (keys.some((key) => !LETTERHEAD_MIRROR_PAYLOAD_KEY_SET.has(key))) return false;
  if (!keys.includes("letterheadDocumentId") || !keys.includes("body")) return false;
  return keys.every((key) => isSupportedMirrorPayloadValue(key, payload[key]));
}

export function isSupportedLetterheadMirrorPayloadPatch(
  before: unknown,
  after: unknown
): boolean {
  if (!isPlainObject(before) || !isPlainObject(after)) return false;
  if (letterheadParentIdFromPayload(after) !== letterheadParentIdFromPayload(before)) return false;
  for (const key of Object.keys(after)) {
    if (stableJson(before[key]) === stableJson(after[key])) continue;
    if (!LETTERHEAD_MIRROR_PAYLOAD_KEY_SET.has(key)) return false;
    if (!isSupportedMirrorPayloadValue(key, after[key])) return false;
  }
  for (const key of Object.keys(before)) {
    if (LETTERHEAD_MIRROR_PAYLOAD_KEY_SET.has(key)) continue;
    if (!(key in after) || stableJson(before[key]) !== stableJson(after[key])) return false;
  }
  return true;
}

export function letterheadAttachmentsIdentityEqual(a: unknown, b: unknown): boolean {
  return stableJson(a ?? []) === stableJson(b ?? []);
}

function stableJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "\u0000";
  }
}

export function isSupportedLetterheadParentInput(input: unknown): boolean {
  if (!isPlainObject(input)) return false;
  const keys = Object.keys(input);
  if (LETTERHEAD_PARENT_INPUT_REQUIRED_KEYS.some((key) => !keys.includes(key))) return false;
  if (keys.some((key) => !LETTERHEAD_PARENT_INPUT_KEY_SET.has(key))) return false;
  if (!isSupportedLetterheadFormTitle(input.title)) return false;
  if (!isLetterDate(input.date)) return false;
  if (!isNonEmptyString(input.subject)) return false;
  if (typeof input.body !== "string" || input.body.length === 0) return false;
  if (typeof input.closing !== "string") return false;
  if (typeof input.name !== "string") return false;
  if (typeof input.designation !== "string") return false;
  if (typeof input.place !== "string") return false;
  if (!isOptionalLetterString(input.reference)) return false;
  if (!isOptionalLetterString(input.recipientName)) return false;
  if (!isOptionalLetterString(input.recipientDesignation)) return false;
  if (!isOptionalLetterString(input.recipientCompany)) return false;
  if (!isOptionalLetterString(input.recipientAddress)) return false;
  if (!isOptionalLetterString(input.salutation)) return false;
  if (!isOptionalLetterBool(input.useSignature)) return false;
  if (!isOptionalLetterBool(input.useStamp)) return false;
  return true;
}

export function isSupportedLetterheadParentData(data: Record<string, unknown> | undefined | null): boolean {
  if (!data) return false;
  if (typeof data.userId !== "string" || data.userId.trim().length === 0) return false;
  if (typeof data.title !== "string" || data.title.trim().length === 0) return false;
  return isSupportedLetterheadParentInput(data.input);
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
