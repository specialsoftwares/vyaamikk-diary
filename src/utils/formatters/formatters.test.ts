import assert from "node:assert/strict";

import { formatAmount, formatAmountDisplay } from "./formatAmount";
import { formatNumber } from "./formatNumber";
import { formatEntryDate, formatShortDate } from "./formatDate";
import { formatTime } from "./formatTime";
import { pdfLabel } from "@/services/pdf/pdfLabels";
import { inrWordsLocaleFromLang } from "@/utils/money/inrWords";

const SAMPLE_MS = new Date(2026, 5, 4, 15, 30).getTime();

function assertWesternDigits(text: string) {
  assert.ok(!/[०-९०-౯௦-௯૦-૯]/.test(text), `native digits found in: ${text}`);
}

function run() {
  for (const lang of ["en", "hi", "ta", "te", "gu"]) {
    assert.equal(inrWordsLocaleFromLang(lang), "en-IN", `inr locale for ${lang}`);
    const amount = formatAmount(200000.5);
    assertWesternDigits(amount);
    assert.match(amount, /₹2,00,000\.5/);
    const num = formatNumber(1234567);
    assertWesternDigits(num);
    assert.match(num, /12,34,567/);
    const date = formatEntryDate(SAMPLE_MS);
    assertWesternDigits(date);
    assert.match(date, /4 Jun 2026/);
    const short = formatShortDate(SAMPLE_MS);
    assertWesternDigits(short);
    const time = formatTime(SAMPLE_MS);
    assertWesternDigits(time);
    assert.match(time, /3:30 PM/);
  }

  assert.equal(pdfLabel("date", { englishOnly: true }), "Date");
  assert.equal(pdfLabel("date", { uiLang: "gu" }), "તારીખ");
  assert.equal(pdfLabel("date", { uiLang: "hi" }), "Date");
  assert.equal(pdfLabel("tax", { uiLang: "gu" }), "Tax");

  assert.equal(formatAmountDisplay("₹2,00,000"), "₹2,00,000");
  assert.equal(formatAmountDisplay(1500), "₹1,500");
  assert.match(formatAmountDisplay("1500"), /₹1,500/);
  assert.doesNotMatch(formatAmountDisplay(1500), /₹₹/);

  console.log("formatters.test.ts: ok");
}

run();
