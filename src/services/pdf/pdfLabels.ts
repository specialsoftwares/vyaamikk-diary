import type { Lang } from "@/i18n/types";

/**
 * Structural PDF labels only — never localizes user-entered business data.
 * PO and Letterhead PDFs must remain English-only (callers use englishPdfT).
 * Gujarati labels apply only when UI language is Gujarati.
 */
const GUJARATI_STRUCTURAL_LABELS: Record<string, string> = {
  date: "તારીખ",
  saleDate: "વેચાણ તારીખ",
  dueDate: "નિયત તારીખ",
  description: "વર્ણન",
  quantity: "જથ્થો",
  amount: "રકમ",
  total: "કુલ",
  balance: "બેલેન્સ",
  signature: "સહી",
  status: "સ્થિતિ",
  notes: "નોંધ",
  note: "નોંધ",
  details: "વિગતો",
  reminder: "રીમાઇન્ડર",
  generated: "બનાવ્યું",
  reference: "સંદર્ભ",
  party: "પક્ષ",
  customer: "ગ્રાહક",
  supplier: "સપ્લાયર",
  shop: "થી",
  mobile: "મોબાઈલ",
  address: "સરનામું",
  product: "ઉત્પાદન / સેવા",
  paymentMode: "મોડ",
  remarks: "ટિપ્પણી",
  ledger: "ચુકવણી ખાતા",
  received: "પ્રાપ્ત",
  item: "વસ્તુ",
  unit: "એકમ",
  tax: "Tax",
  subtotal: "Subtotal",
  grandTotal: "Grand Total",
  recordNumber: "Record No.",
  seq: "#",
  paid: "ચૂકવેલ",
};

const ENGLISH_STRUCTURAL_LABELS: Record<string, string> = {
  date: "Date",
  saleDate: "Sale date",
  dueDate: "Due date",
  description: "Description",
  quantity: "Quantity",
  amount: "Amount",
  total: "Total",
  balance: "Balance",
  signature: "Signature",
  status: "Status",
  notes: "Notes",
  note: "Note",
  details: "Details",
  reminder: "Reminder",
  generated: "Generated",
  reference: "Reference",
  party: "Party",
  customer: "Customer",
  supplier: "Supplier",
  shop: "From",
  mobile: "Mobile",
  address: "Address",
  product: "Product / service",
  paymentMode: "Mode",
  remarks: "Remarks",
  ledger: "Payment ledger",
  received: "Received",
  item: "Item",
  unit: "Unit",
  tax: "Tax",
  subtotal: "Subtotal",
  grandTotal: "Grand Total",
  recordNumber: "Record No.",
  seq: "#",
  paid: "Paid",
};

export type PdfStructuralLabelKey = keyof typeof ENGLISH_STRUCTURAL_LABELS;

export interface PdfLabelOptions {
  /** Active UI language — only `gu` yields Gujarati structural labels. */
  uiLang?: Lang;
  /** Force English labels (PO / Letterhead). */
  englishOnly?: boolean;
}

let englishOnlyPdfService: string | null = null;

/** PO and Letterhead PDF builders must call this before composing HTML. */
export function assertEnglishOnlyPdf(serviceName: string): void {
  englishOnlyPdfService = serviceName;
}

export function clearEnglishOnlyPdfContext(): void {
  englishOnlyPdfService = null;
}

export function currentEnglishOnlyPdfService(): string | null {
  return englishOnlyPdfService;
}

export function pdfLabel(key: PdfStructuralLabelKey, options: PdfLabelOptions = {}): string {
  if (options.englishOnly || englishOnlyPdfService) {
    return ENGLISH_STRUCTURAL_LABELS[key] ?? key;
  }
  if (options.uiLang !== "gu") {
    return ENGLISH_STRUCTURAL_LABELS[key] ?? key;
  }
  return GUJARATI_STRUCTURAL_LABELS[key] ?? ENGLISH_STRUCTURAL_LABELS[key] ?? key;
}

/** All structural PDF chrome labels for a UI language (data fields still use en-IN formatters). */
export function getPdfLabels(uiLang?: Lang, englishOnly = false): Record<PdfStructuralLabelKey, string> {
  const keys = Object.keys(ENGLISH_STRUCTURAL_LABELS) as PdfStructuralLabelKey[];
  return Object.fromEntries(
    keys.map((key) => [key, pdfLabel(key, { uiLang, englishOnly })])
  ) as Record<PdfStructuralLabelKey, string>;
}
