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
  isSupportedLetterheadMirrorPayload,
  isSupportedLetterheadMirrorPayloadPatch,
  isSupportedLetterheadParentData,
  isSupportedLetterheadParentInput,
  isValidatedLetterheadMirrorInput,
  letterheadAttachmentsIdentityEqual,
  letterheadMirrorRecordId,
  letterheadParentIdFromMirrorRecordId,
} from "./letterheadMirrorPolicy";

const savePath = path.join(import.meta.dirname, "saveWithPdf.ts");
const diaryAtomicPath = path.join(import.meta.dirname, "../diary/atomicCreate.ts");
const lhAtomicPath = path.join(import.meta.dirname, "atomicCreate.ts");
const docsFirebasePath = path.join(import.meta.dirname, "documents-firebase.ts");
const atomicBillablePath = path.join(import.meta.dirname, "../../billing/optionC/atomicBillableCreate.ts");
const createPath = path.join(import.meta.dirname, "../../../app/(app)/letterhead/create.tsx");
const saveSrc = fs.readFileSync(savePath, "utf8");
const diarySrc = fs.readFileSync(diaryAtomicPath, "utf8");
const lhSrc = fs.readFileSync(lhAtomicPath, "utf8");
const docsFirebaseSrc = fs.readFileSync(docsFirebasePath, "utf8");
const atomicBillableSrc = fs.readFileSync(atomicBillablePath, "utf8");
const createSrc = fs.readFileSync(createPath, "utf8");

assert.match(createSrc, /title:\s*""/);
assert.match(createSrc, /if \(!values\.subject\?\.trim\(\)\)/);
assert.match(createSrc, /const title = docInput\.title \|\| docInput\.subject/);
assert.doesNotMatch(createSrc, /if \(!values\.title\?\.trim\(\)\)/);

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
      payload: { letterheadDocumentId: "lh_flow", body: "Letter text" },
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
    "lh_flow:matter"
  ),
  false,
  "mirror CREATE requires letter body text"
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
  isValidatedLetterheadMirrorInput(
    {
      entryType: "letterhead_matter",
      source: "letterhead",
      payload: { letterheadDocumentId: "lh_flow", workDone: "nope" },
    },
    "lh_flow:matter"
  ),
  false,
  "unrelated payload keys are not a supported mirror create"
);
assert.equal(
  isValidatedLetterheadMirrorInput(
    {
      entryType: "letterhead_matter",
      source: "letterhead",
      notes: "diary note",
      payload: { letterheadDocumentId: "lh_flow" },
    },
    "lh_flow:matter"
  ),
  false
);
assert.equal(LETTERHEAD_ADOPTED_MIRROR_POLICY.rulesAccessBudget.measuredAtRuntime, false);
assert.equal(LETTERHEAD_ADOPTED_MIRROR_POLICY.rulesAccessBudget.estimateMethod, "static_source_count");
assert.equal(LETTERHEAD_ADOPTED_MIRROR_POLICY.parentRelationship.skeletalParentInsufficient, true);
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
assert.equal(diarySrc.includes("parseExisting"), true);
assert.equal(diarySrc.includes("letterhead_mirror_unvalidated"), true);
assert.match(diarySrc, /buildNew:[\s\S]*letterhead_mirror_unvalidated/);
assert.doesNotMatch(
  diarySrc.slice(0, diarySrc.indexOf("parseExisting")),
  /letterhead_mirror_unvalidated/
);
assert.equal(saveSrc.includes("captureAdmissionToken"), true);
assert.equal(saveSrc.includes("issuesRemoteWork: false"), true);
assert.equal(saveSrc.includes("SAVE_STEP.PDF_URI_SAVED"), true);
assert.match(saveSrc, /repo\.create\(\s*userId,[\s\S]*?\},\s*session\s*\)/);
assert.match(saveSrc, /repo\.update\(\s*userId,\s*doc\.id,\s*\{\s*pdfUri,\s*saved:\s*true\s*\},\s*session\s*\)/);
assert.match(saveSrc, /diaryRepo\.create\(\s*userId,[\s\S]*?\},\s*session\s*\)/);
assert.match(docsFirebaseSrc, /assertDispatchedSession\(session, userId\)/);
assert.match(docsFirebaseSrc, /letterheadDocToCloudStorage\(next\)/);
assert.match(atomicBillableSrc, /assertDispatchedSession\(hooks\.session, userId\)/);
assert.match(atomicBillableSrc, /SaveRetryableError/);
assert.equal(docsFirebaseSrc.includes("pdfUri: null") || docsFirebaseSrc.includes("letterheadDocToCloudStorage"), true);

