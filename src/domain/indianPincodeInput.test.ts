import assert from "node:assert/strict";

import {
  INDIAN_PIN_REGEX,
  isValidIndianPincode,
  normalizeIndianPinInput,
} from "./indianPincodeInput";

assert.equal(normalizeIndianPinInput(" 201301 "), "201301");
assert.equal(normalizeIndianPinInput("20 13 01"), "201301");
assert.equal(isValidIndianPincode("201301"), true);
assert.equal(isValidIndianPincode("001234"), false);
assert.equal(isValidIndianPincode("20130"), false);
assert.ok(INDIAN_PIN_REGEX.test("201301"));
assert.ok(!INDIAN_PIN_REGEX.test("001234"));

console.log("indianPincodeInput.test.ts: ok");
