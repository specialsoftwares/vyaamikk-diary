/**
 * Purchase Order domain model.
 *
 * A Purchase Order is an official business document with an app-generated,
 * per-user, monotonic serial number (VYD-PO-0001). Serial numbers are never
 * reused: cancelling or deleting a PO does not free its number.
 */

export const PO_NUMBER_PREFIX = "VYD-PO-";

/** Format a numeric serial into the documented PO number, e.g. 1 → "VYD-PO-0001". */
export function formatPoNumber(serial: number): string {
  const safe = Math.max(1, Math.floor(serial));
  return `${PO_NUMBER_PREFIX}${String(safe).padStart(4, "0")}`;
}

export type PurchaseOrderStatus = "active" | "cancelled";

/** Item unit dropdown options (kept short + business-friendly). */
export const PO_UNIT_OPTIONS = [
  "Pcs",
  "Kgs",
  "Bags",
  "Boxes",
  "Bori",
  "Units",
  "Meter",
  "Litre",
  "Set",
  "Pair",
  "Nos",
  "Other",
] as const;

/** Standard GST rate options (percent). "Custom" is handled in the form. */
export const PO_GST_RATES = [0, 5, 12, 18, 28] as const;

export const PO_MAX_DESCRIPTION_LINES = 5;
export const PO_DESCRIPTION_LINE_MAX = 90;

/** Whether the user wants tax shown on this PO. */
export type PoTaxApplicability = "none" | "applicable" | "as_applicable";

export interface PurchaseOrderItem {
  /** Mandatory item name. */
  itemName: string;
  /** Up to 5 optional description lines (each ≤ 90 chars). */
  descriptionLines?: string[];
  quantity: number;
  unit?: string | null;
  rate: number;
  /** Optional per-item GST rate (%); falls back to the PO-level rate. */
  taxRate?: number | null;
  /** quantity * rate (pre-tax line amount), stored for display stability. */
  amount: number;
  /** @deprecated legacy single-line description — read for backward compat. */
  description?: string | null;
}

/** Convenience: an item's display name (new field, legacy fallback). */
export function itemDisplayName(it: PurchaseOrderItem): string {
  return (it.itemName ?? it.description ?? "").trim();
}

/** Internal-only edit/generation event (some of this may be shown on the PDF). */
export interface PurchaseOrderEditHistoryEntry {
  version: number;
  at: number;
  action: "created" | "edited" | "cancelled";
}

export interface PurchaseOrder {
  id: string;
  userId: string;
  ueid: string;

  /** Monotonic per-user serial — never reused. */
  serial: number;
  /** Display PO number derived from `serial`. */
  poNumber: string;
  status: PurchaseOrderStatus;

  /** User-chosen PO date (today … 7 days back). */
  poDate: number;

  // Vendor / supplier
  vendorName: string;
  vendorGstin?: string | null;
  vendorAddress?: string | null;
  vendorPin?: string | null;
  vendorState?: string | null;
  vendorContactName?: string | null;
  vendorContactPhone?: string | null;
  vendorContactEmail?: string | null;

  // Buyer / Order To (defaults from profile, editable)
  buyerName: string;
  buyerAddress?: string | null;
  buyerGstin?: string | null;
  buyerPin?: string | null;
  buyerState?: string | null;
  authorizedBy?: string | null;
  authorizedDesignation?: string | null;

  // Shipping (separate from buyer; may mirror buyer)
  shipSameAsBuyer?: boolean;
  shipName?: string | null;
  shipAddress?: string | null;
  shipPin?: string | null;
  shipState?: string | null;
  shipContact?: string | null;

  // Delivery
  deliveryLocation?: string | null;
  billingLocation?: string | null;
  expectedDeliveryDate?: number | null;

  // Tax
  taxApplicable?: PoTaxApplicability;
  /** PO-level GST rate (%) when tax is applicable. */
  gstRate?: number | null;

  // Branding
  /** Place the profile/company logo at the top of the PO PDF. */
  useLogo?: boolean;

  // Items + money (INR)
  items: PurchaseOrderItem[];
  total: number;

