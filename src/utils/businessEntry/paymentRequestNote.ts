import { formatINR } from "@/utils/money/inr";
import { formatINRWithWords } from "@/utils/money/inrWords";

/** Auto-generated payment request message when the user leaves request note blank. */
export function buildAutoPaymentRequestNote(input: {
  partyName: string;
  invoiceNumber: string;
  pendingAmount: number;
  locale?: "en-IN" | "hi-IN";
}): string {
  const { partyName, invoiceNumber, pendingAmount, locale = "en-IN" } = input;
  const amount = formatINRWithWords(pendingAmount, locale);
  const party = partyName.trim();
  if (locale === "hi-IN") {
    return `यह इनवॉइस/बिल नं. ${invoiceNumber} के विरुद्ध ${amount} की बकाया राशि के लिए भुगतान अनुरोध है${party ? ` (${party})` : ""}।`;
  }
  const partySuffix = party ? ` from ${party}` : "";
  return `This is a payment request${partySuffix} against Invoice/Bill No. ${invoiceNumber} for the pending amount of ${amount}.`;
}
