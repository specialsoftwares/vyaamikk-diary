import type { FrozenCommand, GoodsCommandType, RegisterGoodsReceiptBody } from "./command";
import { quantityShapeError } from "./quantities";
import type { EwbLink } from "./ewb";
import type {
  AcknowledgementState,
  BuyerIdentitySnapshot,
  CaptureProvenance,
  CommercialLinks,
  CustodyState,
  ImmutableGrin,
  OptionalText,
  QcStatus,
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

const ORIGINAL_DISPOSITIONS = new Set<CustodyState>([
  "received",
  "refused_at_gate",
  "held_for_qc",
  "accepted_for_stock",
]);

const QC_STATUSES = new Set<QcStatus>(["accepted", "hold", "partial", "rejected"]);
const CAPTURE_PROVENANCES = new Set<CaptureProvenance>(["online", "offline", "late_entry"]);
const SHORTAGE = new Set(["shortage", "excess", "none", "unknown"]);

export function isAmendableGrinField(key: string): key is AmendableGrinField {
  return (AMENDABLE_GRIN_FIELDS as readonly string[]).includes(key);
}

export function commandReasonError(reason: unknown): string | null {
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return "reason is required";
  }
  return null;
}

export function commandEnvelopeError(
  command: FrozenCommand<unknown>,
  expectedType: GoodsCommandType
): string | null {
  if (typeof command.commandId !== "string" || !command.commandId.trim()) {
    return "commandId is required";
  }
  if (command.type !== expectedType) {
    return `command type must be ${expectedType}`;
  }
  if (typeof command.ownerUid !== "string" || !command.ownerUid.trim()) {
    return "ownerUid is required";
  }
  if (typeof command.ledgerId !== "string" || !command.ledgerId.trim()) {
    return "ledgerId is required";
  }
  if (typeof command.digest !== "string" || !command.digest.trim()) {
    return "command digest is required";
  }
  return null;
}

export function mutationBodyError(body: unknown): string | null {
  if (body == null || typeof body !== "object") return "command body is required";
  const record = body as { receiptId?: unknown; expectedVersion?: unknown; clientObservedAtUtc?: unknown };
  if (typeof record.receiptId !== "string" || !record.receiptId.trim()) return "receiptId is required";
  if (typeof record.expectedVersion !== "number" || !Number.isInteger(record.expectedVersion) || record.expectedVersion < 1) {
    return "expectedVersion must be a positive integer";
  }
  if (typeof record.clientObservedAtUtc !== "string" || !record.clientObservedAtUtc.trim()) {
    return "clientObservedAtUtc is required";
  }
  return null;
}

