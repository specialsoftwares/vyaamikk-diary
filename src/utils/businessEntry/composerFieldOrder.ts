import type { BusinessEntryType } from "@/domain/businessEntry";
import type { FieldErrors } from "react-hook-form";

/** Scroll / focus order for validation errors (top to bottom). */
export const COMPOSER_FIELD_ORDER: Partial<Record<BusinessEntryType, string[]>> = {
  business_cash_given: ["paymentDate", "amount", "givenToName", "purpose"],
  work_update_issue: ["entryDate", "workDone", "issueProblem", "reminder"],
  staff_matter: ["entryDate", "staffName", "matterDetails"],
  material_dispatched: [
    "entryDate",
    "partyName",
    "dispatchFromPin",
    "deliveryToPin",
    "ewayBillNumber",
    "materialName",
    "quantity",
    "unit",
    "transporterName",
    "lrGrNumber",
    "vehicleNumber",
  ],
  material_received: [
    "entryDate",
    "supplierName",
    "dispatchFromPin",
    "receivedAtPin",
    "ewayBillNumber",
    "materialName",
    "quantity",
    "unit",
  ],
  payment_request: [
    "entryDate",
    "partyName",
    "invoiceNumber",
    "pendingAmount",
    "invoiceDate",
    "dueDate",
    "contactPerson",
    "requestNote",
    "includeBankDetailsInPdf",
    "bankAccountHolder",
    "bankName",
    "bankAccountNumber",
    "bankIfsc",
    "bankUpiId",
    "bankPaymentInstruction",
  ],
  reminder_purchase: ["itemMaterial", "reminder"],
  reminder_email: ["purposeSubject", "reminder"],
  outward_freight_details: [
    "entryDate",
    "partyName",
    "dispatchFromPin",
    "deliveryToPin",
    "ewayBillNumber",
    "materialName",
    "quantity",
    "unit",
    "transporterName",
    "lrGrNumber",
    "vehicleNumber",
  ],
};

function nestedMessage(errors: FieldErrors, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = errors;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  if (cur && typeof cur === "object" && "message" in cur) {
    return String((cur as { message?: unknown }).message ?? "");
  }
  return undefined;
}

export function firstComposerFieldError(
  entryType: BusinessEntryType,
  errors: FieldErrors
): { name: string; message: string } | null {
  const order = COMPOSER_FIELD_ORDER[entryType];
  if (!order) {
    for (const [name, err] of Object.entries(errors)) {
      const msg = err && typeof err === "object" && "message" in err ? String(err.message) : "";
      if (msg) return { name, message: msg };
    }
    return null;
  }
  for (const name of order) {
    const direct = nestedMessage(errors, name);
    if (direct) return { name, message: direct };
    if (errors[name]) {
      const msg =
        errors[name] && typeof errors[name] === "object" && "message" in (errors[name] as object)
          ? String((errors[name] as { message?: unknown }).message)
          : "";
      if (msg) return { name, message: msg };
    }
  }
  return null;
}
