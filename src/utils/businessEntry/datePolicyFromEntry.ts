import type { BusinessEntry } from "@/domain/businessEntry";
import type { DatePolicySchemaOptions } from "@/utils/businessEntry/validation";

/** Existing business dates for edit-mode legacy preservation. */
export function datePolicyOptionsFromEntry(entry: BusinessEntry): DatePolicySchemaOptions {
  const base: DatePolicySchemaOptions = {
    existingEntryDateMs: entry.entryDate,
  };

  switch (entry.entryType) {
    case "business_cash_given": {
      const p = entry.payload as { paymentDate?: number };
      return {
        ...base,
        existingCashPaidDateMs:
          p.paymentDate != null && p.paymentDate > 0 ? p.paymentDate : entry.entryDate,
      };
    }
    case "payment_request": {
      const p = entry.payload as { invoiceDate?: number | null; dueDate?: number | null };
      return {
        ...base,
        existingInvoiceDateMs: p.invoiceDate ?? undefined,
        existingDueDateMs: p.dueDate ?? undefined,
      };
    }
    case "outward_freight_details": {
      const p = entry.payload as { billDate?: number | null };
      return {
        ...base,
        existingBillDateMs: p.billDate ?? undefined,
      };
    }
    case "reminder_purchase":
    case "reminder_email":
      return {
        ...base,
        existingReminderAtMs: entry.reminder?.at,
      };
    case "material_received":
      return {
        ...base,
        recordCreatedAtMs: entry.createdAt,
      };
    default:
      return base;
  }
}
