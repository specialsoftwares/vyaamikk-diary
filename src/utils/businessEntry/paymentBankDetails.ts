import type { PaymentBankDetails } from "@/domain/businessEntry";

/** Indian IFSC: 4 letters + 0 + 6 alphanumeric (11 chars). */
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Basic UPI VPA shape — validated only when user enters a value. */
export const UPI_PATTERN = /^[\w.\-]{2,256}@[\w.\-]{2,64}$/;

export function normalizeIfscInput(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 11);
}

export function isValidIfsc(value: string): boolean {
  const v = value.trim().toUpperCase();
  if (!v) return true;
  return IFSC_PATTERN.test(v);
}

export function isValidUpiId(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  return UPI_PATTERN.test(v);
}

export function paymentBankDetailsHasContent(b: PaymentBankDetails | null): boolean {
  if (!b) return false;
  return Boolean(
    b.accountHolderName.trim() ||
      b.bankName.trim() ||
      b.accountNumber.trim() ||
      b.ifsc.trim() ||
      (b.upiId && b.upiId.trim()) ||
      (b.paymentInstruction && b.paymentInstruction.trim())
  );
}

export function buildPaymentBankDetailsFromForm(values: Record<string, unknown>): {
  includeBankDetailsInPdf: boolean;
  bankDetails: PaymentBankDetails | null;
} {
  if (!Boolean(values.includeBankDetailsInPdf)) {
    return { includeBankDetailsInPdf: false, bankDetails: null };
  }

  const bankDetails: PaymentBankDetails = {
    accountHolderName: String(values.bankAccountHolder ?? "").trim(),
    bankName: String(values.bankName ?? "").trim(),
    accountNumber: String(values.bankAccountNumber ?? "").trim(),
    ifsc: normalizeIfscInput(String(values.bankIfsc ?? "")),
    upiId:
      typeof values.bankUpiId === "string" && values.bankUpiId.trim()
        ? values.bankUpiId.trim()
        : null,
    paymentInstruction:
      typeof values.bankPaymentInstruction === "string" &&
      values.bankPaymentInstruction.trim()
        ? values.bankPaymentInstruction.trim()
        : null,
  };

  if (!paymentBankDetailsHasContent(bankDetails)) {
    return { includeBankDetailsInPdf: false, bankDetails: null };
  }

  return { includeBankDetailsInPdf: true, bankDetails };
}