export function qcStatusError(value: unknown): string | null {
  if (typeof value !== "string" || !QC_STATUSES.has(value as QcStatus)) {
    return "qcStatus is invalid";
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

function nullableQuantityError(
  value: unknown,
  options: { label: string; requiredUnit?: string | null }
): string | null {
  if (value == null) return null;
  return quantityShapeError(value, { label: options.label, requiredUnit: options.requiredUnit });
}

function lineError(line: unknown, index: number): string | null {
  if (line == null || typeof line !== "object") return `line[${index}] is required`;
  const record = line as ReceiptLine;
  if (typeof record.lineId !== "string" || !record.lineId.trim()) return `line[${index}] lineId is required`;
  if (typeof record.description !== "string" || !record.description.trim()) {
    return `line[${index}] description is required`;
  }
  if (typeof record.unit !== "string" || !record.unit.trim()) return `line[${index}] unit is required`;
  const unit = record.unit;
  return (
    optionalTextError(`line[${index}].hsn`, record.hsn) ??
    optionalTextError(`line[${index}].invoiceLineRef`, record.invoiceLineRef) ??
    nullableQuantityError(record.invoiceQuantity, {
      label: `line[${index}].invoiceQuantity`,
      requiredUnit: unit,
    }) ??
    quantityShapeError(record.expectedOnThisDelivery, {
      label: `line[${index}].expectedOnThisDelivery`,
      requiredUnit: unit,
    }) ??
    quantityShapeError(record.physicallyReceived, {
      label: `line[${index}].physicallyReceived`,
      requiredUnit: unit,
    }) ??
    nullableQuantityError(record.grossWeight, { label: `line[${index}].grossWeight` }) ??
    nullableQuantityError(record.tareWeight, { label: `line[${index}].tareWeight` }) ??
    nullableQuantityError(record.netWeight, { label: `line[${index}].netWeight` }) ??
    optionalTextError(`line[${index}].weightUnit`, record.weightUnit) ??
    nullableQuantityError(record.packageCount, { label: `line[${index}].packageCount`, requiredUnit: unit }) ??
    (SHORTAGE.has(record.shortageOrExcess) ? null : `line[${index}] shortageOrExcess is invalid`) ??
    optionalTextError(`line[${index}].condition`, record.condition) ??
    (record.qcStatus == null || QC_STATUSES.has(record.qcStatus) ? null : `line[${index}] qcStatus is invalid`)
  );
}

function linesError(lines: unknown): string | null {
  if (!Array.isArray(lines) || lines.length === 0) return "at least one line is required";
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const err = lineError(lines[i], i);
    if (err) return err;
    const lineId = (lines[i] as ReceiptLine).lineId;
    if (seen.has(lineId)) return `duplicate lineId ${lineId}`;
    seen.add(lineId);
  }
  return null;
}

function registrationError(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("kind" in value)) {
    return "supplier registration is required";
  }
  const registration = value as SupplierRegistration;
  if (registration.kind === "registered") {
    if (typeof registration.gstin !== "string" || !registration.gstin.trim()) return "supplier gstin is empty";
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
    if (typeof money !== "object") return "supplierInvoiceValue is invalid";
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

function buyerError(value: unknown): string | null {
  if (!value || typeof value !== "object") return "buyer is required";
  const buyer = value as BuyerIdentitySnapshot;
  if (typeof buyer.legalName !== "string" || !buyer.legalName.trim()) return "buyer legalName is required";
  return optionalTextError("buyer.gstin", buyer.gstin) ?? optionalTextError("buyer.address", buyer.address);
}

function captureProvenanceError(value: unknown): string | null {
  if (typeof value !== "string" || !CAPTURE_PROVENANCES.has(value as CaptureProvenance)) {
    return "captureProvenance is invalid";
  }
  return null;
}

function originalDispositionError(value: unknown): string | null {
  if (typeof value !== "string" || !ORIGINAL_DISPOSITIONS.has(value as CustodyState)) {
    return "original receipt disposition is invalid";
  }
  return null;
}

function ewbLinkError(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("kind" in value)) return "ewb link is required";
  const link = value as EwbLink;
  if (link.kind === "present") {
    if (typeof link.ebn !== "string" || !link.ebn.trim()) return "ewb number is empty";
    return null;
  }
  if (link.kind === "none") return null;
  if (link.kind === "not_applicable" || link.kind === "unknown") {
    if (typeof link.reason !== "string" || !link.reason.trim()) return "ewb absence requires a reason";
    return null;
  }
  return "ewb link is invalid";
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

function domainFieldsError(input: {
  buyer: unknown;
  supplier: unknown;
  commercial: unknown;
  ewb: unknown;
  transport: unknown;
  lines: unknown;
  warehouse: OptionalText;
  locationBin: OptionalText;
  remarks: OptionalText;
  receivingEmployeeAttributed: OptionalText;
  qualityCheckedByAttributed: OptionalText;
  acknowledgement: unknown;
  custody: unknown;
}): string | null {
  return (
    buyerError(input.buyer) ??
    supplierError(input.supplier) ??
    commercialError(input.commercial) ??
    ewbLinkError(input.ewb) ??
    transportError(input.transport) ??
    originalDispositionError(input.custody) ??
    optionalTextError("warehouse", input.warehouse) ??
    optionalTextError("locationBin", input.locationBin) ??
    optionalTextError("remarks", input.remarks) ??
    optionalTextError("receivingEmployeeAttributed", input.receivingEmployeeAttributed) ??
    optionalTextError("qualityCheckedByAttributed", input.qualityCheckedByAttributed) ??
    acknowledgementError(input.acknowledgement) ??
    linesError(input.lines)
  );
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
  return linesError(input.lines);
}

export function registerBodyError(body: unknown): string | null {
  if (body == null || typeof body !== "object") return "register body is required";
  const record = body as RegisterGoodsReceiptBody;
  const envelope = issuedEnvelopeError(record);
  if (envelope) return envelope;
  if (typeof record.clientObservedAtUtc !== "string" || !record.clientObservedAtUtc.trim()) {
    return "clientObservedAtUtc is required";
  }
  return (
    captureProvenanceError(record.captureProvenance) ??
    domainFieldsError(record)
  );
}

export function effectiveRecordError(grin: ImmutableGrin): string | null {
  const envelope = issuedEnvelopeError(grin);
  if (envelope) return envelope;
  return domainFieldsError(grin);
}
