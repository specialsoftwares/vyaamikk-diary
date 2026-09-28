import type { RegisterGoodsReceiptBody } from "./command";
import type {
  AcknowledgementState,
  CommercialLinks,
  ImmutableGrin,
  OptionalText,
  ReceiptLine,
  SupplierRegistration,
  SupplierSnapshot,
  TransportSnapshot,
} from "./types";

export const AMENDABLE_GRIN_FIELDS = [
  "remarks",
  "supplier",
  "transport",
  "warehouse",
  "locationBin",
  "commercial",
  "receivingEmployeeAttributed",
  "qualityCheckedByAttributed",
  "acknowledgement",
] as const;

export type AmendableGrinField = (typeof AMENDABLE_GRIN_FIELDS)[number];

export function isAmendableGrinField(key: string): key is AmendableGrinField {
  return (AMENDABLE_GRIN_FIELDS as readonly string[]).includes(key);
}

export function commandReasonError(reason: unknown): string | null {
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return "reason is required";
  }
  return null;
}

export function optionalTextError(label: string, value: OptionalText | null | undefined): string | null {
  if (value == null || typeof value !== "object") return `${label} is required`;
  if (!("kind" in value)) return `${label} is required`;
  if (value.kind === "present") {
    if (typeof value.value !== "string" || !value.value.trim()) return `${label} value is empty`;
    return null;
  }
  if (value.kind === "unknown") {
    if (typeof value.reason !== "string" || !value.reason.trim()) return `${label} unknown reason is empty`;
    return null;
  }
  if (value.kind === "not_supplied") return null;
  return `${label} is invalid`;
}

function lineError(line: ReceiptLine, index: number): string | null {
  if (!line.lineId?.trim()) return `line[${index}] lineId is required`;
  if (!line.description?.trim()) return `line[${index}] description is required`;
  if (!line.unit?.trim()) return `line[${index}] unit is required`;
  if (!line.physicallyReceived) return `line[${index}] physicallyReceived is required`;
  if (!line.expectedOnThisDelivery) return `line[${index}] expectedOnThisDelivery is required`;
  return null;
}

function registrationError(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("kind" in value)) {
    return "supplier registration is required";
  }
  const registration = value as SupplierRegistration;
  if (registration.kind === "registered") {
    if (!registration.gstin?.trim()) return "supplier gstin is empty";
    return null;
  }
  if (registration.kind === "unregistered" || registration.kind === "not_supplied") return null;
  return "supplier registration is invalid";
}

function supplierError(value: unknown): string | null {
  if (!value || typeof value !== "object") return "supplier is required";
  const supplier = value as SupplierSnapshot;
  return (
    optionalTextError("supplier.name", supplier.name) ??
    optionalTextError("supplier.address", supplier.address) ??
    optionalTextError("supplier.contact", supplier.contact) ??
    registrationError(supplier.registration)
  );
}

function transportError(value: unknown): string | null {
  if (!value || typeof value !== "object") return "transport is required";
  const transport = value as TransportSnapshot;
  return (
    optionalTextError("transport.vehicleNumber", transport.vehicleNumber) ??
    optionalTextError("transport.transporterName", transport.transporterName) ??
    optionalTextError("transport.transporterId", transport.transporterId) ??
    optionalTextError("transport.lrNumber", transport.lrNumber) ??
    optionalTextError("transport.mode", transport.mode)
  );
}

function commercialError(value: unknown): string | null {
  if (!value || typeof value !== "object") return "commercial is required";
  const commercial = value as CommercialLinks;
  const money = commercial.supplierInvoiceValue;
  if (money != null) {
    if (typeof money.currency !== "string" || !money.currency.trim()) {
      return "supplierInvoiceValue currency is required";
    }
    if (!Number.isInteger(money.minorUnits)) return "supplierInvoiceValue minorUnits must be an integer";
  }
  return (
    optionalTextError("commercial.supplierInvoiceNumber", commercial.supplierInvoiceNumber) ??
    optionalTextError("commercial.supplierInvoiceDate", commercial.supplierInvoiceDate) ??
    optionalTextError("commercial.purchaseOrderNumber", commercial.purchaseOrderNumber) ??
    optionalTextError("commercial.purchaseOrderInternalId", commercial.purchaseOrderInternalId) ??
    optionalTextError("commercial.challanNumber", commercial.challanNumber) ??
    optionalTextError("commercial.missingDocumentReason", commercial.missingDocumentReason)
  );
}

function acknowledgementError(value: unknown): string | null {
  if (!value || typeof value !== "object") return "acknowledgement is required";
  const acknowledgement = value as AcknowledgementState;
  const outcomes = ["signed", "refused", "unavailable", "not_requested"];
  if (!outcomes.includes(acknowledgement.outcome)) return "acknowledgement outcome is invalid";
  if (typeof acknowledgement.statement !== "string" || !acknowledgement.statement.trim()) {
    return "acknowledgement statement is required";
  }
  return (
    optionalTextError("acknowledgement.claimedRole", acknowledgement.claimedRole) ??
    optionalTextError("acknowledgement.explanation", acknowledgement.explanation)
  );
}

export function amendmentFieldError(field: AmendableGrinField, value: unknown): string | null {
  switch (field) {
    case "warehouse":
    case "locationBin":
    case "remarks":
    case "receivingEmployeeAttributed":
    case "qualityCheckedByAttributed":
      return optionalTextError(field, value as OptionalText | null | undefined);
    case "supplier":
      return supplierError(value);
    case "transport":
      return transportError(value);
    case "commercial":
      return commercialError(value);
    case "acknowledgement":
      return acknowledgementError(value);
  }
}

export function issuedEnvelopeError(input: {
  receiptId: string;
  series: string;
  capturedAtClientUtc: string;
  reportedArrivalAt: string;
  reportedArrivalTimeZone: string;
  buyer: { legalName: string };
  warehouse: OptionalText;
  locationBin: OptionalText;
  lines: ReceiptLine[];
}): string | null {
  if (!input.receiptId?.trim()) return "receiptId is required";
  if (!input.series?.trim()) return "series is required";
  if (!input.capturedAtClientUtc?.trim()) return "capturedAtClientUtc is required";
  if (!input.reportedArrivalAt?.trim()) return "reportedArrivalAt is required";
  if (!input.reportedArrivalTimeZone?.trim()) return "reportedArrivalTimeZone is required";
  if (!input.buyer?.legalName?.trim()) return "buyer legalName is required";
  const warehouse = optionalTextError("warehouse", input.warehouse);
  if (warehouse) return warehouse;
  const location = optionalTextError("locationBin", input.locationBin);
  if (location) return location;
  if (!Array.isArray(input.lines) || input.lines.length === 0) return "at least one line is required";
  for (let i = 0; i < input.lines.length; i++) {
    const err = lineError(input.lines[i]!, i);
    if (err) return err;
  }
  return null;
}

export function registerBodyError(body: RegisterGoodsReceiptBody): string | null {
  return issuedEnvelopeError(body);
}

export function effectiveRecordError(grin: ImmutableGrin): string | null {
  const envelope = issuedEnvelopeError(grin);
  if (envelope) return envelope;
  return (
    supplierError(grin.supplier) ??
    transportError(grin.transport) ??
    commercialError(grin.commercial) ??
    acknowledgementError(grin.acknowledgement) ??
    optionalTextError("remarks", grin.remarks) ??
    optionalTextError("receivingEmployeeAttributed", grin.receivingEmployeeAttributed) ??
    optionalTextError("qualityCheckedByAttributed", grin.qualityCheckedByAttributed)
  );
}
