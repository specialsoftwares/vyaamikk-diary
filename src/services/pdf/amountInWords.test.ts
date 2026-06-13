import assert from "node:assert/strict";

import { amountInWordsForVoucher } from "./amountInWords";

assert.equal(amountInWordsForVoucher(0), "Rupees Zero Only");
assert.equal(amountInWordsForVoucher(-1), "");
assert.equal(amountInWordsForVoucher(NaN), "");
assert.equal(amountInWordsForVoucher(200000), "Rupees Two Lakh Only");
assert.equal(amountInWordsForVoucher(200000.5), "Rupees Two Lakh and Fifty Paise Only");
assert.equal(amountInWordsForVoucher(1.05), "Rupees One and Five Paise Only");

console.log("amountInWords.test.ts: all cases passed");
