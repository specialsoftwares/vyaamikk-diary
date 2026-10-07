import assert from "node:assert/strict";

import {
  amountOrPartyMismatch,
  cancelledEwbLacksReasonOrReplacement,
  evaluateAllExceptionRules,
  ewbWithoutInvoiceOrBookEntry,
  grinOrInvoiceMissingFrom2b,
  grinWithoutInvoice,
  gstr2bPurchaseWithoutGrin,
  invoiceRequiresEwbNoneLinked,
  inwardEwbWithoutGrin,
  isItcDetermined,
  returnWithoutReturnEwbOrCreditNote,
  supplierLaterSuspendedOrCancelled,
  type GrinExceptionBundle,
} from "./exceptions";

const at = "2026-09-28T12:00:00.000Z";
const obs = {
  observedAtUtc: at,
  source: "manual assertion — not a live GST feed",
  sourceKind: "manual_assertion" as const,
};

const missingGrin = gstr2bPurchaseWithoutGrin({
  evaluatedAtUtc: at,
  isGoodsPurchase: true,
  isServiceOrIsd: false,
  hasDirectDeliveryEvidence: false,
  importCoverage: "full",
  grinPresent: false,
  observation: obs,
});
assert.equal(missingGrin.kind, "exception");
assert.equal(missingGrin.itcDisposition, "not_determined");
assert.equal(isItcDetermined(missingGrin), false);

const services = gstr2bPurchaseWithoutGrin({
  evaluatedAtUtc: at,
  isGoodsPurchase: false,
  isServiceOrIsd: true,
  hasDirectDeliveryEvidence: false,
  importCoverage: "full",
  grinPresent: false,
});
assert.equal(services.kind, "not_applicable");
assert.equal(services.itcDisposition, "not_determined");

const partialImport = gstr2bPurchaseWithoutGrin({
  evaluatedAtUtc: at,
  isGoodsPurchase: true,
  isServiceOrIsd: false,
  hasDirectDeliveryEvidence: false,
  importCoverage: "partial",
  grinPresent: false,
});
assert.equal(partialImport.kind, "unknown_incomplete_source");

const openChallan = grinWithoutInvoice({
  evaluatedAtUtc: at,
  invoiceLinked: false,
  challanLinked: true,
});
assert.equal(openChallan.kind, "exception");
assert.match(openChallan.explanation, /Capture still succeeded/);
assert.match(openChallan.explanation, /challan is not an invoice/i);
assert.equal(openChallan.itcDisposition, "not_determined");

const ewbOrphan = ewbWithoutInvoiceOrBookEntry({
  evaluatedAtUtc: at,
  ewbPresent: true,
  invoiceLinked: false,
  bookEntryPresent: false,
  observation: obs,
});
assert.equal(ewbOrphan.kind, "exception");
assert.equal(ewbOrphan.itcDisposition, "not_determined");

const ewbApplicabilityUnknown = invoiceRequiresEwbNoneLinked({
  evaluatedAtUtc: at,
  invoiceLinked: true,
  ewbLinked: false,
  ewbApplicability: "unknown",
  observation: obs,
});
assert.equal(ewbApplicabilityUnknown.kind, "unknown_incomplete_source");
assert.match(ewbApplicabilityUnknown.explanation, /does not invent a GST threshold/);

const inward = inwardEwbWithoutGrin({
  evaluatedAtUtc: at,
  inwardEwbPresent: true,
  grinPresent: false,
  observation: obs,
});
assert.equal(inward.kind, "exception");

const cancelledIncomplete = cancelledEwbLacksReasonOrReplacement({
  evaluatedAtUtc: at,
  ewbCancelled: true,
  cancellationEvidence: { reason: "" },
  observation: obs,
});
assert.equal(cancelledIncomplete.kind, "exception");

const mismatch = amountOrPartyMismatch({
  evaluatedAtUtc: at,
  partyMatch: false,
  amountMatch: true,
  grinParty: "A",
  otherParty: "B",
  observation: obs,
});
assert.equal(mismatch.kind, "exception");
assert.equal(mismatch.comparedValues.observedAtUtc, at);
assert.equal(mismatch.comparedValues.source, obs.source);

const missing2b = grinOrInvoiceMissingFrom2b({
  evaluatedAtUtc: at,
  isGstReportedGoodsPurchase: true,
  grinOrInvoicePresent: true,
  appearsIn2b: false,
  importCoverage: "full",
  observation: obs,
});
assert.equal(missing2b.kind, "exception");

const supplier = supplierLaterSuspendedOrCancelled({
  evaluatedAtUtc: at,
  status: "cancelled",
  observation: {
    observedAtUtc: at,
    source: "imported screenshot — not a live GST portal",
    sourceKind: "imported_document",
  },
});
assert.equal(supplier.kind, "exception");
assert.match(supplier.explanation, /live GST/);

const returnGap = returnWithoutReturnEwbOrCreditNote({
  evaluatedAtUtc: at,
  returnRecorded: true,
  returnEwbPresent: false,
  creditNotePresent: false,
  returnDocumentCoverage: "full",
  observation: obs,
});
assert.equal(returnGap.kind, "exception");

const incompleteSource = supplierLaterSuspendedOrCancelled({
  evaluatedAtUtc: at,
  status: "unknown",
  observation: { observedAtUtc: at, source: "", sourceKind: "unknown_incomplete" },
});
assert.equal(incompleteSource.kind, "unknown_incomplete_source");

const bundle: GrinExceptionBundle = {
  evaluatedAtUtc: at,
  observation: obs,
  ewbPresent: true,
  invoiceLinked: true,
  bookEntryPresent: true,
  ewbApplicability: "required",
  ewbLinked: true,
  inwardEwbPresent: true,
  grinPresent: true,
  challanLinked: false,
  ewbCancelled: false,
  cancellationEvidence: null,
  partyMatch: true,
  amountMatch: true,
  isGoodsPurchase: true,
  isServiceOrIsd: false,
  hasDirectDeliveryEvidence: false,
  importCoverage: "full",
  appearsIn2b: true,
  isGstReportedGoodsPurchase: true,
  grinOrInvoicePresent: true,
  supplierStatus: "active",
  returnRecorded: false,
  returnEwbPresent: false,
  creditNotePresent: false,
  returnDocumentCoverage: "none",
};
const all = evaluateAllExceptionRules(bundle);
assert.equal(all.length, 10);
assert.ok(all.every((item) => item.itcDisposition === "not_determined"));
assert.ok(all.every((item) => !isItcDetermined(item)));

console.log("goodsEvidence/exceptions.test.ts: ok");
