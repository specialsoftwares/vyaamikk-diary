import assert from "node:assert/strict";

import {
  grinWithoutInvoice,
  gstr2bPurchaseWithoutGrin,
  isItcDetermined,
} from "./exceptions";

const at = "2026-09-28T12:00:00.000Z";

const missingGrin = gstr2bPurchaseWithoutGrin({
  evaluatedAtUtc: at,
  isGoodsPurchase: true,
  isServiceOrIsd: false,
  hasDirectDeliveryEvidence: false,
  importCoverage: "full",
  grinPresent: false,
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
assert.equal(openChallan.itcDisposition, "not_determined");

console.log("goodsEvidence/exceptions.test.ts: ok");
