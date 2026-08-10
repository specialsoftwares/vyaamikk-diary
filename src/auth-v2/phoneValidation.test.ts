import assert from "node:assert/strict";

import {
  acceptLocalMobileInput,
  containsNonAsciiDigits,
  extractIndianLocalDigits,
  ingestIndianMobileFieldInput,
  isPhoneContinueEnabled,
  isValidIndianLocalMobile,
  toE164FromDraft,
} from "./phoneValidation";

assert.equal(isValidIndianLocalMobile("9876543210"), true);
assert.equal(isValidIndianLocalMobile("5876543210"), false);
assert.equal(isValidIndianLocalMobile("0987654321"), false);
assert.equal(isValidIndianLocalMobile("987654321"), false);

// Manual typing
assert.equal(acceptLocalMobileInput("9876543210"), "9876543210");
assert.equal(acceptLocalMobileInput("98765"), "98765");
assert.equal(acceptLocalMobileInput(""), "");

// Gboard / Android Autofill / paste shapes — must populate, not silent-reject
assert.equal(acceptLocalMobileInput("+919876543210"), "9876543210");
assert.equal(acceptLocalMobileInput("919876543210"), "9876543210");
assert.equal(acceptLocalMobileInput("91 98765 43210"), "9876543210");
assert.equal(acceptLocalMobileInput("+91 98765-43210"), "9876543210");
assert.equal(acceptLocalMobileInput("09876543210"), "9876543210");
assert.equal(acceptLocalMobileInput("(98765) 43210"), "9876543210");

const gboard = ingestIndianMobileFieldInput("+919716332674");
assert.equal(gboard.status, "complete");
if (gboard.status === "complete") {
  assert.equal(gboard.localDigits, "9716332674");
  assert.equal(gboard.e164, "+919716332674");
}

assert.equal(extractIndianLocalDigits("919716332674"), "9716332674");
assert.equal(extractIndianLocalDigits("9716332674"), "9716332674");

// Invalid
assert.equal(acceptLocalMobileInput("abcdefghij"), null);
assert.equal(containsNonAsciiDigits("९८७६५४३२१०"), true);
assert.equal(ingestIndianMobileFieldInput("९८७६५४३२१०").status, "rejected");

assert.equal(toE164FromDraft("+91", "9876543210"), "+919876543210");
// No double country code
assert.equal(toE164FromDraft("+91", "9876543210"), "+919876543210");
assert.ok(!toE164FromDraft("+91", "9876543210").startsWith("+9191"));

let threw = false;
try {
  toE164FromDraft("+91", "0876543210");
} catch {
  threw = true;
}
assert.equal(threw, true);

assert.equal(
  isPhoneContinueEnabled({ valid: true, online: true, loading: false }),
  true,
  "valid 10-digit number enables Continue immediately"
);
assert.equal(isPhoneContinueEnabled({ valid: false, online: true, loading: false }), false);

console.log("phoneValidation.test.ts: ok");
