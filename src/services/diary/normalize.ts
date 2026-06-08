/**
 * Deserialise stored diary rows into {@link BusinessEntry}.
 * Maps legacy V1 documents without `entryType` into `legacy` payloads.
 */

import type {
  AttachmentRef,
  BusinessEntry,
  BusinessEntryType,
  EntryLocation,
  EntryRecordStatus,
  EntrySource,
  PaymentBankDetails,
  PaymentRequestPayload,
} from "@/domain/businessEntry";
import type { RecordGpsLocation } from "@/domain/recordLocation";
import type { EntryReminder, GeoPoint, UEID } from "@/domain/types";
import { geoPointToRecordGps } from "@/utils/location/entryLocation";
import { normalizeDocumentHistory } from "@/services/documentHistory";
import { paymentBankDetailsHasContent } from "@/utils/businessEntry/paymentBankDetails";
import { parseINRInput } from "@/utils/money/inr";

function emptyPayload(type: BusinessEntryType): BusinessEntry["payload"] {
  switch (type) {
    case "letterhead_matter":
      return {
        letterheadDocumentId: null,
        subject: null,
        reference: null,
        body: "",
        closing: null,
        signerName: null,
        designation: null,
        place: null,
      };
    case "work_update_issue":
      return {
        workDone: null,
        issueProblem: null,
        sitePlace: null,
        quantityOutput: null,
        responsiblePerson: null,
        followUpRequired: false,
      };
    case "staff_matter":
      return {
        staffName: "",
        matterDetails: "",
        matterType: "other_note",
        actionRequired: null,
      };
    case "business_cash_given":
      return {
        amount: 0,
        givenToName: "",
        purpose: "",
        paymentDate: Date.now(),
        paymentMode: "",
        settlementStatus: "pending",
        contactMobile: null,
        businessRef: null,
        siteRef: null,
        expectedSettlementDate: null,
        remarks: null,
      };
    case "material_dispatched":
      return {
        partyName: "",
        materialName: "",
        quantity: 0,
        unit: "",
        invoiceChallan: null,
        vehicleNumber: null,
        transporter: null,
        lrGrNumber: null,
        dispatchLocation: null,
        destination: null,
        expectedDeliveryDate: null,
        remarks: null,
      };
    case "material_received":
      return {
        supplierName: "",
        materialName: "",
        quantity: 0,
        unit: "",
        invoiceBill: null,
        vehicleNumber: null,
        receivedLocation: null,
        checkedBy: null,
        qualityStatus: "ok",
        issueNote: null,
        paymentFollowUp: false,
      };
    case "material_return":
      return {
        partyName: "",
        materialName: "",
        quantity: 0,
        unit: "",
        returnReason: "",
        fromLocation: null,
        toLocation: null,
        lrGrNumber: null,
        vehicleNumber: null,
        transporter: null,
        remarks: null,
      };
    case "reminder_purchase":
      return {
        itemMaterial: "",
        requiredQuantity: null,
        requiredByDate: null,
        vendor: null,
        estimatedAmount: null,
        priority: null,
      };
    case "reminder_email":
      return {
        purposeSubject: "",
        recipientName: null,
        recipientEmail: null,
        relatedMatter: null,
        draftNotes: null,
      };
    case "reminder_gst_return":
      return {
        returnType: "gstr3b",
        taxPeriod: "",
        dueDate: Date.now(),
        gstin: null,
        businessName: null,
        complianceNote: null,
      };
    case "payment_request":
      return {
        partyName: "",
        invoiceNumber: "",
        invoiceDate: null,
        pendingAmount: 0,
        dueDate: null,
        contactPerson: null,
        requestNote: "",
        includeBankDetailsInPdf: false,
        bankDetails: null,
      } as import("@/domain/businessEntry").PaymentRequestPayload;
    case "outward_freight_details":
      return {
        dispatchTitle: null,
        billNumber: "",
        billDate: null,
        lrGrNumber: null,
        deliveryLocation: "",
        dispatchFromLocation: null,
        totalBoxes: 0,
        totalWeight: 0,
        weightUnit: "Kg",
        freightType: "to_pay",
        transporterName: null,
        vehicleNumber: null,
        ccCopyInstruction: "not_attached",
        clarificationContactName: "",
        clarificationContactMobile: "",
        remarks: null,
        partyName: null,
        materialName: null,
        linkedDispatchId: null,
        linkedDispatchUpdatedAt: null,
      } as import("@/domain/businessEntry").OutwardFreightPayload;
    case "legacy":
    default:
      return {
        category: "other",
        quantity: null,
        issue: null,
        tags: [],
        locationName: null,
        geo: null,
      };
  }
}

