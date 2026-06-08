import type { BusinessEntry, BusinessEntryType } from "@/domain/businessEntry";
import { normalizeEwayBillInput } from "@/utils/businessEntry/ewayBill";
import { indianPostalToFormDefaults, parseIndianPostalFromStored } from "@/utils/location/postalForm";

export const OUTWARD_MOVEMENT_TYPES = [
  "material_dispatched",
  "outward_freight_details",
] as const;

export type OutwardMovementEntryType = (typeof OUTWARD_MOVEMENT_TYPES)[number];

export function isOutwardMovementEntryType(
  type: BusinessEntryType
): type is OutwardMovementEntryType {
  return (OUTWARD_MOVEMENT_TYPES as readonly string[]).includes(type);
}

export function outwardMovementDefaultValues(
  linkedDispatchId?: string | null
): Record<string, unknown> {
  return {
    movementType: "sent_transport",
    partyName: "",
    billChallanNumber: "",
    ewayBillNumber: "",
    referenceNote: "",
    materialName: "",
    materialDescription: "",
    quantity: "",
    unit: "",
    dispatchLocation: "",
    destination: "",
    dispatchFromLocation: "",
    deliveryLocation: "",
    totalBoxes: "",
    totalWeight: "",
    weightUnit: "Kg",
    freightType: "to_pay",
    freightAmount: "",
    transporterName: "",
    lrGrNumber: "",
    vehicleNumber: "",
    ccCopyInstruction: "not_attached",
    clarificationContactName: "",
    clarificationContactMobile: "",
    remarks: "",
    linkedDispatchId: linkedDispatchId ?? "",
    linkedDispatchUpdatedAt: null,
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function numPositive(v: unknown): number | null {
  if (v === "" || v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** User started item fields — require the full trio when any is present. */
export function outwardItemStarted(values: Record<string, unknown>): boolean {
  return Boolean(str(values.materialName) || str(values.unit) || numPositive(values.quantity));
}

export function outwardHasCompleteItem(values: Record<string, unknown>): boolean {
  return Boolean(str(values.materialName) && str(values.unit) && numPositive(values.quantity));
}

/** Enough transport metadata for a freight-style save without full item lines. */
export function outwardHasTransportSignal(values: Record<string, unknown>): boolean {
  return Boolean(
    str(values.transporterName) ||
      str(values.lrGrNumber) ||
      str(values.vehicleNumber) ||
      str(values.billChallanNumber) ||
      numPositive(values.totalBoxes) ||
      numPositive(values.totalWeight) ||
      numPositive(values.freightAmount)
  );
}

/** Pick storage type for a new outward record from unified form values. */
export function resolveOutwardSaveEntryType(
  values: Record<string, unknown>
): OutwardMovementEntryType {
  if (outwardHasCompleteItem(values)) return "material_dispatched";
  return "outward_freight_details";
}

/** Map stored entry → unified outward composer values. */
export function outwardFormValuesFromEntry(entry: BusinessEntry): Record<string, unknown> {
  const p = entry.payload as unknown as Record<string, unknown>;
  const base = {
    title: entry.title,
    entryDate: entry.entryDate,
    notes: entry.notes,
    reminder: entry.reminder,
    movementType: "sent_transport",
    ewayBillNumber: str(p.ewayBillNumber),
    materialDescription: str(p.materialDescription),
    referenceNote: str(p.referenceNote),
    freightAmount: p.freightAmount != null && Number(p.freightAmount) > 0 ? p.freightAmount : "",
  };

  if (entry.entryType === "material_dispatched") {
    return {
      ...base,
      partyName: p.partyName ?? "",
      materialName: p.materialName ?? "",
      quantity: p.quantity ?? "",
      unit: p.unit ?? "",
      billChallanNumber: p.invoiceChallan ?? "",
      transporterName: p.transporter ?? "",
      lrGrNumber: p.lrGrNumber ?? "",
      vehicleNumber: p.vehicleNumber ?? "",
      remarks: p.remarks ?? "",
      totalBoxes: p.totalBoxes != null && Number(p.totalBoxes) > 0 ? p.totalBoxes : "",
      totalWeight: p.totalWeight != null && Number(p.totalWeight) > 0 ? p.totalWeight : "",
      weightUnit: p.weightUnit ?? "Kg",
      freightType: p.freightType ?? "to_pay",
      ccCopyInstruction: p.ccCopyInstruction ?? "not_attached",
      clarificationContactName: p.clarificationContactName ?? "",
      clarificationContactMobile: p.clarificationContactMobile ?? "",
      dispatchLocation: p.dispatchLocation ?? "",
      destination: p.destination ?? "",
      ...indianPostalToFormDefaults("deliveryTo", parseIndianPostalFromStored(p.deliveryToPostal)),
      ...indianPostalToFormDefaults("dispatchFrom", parseIndianPostalFromStored(p.dispatchFromPostal)),
    };
  }

  return {
    ...base,
    partyName: p.partyName ?? "",
    materialName: p.materialName ?? "",
    quantity: "",
    unit: "",
    billChallanNumber: p.billNumber ?? "",
    billDate: p.billDate ?? null,
    dispatchTitle: p.dispatchTitle ?? "",
    transporterName: p.transporterName ?? "",
    lrGrNumber: p.lrGrNumber ?? "",
    vehicleNumber: p.vehicleNumber ?? "",
    remarks: p.remarks ?? "",
    totalBoxes: p.totalBoxes != null && Number(p.totalBoxes) > 0 ? p.totalBoxes : "",
    totalWeight: p.totalWeight != null && Number(p.totalWeight) > 0 ? p.totalWeight : "",
    weightUnit: p.weightUnit ?? "Kg",
    freightType: p.freightType ?? "to_pay",
    ccCopyInstruction: p.ccCopyInstruction ?? "not_attached",
    clarificationContactName: p.clarificationContactName ?? "",
    clarificationContactMobile: p.clarificationContactMobile ?? "",
    dispatchFromLocation: p.dispatchFromLocation ?? "",
    deliveryLocation: p.deliveryLocation ?? "",
    linkedDispatchId: p.linkedDispatchId ?? "",
    linkedDispatchUpdatedAt: p.linkedDispatchUpdatedAt ?? null,
    ...indianPostalToFormDefaults("deliveryTo", parseIndianPostalFromStored(p.deliveryToPostal)),
    ...indianPostalToFormDefaults("dispatchFrom", parseIndianPostalFromStored(p.dispatchFromPostal)),
  };
}

export function normalizeOutwardFormValues(
  values: Record<string, unknown>
): Record<string, unknown> {
  const eway = str(values.ewayBillNumber);
  return {
    ...values,
    movementType: "sent_transport",
    ewayBillNumber: eway ? normalizeEwayBillInput(eway) : "",
  };
}

/** PDF title based on stored outward payload shape. */
export function outwardMovementPdfTitle(entry: BusinessEntry): string {
  const p = entry.payload as unknown as Record<string, unknown>;
  const hasItem =
    entry.entryType === "material_dispatched" ||
    (typeof p.materialName === "string" && p.materialName.trim() &&
      p.quantity != null &&
      Number(p.quantity) > 0);
  const hasTransport = Boolean(
    str(p.transporter) ||
      str(p.transporterName) ||
      str(p.lrGrNumber) ||
      str(p.vehicleNumber) ||
      str(p.freightType) ||
      numPositive(p.totalBoxes) ||
      numPositive(p.totalWeight)
  );
  if (hasItem) return "Goods Dispatch & Transport Record";
  if (hasTransport) return "Transport / Freight Update";
  return "Goods Dispatch & Transport Record";
}

export function outwardHasItemPayload(p: Record<string, unknown>): boolean {
  return Boolean(
    str(p.materialName) && p.quantity != null && Number(p.quantity) > 0 && str(p.unit)
  );
}
