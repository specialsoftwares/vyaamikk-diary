import assert from "node:assert/strict";

import {
  formatReceiverMobileForPdf,
  normalizeReceiverMobile,
  validateReceiverMobile,
} from "./receiverMobile";

assert.equal(normalizeReceiverMobile("9876543210"), "+919876543210");
assert.equal(normalizeReceiverMobile("919876543210"), "+919876543210");
assert.equal(normalizeReceiverMobile("+919876543210"), "+919876543210");
assert.equal(normalizeReceiverMobile("09876543210"), null);
assert.equal(normalizeReceiverMobile("5876543210"), null);
assert.equal(normalizeReceiverMobile(""), null);
assert.equal(normalizeReceiverMobile(null), null);

assert.equal(validateReceiverMobile("9876543210"), null);
assert.equal(validateReceiverMobile(""), "required");
assert.equal(validateReceiverMobile("123"), "invalid");

assert.equal(formatReceiverMobileForPdf("+919876543210"), "+91 98 7654 3210");
assert.equal(formatReceiverMobileForPdf("9876543210"), "+91 98 7654 3210");

console.log("receiverMobile.test.ts: all assertions passed");
