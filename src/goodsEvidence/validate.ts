import type { RegisterGoodsReceiptBody } from "./command";
import type { OptionalText, ReceiptLine } from "./types";

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

function optionalTextError(label: string, value: OptionalText | undefined): string | null {
  if (!value) return `${label} is required`;
  if (value.kind === "present" && !value.value.trim()) return `${label} value is empty`;
  if (value.kind === "unknown" && !value.reason.trim()) return `${label} unknown reason is empty`;
  return null;
}

function lineError(line: ReceiptLine, index: number): string | null {
  if (!line.lineId?.trim()) return `line[${index}] lineId is required`;
  if (!line.description?.trim()) return `line[${index}] description is required`;
  if (!line.unit?.trim()) return `line[${index}] unit is required`;
  if (!line.physicallyReceived) return `line[${index}] physicallyReceived is required`;
  if (!line.expectedOnThisDelivery) return `line[${index}] expectedOnThisDelivery is required`;
  return null;
}

export function registerBodyError(body: RegisterGoodsReceiptBody): string | null {
  if (!body.receiptId?.trim()) return "receiptId is required";
  if (!body.series?.trim()) return "series is required";
  if (!body.capturedAtClientUtc?.trim()) return "capturedAtClientUtc is required";
  if (!body.reportedArrivalAt?.trim()) return "reportedArrivalAt is required";
  if (!body.reportedArrivalTimeZone?.trim()) return "reportedArrivalTimeZone is required";
  if (!body.buyer?.legalName?.trim()) return "buyer legalName is required";
  const warehouse = optionalTextError("warehouse", body.warehouse);
  if (warehouse) return warehouse;
  const location = optionalTextError("locationBin", body.locationBin);
  if (location) return location;
  if (!Array.isArray(body.lines) || body.lines.length === 0) return "at least one line is required";
  for (let i = 0; i < body.lines.length; i++) {
    const err = lineError(body.lines[i]!, i);
    if (err) return err;
  }
  return null;
}
