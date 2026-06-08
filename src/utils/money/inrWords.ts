/**
 * Indian rupee amounts in words (English / Hindi) for payment requests, PDFs, and share text.
 */

import { formatINR } from "./inr";

type InrWordsLocale = "en-IN" | "hi-IN";

const EN_ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const EN_TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

const HI_ONES = [
  "",
  "एक",
  "दो",
  "तीन",
  "चार",
  "पांच",
  "छह",
  "सात",
  "आठ",
  "नौ",
  "दस",
  "ग्यारह",
  "बारह",
  "तेरह",
  "चौदह",
  "पंद्रह",
  "सोलह",
  "सत्रह",
  "अठारह",
  "उन्नीस",
];

const HI_TENS = ["", "", "बीस", "तीस", "चालीस", "पचास", "साठ", "सत्तर", "अस्सी", "नब्बे"];

function twoDigitsEn(n: number): string {
  if (n < 20) return EN_ONES[n] ?? "";
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones ? `${EN_TENS[tens]} ${EN_ONES[ones]}` : EN_TENS[tens] ?? "";
}

function threeDigitsEn(n: number): string {
  if (n === 0) return "";
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const head = hundreds ? `${EN_ONES[hundreds]} Hundred` : "";
  const tail = rest ? twoDigitsEn(rest) : "";
  if (head && tail) return `${head} ${tail}`;
  return head || tail;
}

function inWordsIndianEn(n: number): string {
  if (n === 0) return "Zero";
  let rest = Math.floor(n);
  const parts: string[] = [];

  const crore = Math.floor(rest / 10_000_000);
  rest %= 10_000_000;
  const lakh = Math.floor(rest / 100_000);
  rest %= 100_000;
  const thousand = Math.floor(rest / 1000);
  rest %= 1000;

  if (crore) parts.push(`${threeDigitsEn(crore)} Crore`);
  if (lakh) parts.push(`${threeDigitsEn(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigitsEn(thousand)} Thousand`);
  if (rest) parts.push(threeDigitsEn(rest));

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function twoDigitsHi(n: number): string {
  if (n < 20) return HI_ONES[n] ?? "";
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  const tensWord = HI_TENS[tens] ?? "";
  return ones ? `${tensWord} ${HI_ONES[ones]}` : tensWord;
}

function threeDigitsHi(n: number): string {
  if (n === 0) return "";
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const head = hundreds ? `${HI_ONES[hundreds]} सौ` : "";
  const tail = rest ? twoDigitsHi(rest) : "";
  if (head && tail) return `${head} ${tail}`;
  return head || tail;
}

function inWordsIndianHi(n: number): string {
  if (n === 0) return "शून्य";
  let rest = Math.floor(n);
  const parts: string[] = [];

  const crore = Math.floor(rest / 10_000_000);
  rest %= 10_000_000;
  const lakh = Math.floor(rest / 100_000);
  rest %= 100_000;
  const thousand = Math.floor(rest / 1000);
  rest %= 1000;

  if (crore) parts.push(`${threeDigitsHi(crore)} करोड़`);
  if (lakh) parts.push(`${threeDigitsHi(lakh)} लाख`);
  if (thousand) parts.push(`${threeDigitsHi(thousand)} हज़ार`);
  if (rest) parts.push(threeDigitsHi(rest));

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Whole rupees + optional paise in Indian English / Hindi words. */
export function formatINRInWords(
  amount: number,
  locale: InrWordsLocale = "en-IN"
): string {
  if (!Number.isFinite(amount) || amount <= 0) return "";

  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);

  if (locale === "hi-IN") {
    let words = `रुपये ${inWordsIndianHi(rupees)}`;
    if (paise > 0) {
      words += ` और ${inWordsIndianHi(paise)} पैसे`;
    }
    words += " मात्र";
    return words;
  }

  let words = `Rupees ${inWordsIndianEn(rupees)}`;
  if (paise > 0) {
    words += ` and ${inWordsIndianEn(paise)} Paise`;
  }
  words += " Only";
  return words;
}

/** UI language must not affect amount/date wording — always en-IN. */
export function inrWordsLocaleFromLang(_lang?: string): InrWordsLocale {
  return "en-IN";
}

/** Figures + words, e.g. ₹2,00,000 (Rupees Two Lakh Only). */
export function formatINRWithWords(
  amount: number,
  locale: InrWordsLocale = "en-IN"
): string {
  const figures = formatINR(amount, { locale });
  const words = formatINRInWords(amount, locale);
  return words ? `${figures} (${words})` : figures;
}