  // Optional commercial fields
  deliveryTerms?: string | null;
  paymentTerms?: string | null;
  freightTerms?: string | null;
  referenceNumber?: string | null;
  notes?: string | null;
  /** User-configurable Terms & Conditions text. */
  terms?: string | null;

  /** Best-effort device-local URI of the most recently generated PDF. */
  pdfUri?: string | null;

  // Internal edit tracking
  firstGeneratedAt: number;
  lastEditedAt?: number | null;
  version: number;
  editHistory: PurchaseOrderEditHistoryEntry[];
  cancelledAt?: number | null;

  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
  /** Multi-step save progress — coordination only, no PII. */
  completedSteps?: string[];
}

/** Sum line-item amounts (each amount = qty * rate). */
export function computePurchaseOrderTotal(items: PurchaseOrderItem[]): number {
  return items.reduce((sum, it) => sum + (Number.isFinite(it.amount) ? it.amount : 0), 0);
}

export interface PoTaxSummary {
  subtotal: number;
  taxAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  /** true = intra-state (CGST+SGST), false = inter-state (IGST), null = unknown. */
  intraState: boolean | null;
  grandTotal: number;
  /** PO-level rate used (when uniform), else null. */
  effectiveRate: number | null;
}

/** First two digits of a state code (from a GSTIN state code string). */
function leadCode(value?: string | null): string | null {
  const v = (value ?? "").trim();
  return /^\d{2}/.test(v) ? v.slice(0, 2) : null;
}

/**
 * Compute the PO money summary including optional GST.
 *
 * Tax is only applied when `taxApplicable === "applicable"` and a rate exists.
 * CGST/SGST vs IGST is inferred only when BOTH party state codes are known
 * (from their GSTINs); otherwise the tax is reported as a single GST amount.
 */
export function computePurchaseOrderTax(
  po: Pick<
    PurchaseOrder,
    "items" | "taxApplicable" | "gstRate" | "vendorGstin" | "buyerGstin"
  >
): PoTaxSummary {
  const subtotal = computePurchaseOrderTotal(po.items);
  const applicable = po.taxApplicable === "applicable";
  const baseRate = applicable ? po.gstRate ?? null : null;

  if (!applicable || baseRate == null) {
    return {
      subtotal,
      taxAmount: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      intraState: null,
      grandTotal: subtotal,
      effectiveRate: null,
    };
  }

  const taxAmount = po.items.reduce((sum, it) => {
    const rate = it.taxRate != null && Number.isFinite(it.taxRate) ? it.taxRate : baseRate;
    const amt = Number.isFinite(it.amount) ? it.amount : 0;
    return sum + (amt * rate) / 100;
  }, 0);

  const vendorCode = leadCode(po.vendorGstin);
  const buyerCode = leadCode(po.buyerGstin);
  let intraState: boolean | null = null;
  if (vendorCode && buyerCode) intraState = vendorCode === buyerCode;

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  if (intraState === true) {
    cgst = taxAmount / 2;
    sgst = taxAmount / 2;
  } else if (intraState === false) {
    igst = taxAmount;
  }

  return {
    subtotal,
    taxAmount,
    cgst,
    sgst,
    igst,
    intraState,
    grandTotal: subtotal + taxAmount,
    effectiveRate: baseRate,
  };
}

const ONE_DAY_MS = 86_400_000;

/** Max days a PO date may be backdated. */
export const PO_MAX_BACKDATE_DAYS = 7;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/**
 * PO date policy: today or up to 7 days in the past. No future dates, nothing
 * older than 7 days. (The app-recorded created date is separate + immutable.)
 */
export function isPoDateAllowed(ms: number, now = Date.now()): boolean {
  const latest = endOfDay(now);
  const earliest = startOfDay(now) - PO_MAX_BACKDATE_DAYS * ONE_DAY_MS;
  return ms <= latest && ms >= earliest;
}

/** Default, editable standard PO terms (kept short — not a legal disclaimer). */
export const DEFAULT_PO_TERMS = [
  "1. Goods/services must match the description, quantity and rate stated above.",
  "2. Please quote this PO number on all invoices, challans and correspondence.",
  "3. Delivery as per the agreed schedule; notify us promptly of any delay.",
  "4. Invoices are payable as per the agreed payment terms after acceptance.",
].join("\n");
