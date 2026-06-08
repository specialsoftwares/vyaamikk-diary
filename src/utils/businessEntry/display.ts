import type { BusinessEntry, BusinessEntryType } from "@/domain/businessEntry";
import { movementRouteSummary } from "@/domain/materialMovement";
import { formatEntryDate } from "@/utils/date";
import { formatINR } from "@/utils/money/inr";

/** Build searchable plain text for list filtering. */
export function entrySearchBlob(entry: BusinessEntry): string {
  const parts = [entry.title, entry.notes ?? ""];
  const loc = entry.location?.name ?? "";
  if (loc) parts.push(loc);
  const p = entry.payload as unknown as Record<string, unknown>;
  if (entry.entryType === "outward_freight_details") {
    const keys = [
      "billNumber",
      "lrGrNumber",
      "deliveryLocation",
      "transporterName",
      "vehicleNumber",
      "clarificationContactName",
      "partyName",
      "dispatchTitle",
    ];
    for (const k of keys) {
      const v = p[k];
      if (typeof v === "string" && v) parts.push(v);
    }
  }
  if (entry.entryType === "payment_request") {
    const keys = ["partyName", "invoiceNumber", "contactPerson", "requestNote"];
    for (const k of keys) {
      const v = p[k];
      if (typeof v === "string" && v) parts.push(v);
    }
  }
  for (const v of Object.values(p)) {
    if (typeof v === "string" && v) parts.push(v);
    if (typeof v === "number" && v) parts.push(String(v));
  }
  return parts.join(" ").toLowerCase();
}

export function entryTypeLabelKey(type: BusinessEntryType): string {
  if (type === "legacy") return "composer.types.legacy";
  return `composer.types.${type}`;
}

export function entryListSummary(
  entry: BusinessEntry,
  t: (k: string, vars?: Record<string, string | number>) => string
): string {
  const p = entry.payload;
  switch (entry.entryType) {
    case "work_update_issue": {
      const d = p as import("@/domain/businessEntry").WorkUpdateIssuePayload;
      if (d.issueProblem) return d.issueProblem.slice(0, 80);
      if (d.workDone) return d.workDone.slice(0, 80);
      return entry.notes?.slice(0, 80) ?? "";
    }
    case "staff_matter": {
      const d = p as import("@/domain/businessEntry").StaffMatterPayload;
      return `${d.staffName} — ${d.matterDetails.slice(0, 60)}`;
    }
    case "business_cash_given": {
      const d = p as import("@/domain/businessEntry").BusinessCashGivenPayload;
      return t("composer.summary.cash", {
        amount: formatINR(d.amount),
        name: d.givenToName,
      });
    }
    case "material_dispatched": {
      const d = p as import("@/domain/businessEntry").MaterialDispatchedPayload;
      const route = movementRouteSummary(entry);
      const lr = d.lrGrNumber ? ` · LR ${d.lrGrNumber}` : "";
      const veh = d.vehicleNumber ? ` · ${d.vehicleNumber}` : "";
      return [route, `${d.materialName} ${d.quantity} ${d.unit}${lr}${veh}`]
        .filter(Boolean)
        .join(" · ");
    }
    case "material_received": {
      const d = p as import("@/domain/businessEntry").MaterialReceivedPayload;
      const route = movementRouteSummary(entry);
      return [route, `${d.materialName} ${d.quantity} ${d.unit}`].filter(Boolean).join(" · ");
    }
    case "material_return": {
      const d = p as import("@/domain/businessEntry").MaterialReturnPayload;
      const route = movementRouteSummary(entry);
      return [route, d.returnReason, `${d.materialName} ${d.quantity} ${d.unit}`]
        .filter(Boolean)
        .join(" · ");
    }
    case "reminder_purchase": {
      const d = p as import("@/domain/businessEntry").ReminderPurchasePayload;
      return d.itemMaterial;
    }
    case "reminder_email": {
      const d = p as import("@/domain/businessEntry").ReminderEmailPayload;
      return d.purposeSubject;
    }
    case "reminder_gst_return": {
      const d = p as import("@/domain/businessEntry").ReminderGstReturnPayload;
      return `${d.returnType.toUpperCase()} · ${d.taxPeriod}`;
    }
    case "payment_request": {
      const d = p as unknown as import("@/domain/businessEntry").PaymentRequestPayload;
      return t("composer.summary.paymentRequest", {
        party: d.partyName,
        pending: formatINR(d.pendingAmount),
        invoice: d.invoiceNumber,
      });
    }
    case "outward_freight_details": {
      const d = p as unknown as import("@/domain/businessEntry").OutwardFreightPayload;
      const route = movementRouteSummary(entry);
      const lr = d.lrGrNumber ? ` · LR ${d.lrGrNumber}` : "";
      const veh = d.vehicleNumber ? ` · ${d.vehicleNumber}` : "";
      const bill = d.billNumber ? `${d.billNumber}` : "";
      const item =
        d.materialName?.trim() && d.billNumber
          ? d.materialName
          : d.transporterName?.trim() || bill || d.deliveryLocation;
      return [route, `${item}${lr}${veh}`].filter(Boolean).join(" · ");
    }
    case "letterhead_matter": {
      const d = p as import("@/domain/businessEntry").LetterheadMatterPayload;
      return d.subject ?? d.body.slice(0, 60);
    }
    case "legacy":
    default: {
      const d = p as import("@/domain/businessEntry").LegacyPayload;
      return entry.notes ?? d.issue ?? "";
    }
  }
}

