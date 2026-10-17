import type {
  FrozenCommand,
  GoodsCommandType,
  LinkVerifiedEvidenceBody,
  RecordEwbObservationBody,
  RegisterGoodsReceiptBody,
} from "./command";
import { quantityShapeError } from "./quantities";
import type { EwbLink } from "./ewb";
import type { VerifiedEvidenceResult } from "./ports";
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
const CAPTURE_PROVENANCES = new Set<CaptureProvenance>([
  "online",
  "offline",
  "late_entry",
  "unknown",
]);
const ARRIVAL_PRECISIONS = new Set(["unknown", "date", "instant"]);
const SHORTAGE = new Set(["shortage", "excess", "none", "unknown"]);

export function isAmendableGrinField(key: string): key is AmendableGrinField {
  return (AMENDABLE_GRIN_FIELDS as readonly string[]).includes(key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, label: string): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return `${label} is required`;
  return null;
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
  if (!isPlainObject(command)) return "command is required";
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
  if (!isPlainObject(body)) return "command body is required";
  if (typeof body.receiptId !== "string" || !body.receiptId.trim()) return "receiptId is required";
  if (typeof body.expectedVersion !== "number" || !Number.isInteger(body.expectedVersion) || body.expectedVersion < 1) {
    return "expectedVersion must be a positive integer";
  }
  if (typeof body.clientObservedAtUtc !== "string" || !body.clientObservedAtUtc.trim()) {
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
  if (!isPlainObject(value)) return `${label} is required`;
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
  if (!isPlainObject(line)) return `line[${index}] is required`;
  const record = line as unknown as ReceiptLine;
  if (typeof record.lineId !== "string" || !record.lineId.trim()) return `line[${index}] lineId is required`;
  if (record.lineId === "__proto__" || record.lineId === "constructor" || record.lineId === "prototype") {
    return `line[${index}] lineId is not a valid line identity`;
  }
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
    weightFieldsError(record, index) ??
    packageCountError(record.packageCount, index) ??
    (typeof record.shortageOrExcess === "string" && SHORTAGE.has(record.shortageOrExcess)
      ? null
      : `line[${index}] shortageOrExcess is invalid`) ??
    optionalTextError(`line[${index}].condition`, record.condition) ??
    (record.qcStatus == null || QC_STATUSES.has(record.qcStatus) ? null : `line[${index}] qcStatus is invalid`)
  );
}

/**
 * Material quantity, weight and package count are separate measures.
 * physicallyReceived/expected/invoice quantities share the line material unit.
 * Package count is a nonnegative whole count of packages (bags, drums, cartons)
 * and is not converted into the material unit.
 * When any of gross/tare/net is supplied, all supplied weights must share one
 * unit; a present weightUnit must equal that unit. Bags are never treated as kg.
 */
function weightFieldsError(record: ReceiptLine, index: number): string | null {
  const weightUnitErr = optionalTextError(`line[${index}].weightUnit`, record.weightUnit);
  if (weightUnitErr) return weightUnitErr;
  const named = [
    ["grossWeight", record.grossWeight],
    ["tareWeight", record.tareWeight],
    ["netWeight", record.netWeight],
  ] as const;
  const supplied: { name: string; unit: string }[] = [];
  for (const [name, value] of named) {
    if (value == null) continue;
    const err = quantityShapeError(value, { label: `line[${index}].${name}` });
    if (err) return err;
    supplied.push({ name, unit: (value as { unit: string }).unit });
  }
  if (supplied.length === 0) return null;
  const units = new Set(supplied.map((item) => item.unit));
  if (units.size > 1) return `line[${index}] supplied weight units are inconsistent`;
  const weightQtyUnit = supplied[0]!.unit;
  if (record.weightUnit.kind === "present" && record.weightUnit.value !== weightQtyUnit) {
    return `line[${index}] weightUnit does not match supplied weights`;
  }
  return null;
}

