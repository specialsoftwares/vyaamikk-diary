/**
 * Letterhead diary-mirror billing policy — UNRESOLVED / NOT ADOPTED.
 *
 * Documented Option-C contract in production: `letterheadDocs` and `entries`
 * are separately billable. The create flow writes both (parent letterheadDocs
 * CREATE plus an `entries` CREATE with entryType `letterhead_matter`).
 *
 * This module is a reviewable proposal only. It must not be wired as a
 * production quota exemption based on entryType, source, a client-provided
 * parent id, or a deterministic document id. A deterministic id alone does
 * not establish a trusted parent/mirror relationship.
 */

export const LETTERHEAD_MIRROR_POLICY_STATUS = "unresolved" as const;

/** Production must keep both creates billable until a single-slot policy is accepted. */
export const LETTERHEAD_MIRROR_QUOTA_EXEMPTION_ADOPTED = false;

export const LETTERHEAD_FULL_FLOW_BILLABLE_SLOTS = 2;

/**
 * Exact mirror path the proposal would require. Not implemented.
 * Parent id is `stableRecordId(letterheadClientRecordId, "lhd")` today;
 * the diary create currently uses a caller-supplied `diaryClientId`, which
 * is not the same as a trusted same-UID deterministic mirror path.
 */
export const LETTERHEAD_SINGLE_SLOT_MIRROR_PATH = {
  parentCollection: "letterheadDocs",
  parentIdRule: 'stableRecordId(letterheadClientRecordId, "lhd")',
  mirrorCollection: "entries",
  mirrorIdRule: 'stableRecordId(parentId + ":matter", "en")',
  firestorePath: "users/{uid}/entries/{deterministicMirrorId}",
} as const;

export type LetterheadSingleSlotProposal = {
  status: "proposal_only";
  adopted: false;
  consumingDocument: "letterheadDocs";
  parentConsumesOneSlot: true;
  mirrorCollection: "entries";
  mirrorEntryType: "letterhead_matter";
  mirrorPath: typeof LETTERHEAD_SINGLE_SLOT_MIRROR_PATH;
  parentRelationship: {
    sameUidRequired: true;
    /** Deterministic id is necessary but not sufficient. */
    deterministicIdInsufficient: true;
    parentMustExistInSameUid: true;
    authoritativeLinkage:
      "server-validated parent document exists, parent.userId == request.auth.uid, and mirror.payload.letterheadDocumentId == parent.id";
    clientProvidedParentId: "denied";
  };
  allowedMirrorFields: readonly [
    "entryType",
    "title",
    "entryDate",
    "source",
    "payload.letterheadDocumentId",
    "payload.subject",
    "payload.reference",
    "payload.body",
    "payload.closing",
    "payload.signerName",
    "payload.designation",
    "payload.place",
    "location",
  ];
  restrictions: {
    arbitraryDiaryContent: "denied";
    secondMirrorForSameParent: "denied";
    conversionToArbitraryDiary: "denied";
    quotaExemptFlagOnClient: "denied";
  };
  deletion: {
    parentDeletedMirrorRemains: "orphan remains billable; no auto-delete; no quota refund";
    mirrorDeletedParentRemains: "parent remains the consuming document; recreate mirror only if parent still exists and no other mirror exists";
    recreateParentAfterDelete: "new parent is a new billable CREATE; must not reuse a prior mirror as exemption proof";
  };
  existingArbitraryIdMirrors: {
    treatment: "remain two-slot billable; no silent conversion; no production backfill";
    interruptedMigration: "leave both documents billable; do not half-apply exemption";
  };
  rulesAccessBudget: {
    currentOptionCCreateReads: "status + usageCurrent + record + optional serial counter";
    proposedExtraReads:
      "parent GET + same-UID parent.userId check + mirror uniqueness GET at deterministic path (must be measured before adoption; not assumed free)";
    measured: false;
  };
  historicalQuotaRefund: false;
};

export const LETTERHEAD_SINGLE_SLOT_PROPOSAL: LetterheadSingleSlotProposal = {
  status: "proposal_only",
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
  allowedMirrorFields: [
    "entryType",
    "title",
    "entryDate",
    "source",
    "payload.letterheadDocumentId",
    "payload.subject",
    "payload.reference",
    "payload.body",
    "payload.closing",
    "payload.signerName",
    "payload.designation",
    "payload.place",
    "location",
  ],
  restrictions: {
    arbitraryDiaryContent: "denied",
    secondMirrorForSameParent: "denied",
    conversionToArbitraryDiary: "denied",
    quotaExemptFlagOnClient: "denied",
  },
  deletion: {
    parentDeletedMirrorRemains: "orphan remains billable; no auto-delete; no quota refund",
    mirrorDeletedParentRemains:
      "parent remains the consuming document; recreate mirror only if parent still exists and no other mirror exists",
    recreateParentAfterDelete:
      "new parent is a new billable CREATE; must not reuse a prior mirror as exemption proof",
  },
  existingArbitraryIdMirrors: {
    treatment: "remain two-slot billable; no silent conversion; no production backfill",
    interruptedMigration: "leave both documents billable; do not half-apply exemption",
  },
  rulesAccessBudget: {
    currentOptionCCreateReads: "status + usageCurrent + record + optional serial counter",
    proposedExtraReads:
      "parent GET + same-UID parent.userId check + mirror uniqueness GET at deterministic path (must be measured before adoption; not assumed free)",
    measured: false,
  },
  historicalQuotaRefund: false,
};
