import assert from "node:assert/strict";

import { buildAutoPaymentRequestNote } from "../businessEntry/paymentRequestNote";
import { parseINRInput } from "./inr";
import { formatINRInWords, formatINRWithWords } from "./inrWords";

assert.equal(formatINRInWords(200000), "Rupees Two Lakh Only");
assert.equal(formatINRInWords(205000), "Rupees Two Lakh Five Thousand Only");
assert.equal(formatINRInWords(200000.5), "Rupees Two Lakh and Fifty Paise Only");

const withWords = formatINRWithWords(200000);
assert(withWords.includes("₹2,00,000"), `expected figures in ${withWords}`);
assert(withWords.includes("Rupees Two Lakh Only"), `expected words in ${withWords}`);

const amount = parseINRInput("2,00,000");
assert(amount === 200000);
const note = buildAutoPaymentRequestNote({
  partyName: "Acme Traders",
  invoiceNumber: "SLFY2526/0014",
  pendingAmount: amount!,
});
assert(note.includes("₹2,00,000"), `note must contain figures: ${note}`);
assert(note.includes("Rupees Two Lakh Only"), `note must contain words: ${note}`);
assert(note.includes("Acme Traders"), `note must include party: ${note}`);
assert(!note.includes("0.2"), `note must not contain 0.2: ${note}`);

console.log("inrWords.test.ts: all cases passed");
