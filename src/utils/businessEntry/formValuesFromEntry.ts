import type { BusinessEntry, PaymentRequestPayload } from "@/domain/businessEntry";
import { outwardFormValuesFromEntry } from "@/utils/businessEntry/outwardMovement";
import { indianPostalToFormDefaults, parseIndianPostalFromStored } from "@/utils/location/postalForm";

function receiverMobileToFormValue(stored: unknown): string {
  if (typeof stored !== "string" || !stored.trim()) return "";
  const m = stored.match(/^\+91(\d{10})$/);
  return m ? m[1] : stored.replace(/\D/g, "").slice(-10);
}

/** Map stored entry → composer form values for edit / refresh flows. */
export function formValuesFromEntry(entry: BusinessEntry): Record<string, unknown> {
  const p = entry.payload as unknown as Record<string, unknown>;
  if (entry.entryType === "payment_request") {
    const pay = p as unknown as PaymentRequestPayload;
    const b = pay.bankDetails;
    return {
      ...indianPostalToFormDefaults("party", parseIndianPostalFromStored(pay.partyPostal)),
      title: entry.title,
      entryDate: entry.entryDate,
      partyName: pay.partyName,
      invoiceNumber: pay.invoiceNumber,
      invoiceDate: pay.invoiceDate,
      pendingAmount: pay.pendingAmount,
      dueDate: pay.dueDate,
      contactPerson: pay.contactPerson,
      requestNote: pay.requestNote,
      includeBankDetailsInPdf: pay.includeBankDetailsInPdf,
      includePaymentPeriodInPdf: pay.includePaymentPeriodInPdf ?? false,
      bankAccountHolder: b?.accountHolderName ?? "",
      bankName: b?.bankName ?? "",
      bankAccountNumber: b?.accountNumber ?? "",
      bankIfsc: b?.ifsc ?? "",
      bankUpiId: b?.upiId ?? "",
      bankPaymentInstruction: b?.paymentInstruction ?? "",
    };
  }
  if (entry.entryType === "material_dispatched" || entry.entryType === "outward_freight_details") {
    return outwardFormValuesFromEntry(entry);
  }
  const base = {
    title: entry.title,
    entryDate: entry.entryDate,
    notes: entry.notes,
    reminder: entry.reminder,
    ...p,
  };
  if (entry.entryType === "business_cash_given") {
    const payDate =
      p.paymentDate != null && Number(p.paymentDate) > 0
        ? Number(p.paymentDate)
        : entry.entryDate;
    const breakdown = p.denominationBreakdown as
      | { 500?: number; 200?: number; 100?: number; 50?: number }
      | null
      | undefined;
    return {
      title: entry.title,
      paymentDate: payDate,
      amount: p.amount,
      givenToName: p.givenToName,
      receiverMobile: receiverMobileToFormValue(p.receiverMobile),
      count500: breakdown?.[500] ?? "",
      count200: breakdown?.[200] ?? "",
      count100: breakdown?.[100] ?? "",
      count50: breakdown?.[50] ?? "",
      purpose: p.purpose,
      notes: entry.notes,
      cashPaidVoucherSerial: p.cashPaidVoucherSerial ?? null,
      cashPaidVoucherSerialYear: p.cashPaidVoucherSerialYear ?? null,
      cashPaidVoucherSerialAllocatedAt: p.cashPaidVoucherSerialAllocatedAt ?? null,
      photoAttachmentStoragePath: p.photoAttachmentStoragePath ?? null,
      photoAttachmentDownloadUrl: p.photoAttachmentDownloadUrl ?? null,
      photoAttachmentCapturedAt: p.photoAttachmentCapturedAt ?? null,
    };
  }
  if (entry.entryType === "material_received") {
    return {
      ...base,
      ...indianPostalToFormDefaults("dispatchFrom", parseIndianPostalFromStored(p.dispatchFromPostal)),
      ...indianPostalToFormDefaults("receivedAt", parseIndianPostalFromStored(p.receivedAtPostal)),
      ...indianPostalToFormDefaults("party", parseIndianPostalFromStored(p.supplierPostal)),
      ewayBillNumber: p.ewayBillNumber ?? "",
    };
  }
  return base;
}