export function autoEntryTitle(
  entryType: BusinessEntryType,
  entryDate: number,
  payload: BusinessEntry["payload"],
  t: (k: string, vars?: Record<string, string | number>) => string
): string {
  const dateStr = formatEntryDate(entryDate);
  switch (entryType) {
    case "work_update_issue":
      return t("composer.autoTitle.workUpdate", { date: dateStr });
    case "staff_matter": {
      const d = payload as import("@/domain/businessEntry").StaffMatterPayload;
      return t("composer.autoTitle.staff", { name: d.staffName });
    }
    case "business_cash_given": {
      const d = payload as import("@/domain/businessEntry").BusinessCashGivenPayload;
      return t("composer.autoTitle.cash", { name: d.givenToName });
    }
    case "material_dispatched": {
      const d = payload as import("@/domain/businessEntry").MaterialDispatchedPayload;
      return t("composer.autoTitle.dispatch", { party: d.partyName });
    }
    case "material_return": {
      const d = payload as import("@/domain/businessEntry").MaterialReturnPayload;
      return t("composer.autoTitle.return", { party: d.partyName });
    }
    case "material_received": {
      const d = payload as import("@/domain/businessEntry").MaterialReceivedPayload;
      return t("composer.autoTitle.receipt", { supplier: d.supplierName });
    }
    case "reminder_purchase": {
      const d = payload as import("@/domain/businessEntry").ReminderPurchasePayload;
      return t("composer.autoTitle.purchase", { item: d.itemMaterial });
    }
    case "reminder_email":
      return t("composer.autoTitle.email");
    case "reminder_gst_return":
      return t("composer.autoTitle.gst");
    case "payment_request": {
      const d = payload as unknown as import("@/domain/businessEntry").PaymentRequestPayload;
      return t("composer.autoTitle.paymentRequest", {
        party: d.partyName,
        invoice: d.invoiceNumber,
      });
    }
    case "outward_freight_details": {
      const d = payload as unknown as import("@/domain/businessEntry").OutwardFreightPayload;
      return t("composer.autoTitle.freight", { bill: d.billNumber });
    }
    case "letterhead_matter":
      return t("composer.autoTitle.letterhead");
    default:
      return t("composer.autoTitle.generic", { date: dateStr });
  }
}

export function entryHasPdfExport(type: BusinessEntryType): boolean {
  return type !== "legacy";
}
