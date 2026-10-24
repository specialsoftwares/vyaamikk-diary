import type { RegisterGoodsReceiptBody } from "./command";
import { quantity } from "./quantities";
import type { ReceiptLine } from "./types";

export function sampleLine(overrides: Partial<ReceiptLine> = {}): ReceiptLine {
  return {
    lineId: "line_1",
    description: "Cotton bales",
    hsn: { kind: "present", value: "5201" },
    invoiceLineRef: { kind: "present", value: "1" },
    invoiceQuantity: quantity("100", "bags"),
    expectedOnThisDelivery: quantity("40", "bags"),
    physicallyReceived: quantity("40", "bags"),
    unit: "bags",
    grossWeight: null,
    tareWeight: null,
    netWeight: null,
    weightUnit: { kind: "not_supplied" },
    packageCount: quantity("40", "bags"),
    shortageOrExcess: "none",
    condition: { kind: "present", value: "sound" },
    qcStatus: null,
    ...overrides,
  };
}

export function sampleRegisterBody(
  overrides: Partial<RegisterGoodsReceiptBody> = {}
): RegisterGoodsReceiptBody {
  return {
    receiptId: "receipt_1",
    series: "MAIN",
    capturedAtClientUtc: "2026-09-28T04:00:00.000Z",
    reportedArrivalAt: "2026-09-28T03:30:00.000Z",
    reportedArrivalTimeZone: "Asia/Kolkata",
    captureProvenance: "online",
    buyer: {
      legalName: "Sample Buyer",
      gstin: { kind: "present", value: "07AAAAA0000A1Z5" },
      address: { kind: "present", value: "Delhi" },
    },
    supplier: {
      name: { kind: "present", value: "Sample Supplier" },
      registration: { kind: "registered", gstin: "29BBBBB0000B1Z5" },
      address: { kind: "not_supplied" },
      contact: { kind: "not_supplied" },
    },
    commercial: {
      supplierInvoiceNumber: { kind: "present", value: "INV-1" },
      supplierInvoiceDate: { kind: "present", value: "2026-09-27" },
      supplierInvoiceValue: { currency: "INR", minorUnits: 118000 },
      purchaseOrderNumber: { kind: "not_supplied" },
      purchaseOrderInternalId: { kind: "not_supplied" },
      challanNumber: { kind: "not_supplied" },
      missingDocumentReason: { kind: "not_supplied" },
    },
    ewb: { kind: "none" },
    transport: {
      vehicleNumber: { kind: "present", value: "DL01AB1234" },
      transporterName: { kind: "unknown", reason: "not on LR" },
      transporterId: { kind: "not_supplied" },
      lrNumber: { kind: "not_supplied" },
      mode: { kind: "present", value: "road" },
    },
    lines: [sampleLine()],
    custody: "received",
    receivingEmployeeAttributed: { kind: "present", value: "Gate staff (attributed)" },
    qualityCheckedByAttributed: { kind: "not_supplied" },
    remarks: { kind: "not_supplied" },
    warehouse: { kind: "present", value: "Main godown" },
    locationBin: { kind: "present", value: "Bay A" },
    acknowledgement: {
      outcome: "not_requested",
      claimedRole: { kind: "not_supplied" },
      statement: "Driver acknowledgement not requested at capture.",
      explanation: { kind: "not_supplied" },
    },
    clientObservedAtUtc: "2026-09-28T04:00:00.000Z",
    ...overrides,
  };
}
