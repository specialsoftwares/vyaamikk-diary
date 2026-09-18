import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  LETTERHEAD_ADOPTED_MIRROR_POLICY,
  LETTERHEAD_FULL_FLOW_BILLABLE_SLOTS,
  LETTERHEAD_HISTORICAL_TWO_SLOT_CONTRACT,
  LETTERHEAD_MIRROR_POLICY_STATUS,
  LETTERHEAD_MIRROR_QUOTA_EXEMPTION_ADOPTED,
  LETTERHEAD_SINGLE_SLOT_MIRROR_PATH,
  LETTERHEAD_SINGLE_SLOT_PROPOSAL,
  LETTERHEAD_ZERO_QUOTA_ADOPTED,
  isLegacyLetterheadMirrorForParent,
  isValidatedLetterheadMirrorInput,
  letterheadMirrorRecordId,
  letterheadParentIdFromMirrorRecordId,
} from "./letterheadMirrorPolicy";

const savePath = path.join(import.meta.dirname, "saveWithPdf.ts");
const diaryAtomicPath = path.join(import.meta.dirname, "../diary/atomicCreate.ts");
const lhAtomicPath = path.join(import.meta.dirname, "atomicCreate.ts");
const saveSrc = fs.readFileSync(savePath, "utf8");
const diarySrc = fs.readFileSync(diaryAtomicPath, "utf8");
const lhSrc = fs.readFileSync(lhAtomicPath, "utf8");

assert.equal(LETTERHEAD_MIRROR_POLICY_STATUS, "adopted");
assert.equal(LETTERHEAD_ZERO_QUOTA_ADOPTED, true);
assert.equal(LETTERHEAD_FULL_FLOW_BILLABLE_SLOTS, 0);
assert.equal(LETTERHEAD_MIRROR_QUOTA_EXEMPTION_ADOPTED, true);
assert.equal(LETTERHEAD_ADOPTED_MIRROR_POLICY.consumesOrdinaryQuota, false);
assert.equal(LETTERHEAD_ADOPTED_MIRROR_POLICY.historicalQuotaRefund, false);
assert.equal(LETTERHEAD_ADOPTED_MIRROR_POLICY.productionBackfill, false);
assert.equal(LETTERHEAD_ADOPTED_MIRROR_POLICY.parentRelationship.deterministicIdInsufficient, true);
assert.equal(LETTERHEAD_ADOPTED_MIRROR_POLICY.parentRelationship.clientExemptionFlag, "denied");
assert.equal(LETTERHEAD_HISTORICAL_TWO_SLOT_CONTRACT.status, "superseded");
assert.equal(LETTERHEAD_HISTORICAL_TWO_SLOT_CONTRACT.billableSlots, 2);
assert.equal(LETTERHEAD_SINGLE_SLOT_PROPOSAL.adopted, false);
assert.equal(LETTERHEAD_SINGLE_SLOT_PROPOSAL.status, "unadopted_superseded");
assert.equal(LETTERHEAD_SINGLE_SLOT_PROPOSAL.parentConsumesOneSlot, true);
assert.equal(LETTERHEAD_SINGLE_SLOT_MIRROR_PATH.mirrorCollection, "entries");

assert.equal(letterheadMirrorRecordId("lh_flow"), "lh_flow:matter");
assert.equal(letterheadParentIdFromMirrorRecordId("lh_flow:matter"), "lh_flow");
assert.equal(letterheadParentIdFromMirrorRecordId("lh_flow_matter"), null);

assert.equal(
  isValidatedLetterheadMirrorInput(
    {
      entryType: "letterhead_matter",
      source: "letterhead",
      payload: { letterheadDocumentId: "lh_flow" },
    },
    "lh_flow:matter"
  ),
  true
);
assert.equal(
  isValidatedLetterheadMirrorInput(
    {
      entryType: "letterhead_matter",
      source: "letterhead",
      payload: { letterheadDocumentId: "lh_flow" },
    },
    "lh_flow_matter"
  ),
  false,
  "supplied parent id + arbitrary id is not proof"
);
assert.equal(
  isValidatedLetterheadMirrorInput(
    {
      entryType: "letterhead_matter",
      source: "composer",
      payload: { letterheadDocumentId: "lh_flow" },
    },
    "lh_flow:matter"
  ),
  false
);
assert.equal(
  isValidatedLetterheadMirrorInput(
    {
      entryType: "work_update_issue",
      source: "letterhead",
      payload: { letterheadDocumentId: "lh_flow" },
    },
    "lh_flow:matter"
  ),
  false
);
assert.equal(
  isLegacyLetterheadMirrorForParent(
    {
      entryType: "letterhead_matter",
      source: "letterhead",
      payload: { letterheadDocumentId: "lh_flow" },
    },
    "lh_flow"
  ),
  true
);

assert.equal(saveSrc.includes("quotaExempt"), false);
assert.equal(saveSrc.includes("skipQuota"), false);
assert.equal(saveSrc.includes("letterheadMirrorRecordId"), true);
assert.equal(saveSrc.includes('entryType: "letterhead_matter"'), true);
assert.equal(lhSrc.includes('quotaConsumption: "none"'), true);
assert.equal(diarySrc.includes("isValidatedLetterheadMirrorInput"), true);

console.log("letterheadMirrorPolicy.test.ts: ok (zero-quota adopted; one-slot remains historical)");
