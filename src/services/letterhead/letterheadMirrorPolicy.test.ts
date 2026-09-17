import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  LETTERHEAD_FULL_FLOW_BILLABLE_SLOTS,
  LETTERHEAD_MIRROR_POLICY_STATUS,
  LETTERHEAD_MIRROR_QUOTA_EXEMPTION_ADOPTED,
  LETTERHEAD_SINGLE_SLOT_PROPOSAL,
} from "./letterheadMirrorPolicy";

const savePath = path.join(import.meta.dirname, "saveWithPdf.ts");
const diaryAtomicPath = path.join(import.meta.dirname, "../diary/atomicCreate.ts");
const lhAtomicPath = path.join(import.meta.dirname, "atomicCreate.ts");
const saveSrc = fs.readFileSync(savePath, "utf8");
const diarySrc = fs.readFileSync(diaryAtomicPath, "utf8");
const lhSrc = fs.readFileSync(lhAtomicPath, "utf8");

assert.equal(LETTERHEAD_MIRROR_POLICY_STATUS, "unresolved");
assert.equal(LETTERHEAD_MIRROR_QUOTA_EXEMPTION_ADOPTED, false);
assert.equal(LETTERHEAD_FULL_FLOW_BILLABLE_SLOTS, 2);
assert.equal(LETTERHEAD_SINGLE_SLOT_PROPOSAL.consumingDocument, "letterheadDocs");
assert.equal(LETTERHEAD_SINGLE_SLOT_PROPOSAL.mirrorEntryType, "letterhead_matter");

assert.equal(saveSrc.includes("quotaExempt"), false);
assert.equal(saveSrc.includes("skipQuota"), false);
assert.equal(saveSrc.includes('entryType: "letterhead_matter"'), true);
assert.equal(saveSrc.includes("getDiaryRepository().create"), true);
assert.equal(lhSrc.includes('collection: "letterheadDocs"'), true);
assert.equal(diarySrc.includes('collection: "entries"'), true);
assert.equal(diarySrc.includes("quotaExempt"), false);

console.log("letterheadMirrorPolicy.test.ts: ok (exemption not adopted)");
