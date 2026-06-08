import type { BusinessEntry, MaterialDispatchedPayload } from "@/domain/businessEntry";
import { outwardMovementDefaultValues } from "@/utils/businessEntry/outwardMovement";
import { indianPostalToFormDefaults, parseIndianPostalFromStored } from "@/utils/location/postalForm";

/** Prefill unified outward movement form from a material dispatch entry. */
export function freightDefaultsFromDispatch(entry: BusinessEntry): Record<string, unknown> {
  if (entry.entryType !== "material_dispatched") {
    return {};
  }
  const d = entry.payload as MaterialDispatchedPayload;
  return {
    ...outwardMovementDefaultValues(entry.id),
    entryDate: entry.entryDate,
    partyName: d.partyName,
    materialName: d.materialName,
    quantity: d.quantity,
    unit: d.unit,
    billChallanNumber: d.invoiceChallan?.trim() ?? "",
    ewayBillNumber: d.ewayBillNumber ?? "",
    materialDescription: d.materialDescription ?? "",
    referenceNote: d.referenceNote ?? "",
    transporterName: d.transporter?.trim() ?? "",
    lrGrNumber: d.lrGrNumber?.trim() ?? "",
    vehicleNumber: d.vehicleNumber?.trim() ?? "",
    totalBoxes: d.totalBoxes != null && d.totalBoxes > 0 ? d.totalBoxes : "",
    totalWeight: d.totalWeight != null && d.totalWeight > 0 ? d.totalWeight : "",
    weightUnit: d.weightUnit?.trim() || "Kg",
    freightType: d.freightType ?? "to_pay",
    freightAmount: d.freightAmount != null && d.freightAmount > 0 ? d.freightAmount : "",
    ccCopyInstruction: d.ccCopyInstruction ?? "not_attached",
    clarificationContactName: d.clarificationContactName ?? "",
    clarificationContactMobile: d.clarificationContactMobile ?? "",
    remarks: d.remarks?.trim() ?? "",
    linkedDispatchId: entry.id,
    linkedDispatchUpdatedAt: entry.updatedAt,
    dispatchLocation: d.dispatchLocation ?? "",
    destination: d.destination ?? "",
    ...indianPostalToFormDefaults("deliveryTo", parseIndianPostalFromStored(d.deliveryToPostal)),
    ...indianPostalToFormDefaults("dispatchFrom", parseIndianPostalFromStored(d.dispatchFromPostal)),
  };
}