function parseGeo(raw: unknown): GeoPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  return {
    latitude: Number(g.latitude),
    longitude: Number(g.longitude),
    accuracy: g.accuracy == null ? null : Number(g.accuracy),
    capturedAt: Number(g.capturedAt ?? Date.now()),
  };
}

function parseReminder(raw: unknown): EntryReminder | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    at: Number(r.at),
    note: String(r.note ?? ""),
    notificationId: r.notificationId == null ? null : String(r.notificationId),
  };
}

function parseRecordGps(raw: unknown): RecordGpsLocation | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const lat = Number(g.latitude);
  const lng = Number(g.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const capturedRaw = g.capturedAt;
  const capturedAt =
    typeof capturedRaw === "string"
      ? capturedRaw
      : new Date(Number(capturedRaw ?? Date.now())).toISOString();
  const source = g.source === "manual" ? "manual" : "device";
  const snap = g.permissionSnapshot;
  const permissionSnapshot =
    snap === "granted" || snap === "denied" || snap === "limited" || snap === "unknown"
      ? snap
      : undefined;
  return {
    latitude: lat,
    longitude: lng,
    accuracy: g.accuracy == null ? null : Number(g.accuracy),
    addressLabel: typeof g.addressLabel === "string" ? g.addressLabel : null,
    capturedAt,
    source,
    permissionSnapshot,
  };
}

function parseLocation(r: Record<string, unknown>): EntryLocation | null {
  if (r.location && typeof r.location === "object") {
    const loc = r.location as Record<string, unknown>;
    const gps = parseRecordGps(loc.gps);
    const geo = parseGeo(loc.geo) ?? (gps ? { latitude: gps.latitude, longitude: gps.longitude, accuracy: gps.accuracy ?? null, capturedAt: Date.parse(gps.capturedAt) || Date.now() } : null);
    const name = typeof loc.name === "string" ? loc.name : null;
    if (!name && !geo && !gps) return null;
    return {
      name,
      geo,
      gps: gps ?? (geo ? geoPointToRecordGps(geo, { addressLabel: name, source: "device" }) : null),
    };
  }
  const name =
    typeof r.locationName === "string"
      ? r.locationName
      : typeof r.location === "string"
        ? (r.location as string)
        : null;
  const geo = parseGeo(r.geo);
  if (!name && !geo) return null;
  return {
    name,
    geo,
    gps: geo ? geoPointToRecordGps(geo, { addressLabel: name, source: "device" }) : null,
  };
}

function coercePaymentPayload(raw: Record<string, unknown>): PaymentRequestPayload {
  const partyName = String(raw.partyName ?? "").trim();
  const invoiceNumber = String(raw.invoiceNumber ?? "").trim();
  const pendingAmount =
    parseINRInput(raw.pendingAmount) ?? (Number(raw.pendingAmount) || 0);
  const requestNote =
    typeof raw.requestNote === "string" && raw.requestNote.trim()
      ? raw.requestNote.trim()
      : "";
  let includeBank = Boolean(raw.includeBankDetailsInPdf);
  let bankDetails: PaymentBankDetails | null = null;
  if (includeBank && raw.bankDetails && typeof raw.bankDetails === "object") {
    const b = raw.bankDetails as Record<string, unknown>;
    bankDetails = {
      accountHolderName: String(b.accountHolderName ?? "").trim(),
      bankName: String(b.bankName ?? "").trim(),
      accountNumber: String(b.accountNumber ?? "").trim(),
      ifsc: String(b.ifsc ?? "")
        .trim()
        .toUpperCase(),
      upiId:
        typeof b.upiId === "string" && b.upiId.trim() ? b.upiId.trim() : null,
      paymentInstruction:
        typeof b.paymentInstruction === "string" && b.paymentInstruction.trim()
          ? b.paymentInstruction.trim()
          : null,
    };
    if (!paymentBankDetailsHasContent(bankDetails)) {
      includeBank = false;
      bankDetails = null;
    }
  } else {
    includeBank = false;
    bankDetails = null;
  }
  return {
    partyName,
    invoiceNumber,
    invoiceDate: raw.invoiceDate == null ? null : Number(raw.invoiceDate),
    pendingAmount,
    dueDate: raw.dueDate == null ? null : Number(raw.dueDate),
    contactPerson:
      typeof raw.contactPerson === "string" && raw.contactPerson.trim()
        ? raw.contactPerson.trim()
        : null,
    requestNote,
    includeBankDetailsInPdf: includeBank,
    includePaymentPeriodInPdf: Boolean(raw.includePaymentPeriodInPdf),
    bankDetails,
  };
}