function packageCountError(value: unknown, index: number): string | null {
  if (value == null) return null;
  return quantityShapeError(value, {
    label: `line[${index}].packageCount`,
    wholeCount: true,
  });
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
  if (!isPlainObject(value) || !("kind" in value)) {
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
  if (!isPlainObject(value)) return "supplier is required";
  const supplier = value as unknown as SupplierSnapshot;
  return (
    optionalTextError("supplier.name", supplier.name) ??
    optionalTextError("supplier.address", supplier.address) ??
    optionalTextError("supplier.contact", supplier.contact) ??
    registrationError(supplier.registration)
  );
}

function transportError(value: unknown): string | null {
  if (!isPlainObject(value)) return "transport is required";
  const transport = value as unknown as TransportSnapshot;
  return (
    optionalTextError("transport.vehicleNumber", transport.vehicleNumber) ??
    optionalTextError("transport.transporterName", transport.transporterName) ??
    optionalTextError("transport.transporterId", transport.transporterId) ??
    optionalTextError("transport.lrNumber", transport.lrNumber) ??
    optionalTextError("transport.mode", transport.mode)
  );
}

function commercialError(value: unknown): string | null {
  if (!isPlainObject(value)) return "commercial is required";
  const commercial = value as unknown as CommercialLinks;
  const money = commercial.supplierInvoiceValue;
  if (money != null) {
    if (!isPlainObject(money)) return "supplierInvoiceValue is invalid";
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
  if (!isPlainObject(value)) return "acknowledgement is required";
  const acknowledgement = value as unknown as AcknowledgementState;
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
  if (!isPlainObject(value)) return "buyer is required";
  const buyer = value as unknown as BuyerIdentitySnapshot;
  if (typeof buyer.legalName !== "string" || !buyer.legalName.trim()) return "buyer legalName is required";
  return optionalTextError("buyer.gstin", buyer.gstin) ?? optionalTextError("buyer.address", buyer.address);
}

function captureProvenanceError(value: unknown): string | null {
  if (typeof value !== "string" || !CAPTURE_PROVENANCES.has(value as CaptureProvenance)) {
    return "captureProvenance is invalid";
  }
  return null;
}

function isValidCalendarYmd(raw: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function arrivalPrecisionError(body: Record<string, unknown>): string | null {
  if (!("reportedArrivalPrecision" in body) || body.reportedArrivalPrecision == null) {
    return null; // legacy dual-read
  }
  if (
    typeof body.reportedArrivalPrecision !== "string" ||
    !ARRIVAL_PRECISIONS.has(body.reportedArrivalPrecision)
  ) {
    return "reportedArrivalPrecision is invalid";
  }
  const arrival =
    typeof body.reportedArrivalAt === "string" ? body.reportedArrivalAt.trim() : "";
  if (!arrival) return "reportedArrivalAt is required";
  if (body.reportedArrivalPrecision === "date" && !isValidCalendarYmd(arrival)) {
    return "reportedArrivalAt date is invalid";
  }
  if (body.reportedArrivalPrecision === "instant") {
    const ms = Date.parse(arrival);
    if (!Number.isFinite(ms)) return "reportedArrivalAt instant is invalid";
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
  if (!isPlainObject(value) || !("kind" in value)) return "ewb link is required";
  const link = value as unknown as EwbLink;
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

export function issuedEnvelopeError(input: unknown): string | null {
  if (!isPlainObject(input)) return "issued envelope is required";
  return (
    requiredString(input.receiptId, "receiptId") ??
    requiredString(input.series, "series") ??
    requiredString(input.capturedAtClientUtc, "capturedAtClientUtc") ??
    requiredString(input.reportedArrivalAt, "reportedArrivalAt") ??
    requiredString(input.reportedArrivalTimeZone, "reportedArrivalTimeZone") ??
    optionalTextError("warehouse", input.warehouse as OptionalText) ??
    optionalTextError("locationBin", input.locationBin as OptionalText) ??
    linesError(input.lines)
  );
}

export function registerBodyError(body: unknown): string | null {
  if (!isPlainObject(body)) return "register body is required";
  const envelope = issuedEnvelopeError(body);
  if (envelope) return envelope;
  if (typeof body.clientObservedAtUtc !== "string" || !body.clientObservedAtUtc.trim()) {
    return "clientObservedAtUtc is required";
  }
  return (
    captureProvenanceError(body.captureProvenance) ??
    arrivalPrecisionError(body) ??
    domainFieldsError(body as unknown as RegisterGoodsReceiptBody)
  );
}

export function effectiveRecordError(grin: ImmutableGrin): string | null {
  const envelope = issuedEnvelopeError(grin);
  if (envelope) return envelope;
  return domainFieldsError(grin);
}

const EWB_CHANNELS = new Set(["portal", "movement", "qc", "replacement"]);
const SHA256_HEX = /^[a-f0-9]{64}$/;

export function recordEwbObservationBodyError(body: unknown): string | null {
  const base = mutationBodyError(body);
  if (base) return base;
  const record = body as Partial<RecordEwbObservationBody>;
  if (typeof record.channel !== "string" || !EWB_CHANNELS.has(record.channel)) {
    return "ewb observation channel is invalid";
  }
  if (record.observation == null) return "ewb observation is required";
  return null;
}

export function verifiedEvidenceResultShapeError(value: unknown): string | null {
  if (!isPlainObject(value)) return "verified evidence result is required";
  const record = value as Partial<VerifiedEvidenceResult>;
  const strings: Array<keyof VerifiedEvidenceResult> = [
    "evidenceId",
    "ownerUid",
    "ledgerId",
    "receiptId",
    "category",
    "mime",
    "rawSha256",
    "storagePath",
    "generation",
    "verifiedAtUtc",
  ];
  for (const key of strings) {
    if (typeof record[key] !== "string" || !(record[key] as string).trim()) {
      return "verified evidence result is invalid";
    }
  }
  if (typeof record.byteSize !== "number" || !Number.isInteger(record.byteSize) || record.byteSize < 0) {
    return "verified evidence result is invalid";
  }
  if (!SHA256_HEX.test(record.rawSha256 as string)) return "verified evidence result is invalid";
  return null;
}

export function verifiedEvidenceIdentityError(
  value: VerifiedEvidenceResult,
  expected: { ownerUid: string; ledgerId: string; receiptId: string }
): string | null {
  if (
    value.ownerUid !== expected.ownerUid ||
    value.ledgerId !== expected.ledgerId ||
    value.receiptId !== expected.receiptId
  ) {
    return "verified evidence result does not match this receipt";
  }
  return null;
}

export function linkVerifiedEvidenceBodyError(body: unknown): string | null {
  const base = mutationBodyError(body);
  if (base) return base;
  const record = body as Partial<LinkVerifiedEvidenceBody>;
  return verifiedEvidenceResultShapeError(record.verified);
}
