/**
 * Letterhead diary-mirror billing policy — UNRESOLVED.
 *
 * Documented Option-C contract: `letterheadDocs` and `entries` are separately
 * billable. The existing create flow writes both (parent letterheadDocs CREATE
 * plus an `entries` CREATE with entryType `letterhead_matter`).
 *
 * This module records the decision surface. It must not be wired as a
 * production quota exemption based on entryType, source, or a client-provided
 * parent id.
 */

export const LETTERHEAD_MIRROR_POLICY_STATUS = "unresolved" as const;

/** Production must keep both creates billable until a single-slot policy is accepted. */
export const LETTERHEAD_MIRROR_QUOTA_EXEMPTION_ADOPTED = false;

export const LETTERHEAD_FULL_FLOW_BILLABLE_SLOTS = 2;

export type LetterheadSingleSlotProposal = {
  consumingDocument: "letterheadDocs";
  mirrorCollection: "entries";
  mirrorEntryType: "letterhead_matter";
  linkage: "same-UID deterministic letterheadDocumentId";
  secondMirror: "denied";
  conversionToArbitraryDiary: "denied";
};

export const LETTERHEAD_SINGLE_SLOT_PROPOSAL: LetterheadSingleSlotProposal = {
  consumingDocument: "letterheadDocs",
  mirrorCollection: "entries",
  mirrorEntryType: "letterhead_matter",
  linkage: "same-UID deterministic letterheadDocumentId",
  secondMirror: "denied",
  conversionToArbitraryDiary: "denied",
};
