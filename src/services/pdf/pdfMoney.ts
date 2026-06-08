import { formatINR } from "@/utils/money/inr";
import { formatINRWithWords, formatINRInWords } from "@/utils/money/inrWords";

export { formatINR, formatINRWithWords, formatINRInWords };

export function pdfMoneyLine(amount: number, _locale: "en-IN" | "hi-IN" = "en-IN"): string {
  return formatINRWithWords(amount, "en-IN");
}
