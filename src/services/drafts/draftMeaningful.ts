/**
 * Whether form values contain real user input worth saving as a draft.
 * Ignores factory defaults (dates, enums, empty strings).
 */

const SKIP_KEYS = new Set([
  "title",
  "entryDate",
  "paymentDate",
  "matterDate",
  "dueDate",
  "notes",
  "reminder",
  "followUpRequired",
  "matterType",
  "qualityStatus",
  "weightUnit",
  "freightType",
  "ccCopyInstruction",
  "includeBankDetailsInPdf",
  "linkedDispatchId",
  "linkedDispatchUpdatedAt",
  "paymentMode",
  "settlementStatus",
  "returnType",
  "linkedEntryIds",
]);

/** Default enum/string values pre-filled by forms — not user input. */
const FACTORY_DEFAULTS: Record<string, unknown> = {
  qualityStatus: "ok",
  weightUnit: "Kg",
  freightType: "to_pay",
  ccCopyInstruction: "not_attached",
  matterType: "other_note",
};

function hasPostalContent(values: Record<string, unknown>, prefix: string): boolean {
  const pin = values[`${prefix}Pin`];
  const line = values[`${prefix}Line`];
  const place = values[`${prefix}PlaceName`];
  if (typeof pin === "string" && pin.trim().length >= 4) return true;
  if (typeof line === "string" && line.trim().length > 0) return true;
  if (typeof place === "string" && place.trim().length > 0) return true;
  return false;
}

function isMeaningfulGps(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  const lat = Number(o.lat ?? o.latitude);
  const lng = Number(o.lng ?? o.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && (Math.abs(lat) > 1e-6 || Math.abs(lng) > 1e-6);
}

function isMeaningfulReminder(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const at = (raw as { at?: number }).at;
  return typeof at === "number" && at > 0;
}

/** True when the form has user-entered content worth saving as a draft. */
export function isDraftPayloadMeaningful(
  payload: Record<string, unknown> | null | undefined
): boolean {
  if (!payload || typeof payload !== "object") return false;

  if (Array.isArray(payload.linkedEntryIds) && payload.linkedEntryIds.length > 0) {
    return true;
  }

  if (isMeaningfulReminder(payload.reminder)) return true;

  for (const [key, raw] of Object.entries(payload)) {
    if (SKIP_KEYS.has(key)) continue;
    if (key in FACTORY_DEFAULTS && raw === FACTORY_DEFAULTS[key]) continue;
    if (key.endsWith("Pin") || key.endsWith("Line") || key.endsWith("District")) {
      if (typeof raw === "string" && raw.trim()) return true;
      continue;
    }
    if (key.endsWith("PlaceName") || key.endsWith("Locality") || key.endsWith("State")) {
      if (typeof raw === "string" && raw.trim()) return true;
      continue;
    }
    if (key.endsWith("DisplayLabel")) continue;
    if (raw == null || raw === "" || raw === false) continue;
    if (typeof raw === "number") {
      if (raw > 0) return true;
      continue;
    }
    if (typeof raw === "string" && raw.trim().length > 0) return true;
    if (Array.isArray(raw) && raw.length > 0) return true;
    if (typeof raw === "object" && isMeaningfulGps(raw)) return true;
  }

  if (hasPostalContent(payload, "deliveryTo")) return true;
  if (hasPostalContent(payload, "dispatchFrom")) return true;
  if (hasPostalContent(payload, "receivedAt")) return true;
  if (hasPostalContent(payload, "party")) return true;

  const textFields = [
    "amount",
    "givenToName",
    "purpose",
    "partyName",
    "supplierName",
    "invoiceNumber",
    "pendingAmount",
    "workDone",
    "issueProblem",
    "sitePlace",
    "staffName",
    "matterDetails",
    "materialName",
    "quantity",
    "unit",
    "dispatchLocation",
    "destination",
    "receivedLocation",
    "billNumber",
    "dispatchTitle",
    "lrGrNumber",
    "deliveryLocation",
    "dispatchFromLocation",
    "transporterName",
    "vehicleNumber",
    "clarificationContactName",
    "clarificationContactMobile",
    "remarks",
    "itemMaterial",
    "purposeSubject",
    "taxPeriod",
    "requestNote",
    "contactPerson",
    "professionalName",
    "professionalContact",
    "body",
    "subject",
    "bankAccountHolder",
    "bankName",
    "bankAccountNumber",
    "bankIfsc",
    "bankUpiId",
    "bankPaymentInstruction",
    "issueNote",
  ];
  for (const k of textFields) {
    const v = payload[k];
    if (typeof v === "string" && v.trim()) return true;
    if (typeof v === "number" && v > 0 && k === "amount") return true;
  }

  return false;
}
