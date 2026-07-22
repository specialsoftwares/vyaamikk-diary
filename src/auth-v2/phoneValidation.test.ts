import assert from "node:assert/strict";

import {
  acceptLocalMobileInput,
  containsNonAsciiDigits,
  isValidIndianLocalMobile,
  toE164FromDraft,
} from "./phoneValidation";

assert.equal(isValidIndianLocalMobile("9876543210"), true);
assert.equal(isValidIndianLocalMobile("5876543210"), false);
assert.equal(isValidIndianLocalMobile("0987654321"), false);
assert.equal(isValidIndianLocalMobile("987654321"), false);

assert.equal(acceptLocalMobileInput("9876543210"), "9876543210");
assert.equal(acceptLocalMobileInput("98765"), "98765");
assert.equal(acceptLocalMobileInput("+919876543210"), null);
assert.equal(acceptLocalMobileInput("09876543210"), null);
assert.equal(acceptLocalMobileInput("98765 43210"), null);
assert.equal(acceptLocalMobileInput("98765-43210"), null);
assert.equal(acceptLocalMobileInput("abcdefghij"), null);
assert.equal(containsNonAsciiDigits("९८७६५४३२१०"), true);

assert.equal(toE164FromDraft("+91", "9876543210"), "+919876543210");
let threw = false;
try {
  toE164FromDraft("+91", "0876543210");
} catch {
  threw = true;
}
assert.equal(threw, true);

console.log("phoneValidation.test.ts: ok");