const validParentInput = {
  title: "Notice",
  date: 1_700_000_000_000,
  subject: "Subject",
  body: "Body of the letter.",
  closing: "Yours faithfully",
  name: "Owner",
  designation: "Proprietor",
  place: "Delhi",
  reference: null,
  salutation: null,
  useSignature: false,
};
assert.equal(isSupportedLetterheadParentInput(validParentInput), true);
assert.equal(isSupportedLetterheadParentInput({}), false, "empty parent input is not supported");

const formBlankTitleInput = {
  title: "",
  date: 1_700_000_000_000,
  reference: "",
  recipientName: "",
  recipientDesignation: "",
  recipientCompany: "",
  recipientAddress: "",
  subject: "Subject of the letter",
  salutation: "Dear Sir/Madam,",
  body: "Body of the letter.",
  closing: "Yours faithfully,",
  name: "Owner",
  designation: "",
  place: "",
  useSignature: false,
  useStamp: false,
};
assert.equal(
  isSupportedLetterheadParentInput(formBlankTitleInput),
  true,
  "blank form title is supported when subject/body/sender are present"
);
assert.equal(
  isSupportedLetterheadParentData({
    userId: "uid",
    title: formBlankTitleInput.subject,
    input: formBlankTitleInput,
  }),
  true,
  "resolved document title may come from subject"
);
assert.equal(
  isSupportedLetterheadParentData({
    userId: "uid",
    title: "",
    input: formBlankTitleInput,
  }),
  false,
  "resolved document title remains required"
);
assert.equal(
  isSupportedLetterheadParentInput({ ...formBlankTitleInput, subject: "" }),
  false,
  "blank subject is not a valid letter"
);
assert.equal(
  isSupportedLetterheadParentInput({ ...formBlankTitleInput, body: "" }),
  false,
  "blank body is not a valid letter"
);
assert.equal(
  isSupportedLetterheadParentInput({ ...formBlankTitleInput, title: { text: "obj" } }),
  false,
  "object title is not a form string"
);
assert.equal(
  isSupportedLetterheadParentInput({ ...validParentInput, title: "Notice" }),
  true,
  "explicit title remains supported"
);
assert.equal(
  isSupportedLetterheadParentInput({ ...validParentInput, body: { amount: 5000 } }),
  false,
  "object body is not letter text"
);
assert.equal(isSupportedLetterheadParentInput({ ...validParentInput, date: "today" }), false);
assert.equal(
  isSupportedLetterheadParentData({ userId: "uid", title: "Parent", input: {} }),
  false
);
assert.equal(
  isSupportedLetterheadParentData({ userId: "uid", title: "Parent", input: validParentInput }),
  true
);
assert.equal(
  isSupportedLetterheadMirrorPayload({
    letterheadDocumentId: "lh_flow",
    body: { amount: 5000, workDone: "not letter text" },
  }),
  false
);
assert.equal(
  isSupportedLetterheadMirrorPayload({ letterheadDocumentId: "lh_flow", body: "Letter text" }),
  true
);
assert.equal(
  isSupportedLetterheadMirrorPayloadPatch(
    { letterheadDocumentId: "lh_flow", body: "kept", workDone: "old" },
    { letterheadDocumentId: "lh_flow", body: "kept", workDone: "new" }
  ),
  false,
  "existing unsupported payload values cannot change"
);
assert.equal(
  isSupportedLetterheadMirrorPayloadPatch(
    { letterheadDocumentId: "lh_flow", body: "kept", workDone: "old" },
    { letterheadDocumentId: "lh_flow", body: "revised letter", workDone: "old" }
  ),
  true
);
assert.equal(
  letterheadAttachmentsIdentityEqual(
    [{ id: "a", uri: "file://a", mimeType: "image/jpeg", name: "a.jpg" }],
    [{ id: "b", uri: "file://b", mimeType: "image/jpeg", name: "b.jpg" }]
  ),
  false
);

console.log("letterheadMirrorPolicy.test.ts: ok (zero-quota adopted; one-slot remains historical)");
