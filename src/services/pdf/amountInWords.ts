import { formatINRInWords } from "@/utils/money/inrWords";

/** Indian English amount in words for cash payment vouchers — always en-IN. */
export function amountInWordsForVoucher(amount: number): string {
  if (amount === 0) return "Rupees Zero Only";
  if (!Number.isFinite(amount) || amount < 0) return "";
  return formatINRInWords(amount, "en-IN");
}
