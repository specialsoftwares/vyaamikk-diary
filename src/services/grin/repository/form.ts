import type { RegisterGoodsReceiptBody } from "@/goodsEvidence/command";
import { quantity } from "@/goodsEvidence/quantities";
import type { OptionalText } from "@/goodsEvidence/types";
import { mintReceiptId } from "@/services/grin/outbox/ids";

export function presentText(value: string): OptionalText {
  const trimmed = value.trim();
  return trimmed ? { kind: "present", value: trimmed } : { kind: "not_supplied" };
}

export function draftFromFormDefaults(): RegisterGoodsReceiptBody {
  const now = new Date().toISOString();
  return {
    receiptId: mintReceiptId(),
    series: "MAIN",
    capturedAtClientUtc: now,
    // Capture clock is retained as a required field placeholder; precision marks
    // arrival as not recorded (do not present this as a claimed arrival time).
    reportedArrivalAt: now,
    reportedArrivalTimeZone: "Asia/Kolkata",
    reportedArrivalPrecision: "unknown",
    captureProvenance: "unknown",
    buyer: {
      legalName: "",
      gstin: { kind: "not_supplied" },
      address: { kind: "not_supplied" },
    },
    supplier: {
      name: { kind: "not_supplied" },
      registration: { kind: "not_supplied" },
      address: { kind: "not_supplied" },
      contact: { kind: "not_supplied" },
    },
    commercial: {
      supplierInvoiceNumber: { kind: "not_supplied" },
      supplierInvoiceDate: { kind: "not_supplied" },
      supplierInvoiceValue: null,
      purchaseOrderNumber: { kind: "not_supplied" },
      purchaseOrderInternalId: { kind: "not_supplied" },
      challanNumber: { kind: "not_supplied" },
      missingDocumentReason: { kind: "not_supplied" },
    },
    ewb: { kind: "unknown", reason: "Not recorded at capture." },
    transport: {
      vehicleNumber: { kind: "not_supplied" },
      transporterName: { kind: "not_supplied" },
      transporterId: { kind: "not_supplied" },
      lrNumber: { kind: "not_supplied" },
      mode: { kind: "not_supplied" },
    },
    lines: [
      {
        lineId: "line_1",
        description: "",
        hsn: { kind: "not_supplied" },
        invoiceLineRef: { kind: "not_supplied" },
        invoiceQuantity: null,
        expectedOnThisDelivery: quantity("0", "bags"),
        physicallyReceived: quantity("0", "bags"),
        unit: "bags",
        grossWeight: null,
        tareWeight: null,
        netWeight: null,
        weightUnit: { kind: "not_supplied" },
        packageCount: null,
        shortageOrExcess: "unknown",
        condition: { kind: "not_supplied" },
        qcStatus: null,
      },
    ],
    custody: "received",
    warehouse: { kind: "not_supplied" },
    locationBin: { kind: "not_supplied" },
    receivingEmployeeAttributed: { kind: "not_supplied" },
    qualityCheckedByAttributed: { kind: "not_supplied" },
    remarks: { kind: "not_supplied" },
    acknowledgement: {
      outcome: "not_requested",
      claimedRole: { kind: "not_supplied" },
      statement: "Driver acknowledgement not requested at capture.",
      explanation: { kind: "not_supplied" },
    },
    clientObservedAtUtc: now,
  };
}
