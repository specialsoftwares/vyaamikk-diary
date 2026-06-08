import assert from "node:assert/strict";

import { formatINR, parseINRInput } from "./inr";

function expectParse(input: string | number, expected: number | null) {
  const got = parseINRInput(input);
  assert.equal(
    got,
    expected,
    `parseINRInput(${JSON.stringify(input)}) expected ${expected}, got ${got}`
  );
}

function expectFormat(amount: number, expected: string) {
  const got = formatINR(amount);
  assert.equal(got, expected, `formatINR(${amount}) expected ${expected}, got ${got}`);
}

expectParse("200000", 200000);
expectParse("2,00,000", 200000);
expectParse("₹2,00,000", 200000);
expectParse("200000.50", 200000.5);
expectParse(200000, 200000);
expectParse("0", null);
expectParse("-500", null);
expectParse("abc", null);
expectParse("", null);

expectFormat(200000, "₹2,00,000");
expectFormat(200000.5, "₹2,00,000.5");

const noteAmount = parseINRInput("2,00,000");
assert(noteAmount === 200000);
const note = `This is a payment request against Invoice/Bill No. SLFY2526/0014 for the pending amount of ${formatINR(noteAmount!)}.`;
assert(
  note.includes("₹2,00,000"),
  `note must contain ₹2,00,000, got: ${note}`
);
assert(!note.includes("0.2"), `note must not contain 0.2, got: ${note}`);

console.log("inr.test.ts: all cases passed");