function parsePayload(
  entryType: BusinessEntryType,
  raw: unknown,
  legacy: Record<string, unknown>
): BusinessEntry["payload"] {
  const base = emptyPayload(entryType);
  if (!raw || typeof raw !== "object") {
    if (entryType === "legacy") {
      return {
        category: String(legacy.category ?? "other"),
        quantity: typeof legacy.quantity === "string" ? legacy.quantity : null,
        issue: typeof legacy.issue === "string" ? legacy.issue : null,
        tags: Array.isArray(legacy.tags) ? (legacy.tags as string[]) : [],
        locationName:
          typeof legacy.locationName === "string"
            ? legacy.locationName
            : typeof legacy.location === "string"
              ? (legacy.location as string)
              : null,
        geo: parseGeo(legacy.geo),
      };
    }
    return base;
  }
  const p = raw as Record<string, unknown>;
  if (entryType === "payment_request") {
    return coercePaymentPayload({
      ...(base as unknown as Record<string, unknown>),
      ...p,
    });
  }
  if (entryType === "business_cash_given") {
    const merged = { ...base, ...p } as import("@/domain/businessEntry").BusinessCashGivenPayload;
    const fallbackDate = Number(legacy.entryDate ?? 0);
    if (!merged.paymentDate || merged.paymentDate <= 0) {
      merged.paymentDate = fallbackDate > 0 ? fallbackDate : Date.now();
    }
    if (!merged.paymentMode) merged.paymentMode = "Cash";
    if (!merged.settlementStatus) merged.settlementStatus = "pending";
    return merged;
  }
  return { ...base, ...p } as BusinessEntry["payload"];
}

export function normaliseBusinessEntry(
  raw: unknown,
  fallbackUeid: UEID = "VYD-0000-000000"
): BusinessEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string") return null;

  const entryType = (r.entryType as BusinessEntryType) ?? "legacy";
  const ueid = typeof r.ueid === "string" ? (r.ueid as UEID) : fallbackUeid;

  return {
    id: r.id,
    userId: String(r.userId ?? ""),
    ueid,
    entryType,
    title: String(r.title ?? ""),
    entryDate: Number(r.entryDate ?? Date.now()),
    createdAt: Number(r.createdAt ?? Date.now()),
    updatedAt: Number(r.updatedAt ?? Date.now()),
    source: (r.source as EntrySource) ?? "legacy",
    status: (r.status as EntryRecordStatus) ?? "active",
    notes: typeof r.notes === "string" && r.notes.trim() ? r.notes.trim() : null,
    reminder: parseReminder(r.reminder),
    location: parseLocation(r),
    attachments: Array.isArray(r.attachments)
      ? (r.attachments as AttachmentRef[]).filter((a) => a && typeof a.id === "string")
      : [],
    payload: parsePayload(entryType, r.payload, r),
    pdfUri: typeof r.pdfUri === "string" ? r.pdfUri : null,
    documentHistory: normalizeDocumentHistory(r.documentHistory),
    deletedAt: r.deletedAt == null ? null : Number(r.deletedAt),
  };
}

export function entryToStorage(entry: BusinessEntry): Record<string, unknown> {
  return {
    id: entry.id,
    userId: entry.userId,
    ueid: entry.ueid,
    entryType: entry.entryType,
    title: entry.title,
    entryDate: entry.entryDate,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    source: entry.source,
    status: entry.status,
    notes: entry.notes,
    reminder: entry.reminder,
    location: entry.location,
    attachments: entry.attachments,
    payload: entry.payload,
    pdfUri: entry.pdfUri,
    documentHistory: entry.documentHistory,
    deletedAt: entry.deletedAt,
  };
}
