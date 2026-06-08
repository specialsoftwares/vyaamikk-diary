/**
 * Customer Credit / EMI Record domain model.
 *
 * IMPORTANT — product boundary: this is a *record-keeping* feature only. It is
 * NOT lending, an NBFC, a loan/credit product, KYC verification, or debt
 * recovery software. A shop owner uses it to keep clean customer-wise history of
 * what was sold (cash / credit / shop-managed instalments / external finance),
 * the instalment schedule, payments received and the pending balance.
 *
 * Each record has an app-generated, per-user, monotonic serial number
 * (VYD-CR-0001). Serial numbers are never reused: cancelling or deleting a
 * record does not free its number.
 */

export const CREDIT_NUMBER_PREFIX = "VYD-CR-";

/** Format a numeric serial into the documented record number, e.g. 1 → "VYD-CR-0001". */
export function formatCreditNumber(serial: number): string {
  const safe = Math.max(1, Math.floor(serial));
  return `${CREDIT_NUMBER_PREFIX}${String(safe).padStart(4, "0")}`;
}

/** How the sale was paid for. */
export type CustomerCreditMode =
  | "cash"
  | "credit"
  | "shop_emi"
  | "external_finance"
  | "mixed";

export const CUSTOMER_CREDIT_MODES: CustomerCreditMode[] = [
  "cash",
  "credit",
  "shop_emi",
  "external_finance",
  "mixed",
];

/** Lifecycle status of a record (close / settlement states included). */
export type CustomerCreditStatus =
  | "active"
  | "fully_paid"
  | "cancelled"
  | "written_off"
  | "external_completed";

/** EMI cadence for shop-managed instalments. */
export type EmiFrequency = "monthly" | "weekly" | "custom";

/** Per-instalment derived status. */
export type InstallmentStatus =
  | "upcoming"
  | "due_today"
  | "overdue"
  | "paid"
  | "partial";

/** How a received payment was tendered. */
export type CreditPaymentMode =
  | "cash"
  | "upi"
  | "card"
  | "bank_transfer"
  | "finance_company"
  | "cheque"
  | "other";

export const CREDIT_PAYMENT_MODES: CreditPaymentMode[] = [
  "cash",
  "upi",
  "card",
  "bank_transfer",
  "finance_company",
  "cheque",
  "other",
];

/**
 * Interest / charges model. Supports a fixed amount, percentage-based interest,
 * a processing fee (percent or amount, upfront or financed), or a custom charge.
 * All figures are user-entered / finance-company-provided — never app-certified.
 */
export type CreditChargesMode =
  | "none"
  | "fixed"
  | "interest_pct"
  | "processing_pct"
  | "interest_plus_processing"
  | "custom";

export const CREDIT_CHARGES_MODES: CreditChargesMode[] = [
  "none",
  "fixed",
  "interest_pct",
  "processing_pct",
  "interest_plus_processing",
  "custom",
];

/** Base on which a percentage charge is computed. */
export type ChargesBase = "principal" | "sale";

export interface CreditChargesConfig {
  mode: CreditChargesMode;
  /** % calculation base; defaults to "principal" (balance after down payment). */
  base?: ChargesBase | null;
  fixedAmount?: number | null;
  fixedLabel?: string | null;
  interestPercent?: number | null;
  processingPercent?: number | null;
  /** Processing fee entered directly as an amount (takes precedence over %). */
  processingAmount?: number | null;
  /** When true, the processing fee is collected upfront (not folded into EMIs). */
  processingUpfront?: boolean;
  customLabel?: string | null;
  customAmount?: number | null;
  /** Figures were provided by an external finance company (not app-certified). */
  financeProvided?: boolean;
  /** When the user cannot compute charges, the financed total can be entered directly. */
  manualChargesAmount?: number | null;
  manualEntered?: boolean;
}

/** ID document type attached to a customer record (record-keeping, NOT KYC). */
export type CustomerDocumentType =
  | "aadhaar"
  | "pan"
  | "driving_licence"
  | "voter_id"
  | "passport"
  | "other";

export const CUSTOMER_DOCUMENT_TYPES: CustomerDocumentType[] = [
  "aadhaar",
  "pan",
  "driving_licence",
  "voter_id",
  "passport",
  "other",
];

/** Device-local reference to an optional, consent-based customer photo. */
export interface CustomerPhotoRef {
  localUri: string;
  mimeType: string;
  updatedAt: number;
  width?: number | null;
  height?: number | null;
}

export const CREDIT_MAX_PRODUCTS = 10;
export const CREDIT_MAX_BACKDATE_DAYS = 15;
export const CREDIT_MAX_INSTALMENTS = 120;

/** A product/service sold under this record (multiple products allowed). */
export interface CustomerCreditProduct {
  productName: string;
  brandModel?: string | null;
  /** Serial number / IMEI — recommended for electronics. Operational, not an ID doc. */
  serialImei?: string | null;
  saleAmount: number;
  invoiceNumber?: string | null;
}

/** A single planned instalment in a shop-managed EMI schedule. */
export interface EmiInstallment {
  /** 1-based sequence. */
  seq: number;
  dueDate: number;
  amount: number;
}

/** A payment received from the customer (ledger entry). */
export interface CreditPaymentEntry {
  id: string;
  amount: number;
  paidDate: number;
  mode: CreditPaymentMode;
  reference?: string | null;
  note?: string | null;
  createdAt: number;
}

/** Who made the final payment at closure (record-keeping only). */
export type CreditPaidBy = "customer" | "family" | "business_rep" | "other";

/** How the final amount differed from the outstanding balance. */
export type BalanceClosureAdjustment =
  | "exact"
  | "discount_waiver"
  | "round_off"
  | "extra_charge";

/** Metadata captured when a shop-managed record is closed as fully paid. */
export interface CreditClosureMetadata {
  finalPaymentDate: number;
  finalPaymentAmount: number;
  paymentMode: CreditPaymentMode;
  paymentReference?: string | null;
  paidBy: CreditPaidBy;
  payerName?: string | null;
  payerRelation?: string | null;
  payerMobile?: string | null;
  /** Profile / user name who recorded the closure. */
  recordedBy: string;
  closingRemarks?: string | null;
  /** Device-local payment proof URI (optional; never synced). */
  paymentProofUri?: string | null;
  balanceAtClosure: number;
  adjustment: BalanceClosureAdjustment;
  adjustmentAmount?: number | null;
  adjustmentNote?: string | null;
  closedAt: number;
}

/** Internal-only edit/generation event. */
export interface CustomerCreditEditHistoryEntry {
  version: number;
  at: number;
  action: "created" | "edited" | "payment_added" | "cancelled" | "settled" | "closed";
}

export interface CustomerCreditRecord {
  id: string;
  userId: string;
  ueid: string;

  /** Monotonic per-user serial — never reused. */
  serial: number;
  /** Display record number derived from `serial`. */
  recordNumber: string;
  status: CustomerCreditStatus;
  mode: CustomerCreditMode;

  /** User-chosen sale date (today … 15 days back). */
  saleDate: number;

  // Customer (user-scoped; mobile is masked in logs / search)
  customerName: string;
  /** Primary mobile, stored normalized (+91XXXXXXXXXX). Mandatory at the form. */
  customerMobile?: string | null;
  /** Optional alternate mobile, normalized; must differ from the primary. */
  customerAltContact?: string | null;
  /** Address line / shop / house / street. */
  customerAddress?: string | null;
  customerLocality?: string | null;
  /** City / district. */
  customerCity?: string | null;
  customerState?: string | null;
  customerPin?: string | null;
  customerEmail?: string | null;

  /** Optional, consent-based customer photo (device-local; never synced/shared). */
  customerPhoto?: CustomerPhotoRef | null;

  // Customer ID document reference (record-keeping only — NOT KYC verification).
  documentType?: CustomerDocumentType | null;
  documentReference?: string | null;

  // Products
  products: CustomerCreditProduct[];

  // Money (INR)
  saleAmount: number;
  downPayment?: number | null;
  /** Resolved charges financed into the EMI total (not certified). */
  interestCharges?: number | null;
  /** Full interest / charges configuration (fixed or percentage based). */
  charges?: CreditChargesConfig | null;
  /** Charges collected upfront (e.g. processing fee), not part of the EMI total. */
  upfrontCharges?: number | null;
  /** balancePrincipal + financed charges for shop EMI; else sale - down. */
  totalPayable?: number | null;

  // Shop-managed EMI config
  emiFrequency?: EmiFrequency | null;
  emiCount?: number | null;
  emiAmount?: number | null;
  firstDueDate?: number | null;
  /** Days between instalments when frequency = custom. */
  customIntervalDays?: number | null;
  schedule: EmiInstallment[];

  // Payment ledger
  payments: CreditPaymentEntry[];

  // External finance company sale (NOT a shop receivable unless followUp set)
  financerName?: string | null;
  financeRefNumber?: string | null;
  financeDownPayment?: number | null;
  /** Amount funded by the external finance company (the externally-financed slice). */
  financeAmount?: number | null;
  /** Only when true does the shop want to track follow-up for an external-finance sale. */
  shopFollowUpRequired?: boolean;

  // Optional
  guarantorName?: string | null;
  remarks?: string | null;

  // Customer document attachment (consent-gated). NOT "KYC verified".
  /** Timestamp at which the user confirmed consent to store a document for this record. */
  idAttachmentConsentAt?: number | null;
  /** Whether a document attachment is bound to this record (image binding handled separately, in-app only). */
  hasIdAttachment?: boolean;

  /** Best-effort device-local URI of the most recently generated PDF. */
  pdfUri?: string | null;

  // Local reminder for the next due date (user-scoped; cancelled on settle/delete).
  /** Scheduled reminder time (epoch ms), or null if none is active. */
  reminderAt?: number | null;
  /** OS notification handle for the scheduled reminder, or null. */
  reminderNotificationId?: string | null;

  // Internal edit tracking
  firstGeneratedAt: number;
  lastEditedAt?: number | null;
  version: number;
  editHistory: CustomerCreditEditHistoryEntry[];
  cancelledAt?: number | null;
  closedAt?: number | null;
  /** Full closure details when status is fully_paid (shop-managed finance). */
  closure?: CreditClosureMetadata | null;

  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
  /** Multi-step save progress — coordination only, no PII. */
  completedSteps?: string[];
}

// ---------------------------------------------------------------------------
// Pure helpers — totals, schedule generation, payment allocation, statuses
// ---------------------------------------------------------------------------

const ONE_DAY_MS = 86_400_000;

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

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

/** Add `count` whole months to a timestamp, clamping to month length. */
export function addMonths(ms: number, count: number): number {
  const d = new Date(ms);
  const targetMonth = d.getMonth() + count;
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(targetMonth);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d.getTime();
}

export interface ChargesBreakdown {
  interestAmount: number;
  processingAmount: number;
  otherAmount: number;
  processingUpfront: boolean;
  /** Charges folded into the EMI total payable. */
  financedCharges: number;
  /** Charges collected upfront (outside the EMI total). */
  upfrontCharges: number;
  totalCharges: number;
  manual: boolean;
}

const EMPTY_CHARGES: ChargesBreakdown = {
  interestAmount: 0,
  processingAmount: 0,
  otherAmount: 0,
  processingUpfront: false,
  financedCharges: 0,
  upfrontCharges: 0,
  totalCharges: 0,
  manual: false,
};

/**
 * Resolve an interest/charges configuration into concrete amounts. Percentages
 * are applied to the principal balance (default) or the sale amount. The result
 * separates charges financed into the EMI from charges collected upfront.
 */
export function computeChargesBreakdown(
  cfg: CreditChargesConfig | null | undefined,
  principalBalance: number,
  saleAmount: number
): ChargesBreakdown {
  if (!cfg || cfg.mode === "none") return EMPTY_CHARGES;

  // Manual override: the user simply enters the financed charges total.
  if (cfg.manualEntered && cfg.manualChargesAmount != null) {
    const financed = round2(Math.max(0, cfg.manualChargesAmount));
    return {
      ...EMPTY_CHARGES,
      financedCharges: financed,
      totalCharges: financed,
      manual: true,
    };
  }

  const base = round2(
    Math.max(0, cfg.base === "sale" ? saleAmount : principalBalance)
  );
  const pct = (p?: number | null) =>
    p != null && Number.isFinite(p) && p > 0 ? round2((base * p) / 100) : 0;

  let interestAmount = 0;
  let processingAmount = 0;
  let otherAmount = 0;
  const processingUpfront = cfg.processingUpfront === true;

  const resolveProcessing = () =>
    cfg.processingAmount != null && Number.isFinite(cfg.processingAmount) && cfg.processingAmount > 0
      ? round2(cfg.processingAmount)
      : pct(cfg.processingPercent);

  switch (cfg.mode) {
    case "fixed":
      otherAmount = round2(Math.max(0, cfg.fixedAmount ?? 0));
      break;
    case "interest_pct":
      interestAmount = pct(cfg.interestPercent);
      break;
    case "processing_pct":
      processingAmount = resolveProcessing();
      break;
    case "interest_plus_processing":
      interestAmount = pct(cfg.interestPercent);
      processingAmount = resolveProcessing();
      break;
    case "custom":
      otherAmount = round2(Math.max(0, cfg.customAmount ?? 0));
      break;
    default:
      break;
  }

  const upfrontCharges = processingUpfront ? processingAmount : 0;
  const financedCharges = round2(
    interestAmount + (processingUpfront ? 0 : processingAmount) + otherAmount
  );
  return {
    interestAmount,
    processingAmount,
    otherAmount,
    processingUpfront,
    financedCharges,
    upfrontCharges,
    totalCharges: round2(financedCharges + upfrontCharges),
    manual: false,
  };
}

/** True when the sale was paid in full at the point of sale (no balance/EMI). */
export function isPaidInFull(mode: CustomerCreditMode): boolean {
  return mode === "cash";
}

/** Sum the sale amounts of all products. */
export function computeProductsTotal(products: CustomerCreditProduct[]): number {
  return round2(
    products.reduce((sum, p) => sum + (Number.isFinite(p.saleAmount) ? p.saleAmount : 0), 0)
  );
}

export interface GenerateEmiScheduleParams {
  /** Amount to be paid in instalments (after down payment), before interest. */
  balancePrincipal: number;
  interestCharges?: number;
  emiCount: number;
  frequency: EmiFrequency;
  firstDueDate: number;
  customIntervalDays?: number;
}

/**
 * Generate a shop-managed EMI schedule. The last instalment absorbs any rounding
 * remainder so the schedule sums exactly to (balancePrincipal + interestCharges).
 */
export function generateEmiSchedule(params: GenerateEmiScheduleParams): EmiInstallment[] {
  const count = Math.max(1, Math.min(Math.floor(params.emiCount || 0), CREDIT_MAX_INSTALMENTS));
  const totalPayable = round2(
    Math.max(0, params.balancePrincipal) + Math.max(0, params.interestCharges ?? 0)
  );
  if (totalPayable <= 0) return [];

  const base = round2(totalPayable / count);
  const interval = Math.max(1, Math.floor(params.customIntervalDays ?? 0));

  const out: EmiInstallment[] = [];
  let allocated = 0;
  for (let i = 0; i < count; i += 1) {
    const isLast = i === count - 1;
    const amount = isLast ? round2(totalPayable - allocated) : base;
    allocated = round2(allocated + amount);

    let dueDate = params.firstDueDate;
    if (params.frequency === "monthly") dueDate = addMonths(params.firstDueDate, i);
    else if (params.frequency === "weekly") dueDate = params.firstDueDate + i * 7 * ONE_DAY_MS;
    else dueDate = params.firstDueDate + i * interval * ONE_DAY_MS;

    out.push({ seq: i + 1, dueDate, amount });
  }
  return out;
}

export interface InstallmentView extends EmiInstallment {
  paidAmount: number;
  status: InstallmentStatus;
}

export interface CreditScheduleSummary {
  totalPaid: number;
  totalPayable: number;
  balance: number;
  installments: InstallmentView[];
  nextDueDate: number | null;
  overdueCount: number;
  dueTodayCount: number;
  upcoming7Count: number;
  fullyPaid: boolean;
}

/**
 * Allocate received payments across the schedule (oldest instalment first) and
 * derive per-instalment + record-level status. Pure; computes from raw payments.
 */
export function computeCreditSummary(
  record: Pick<
    CustomerCreditRecord,
    "schedule" | "payments" | "totalPayable" | "saleAmount" | "downPayment"
  >,
  now = Date.now()
): CreditScheduleSummary {
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekEnd = todayStart + 7 * ONE_DAY_MS;

  const totalPaid = round2(
    record.payments.reduce((s, p) => s + (Number.isFinite(p.amount) ? p.amount : 0), 0)
  );

  const scheduleTotal = round2(
    record.schedule.reduce((s, it) => s + (Number.isFinite(it.amount) ? it.amount : 0), 0)
  );
  const totalPayable = round2(
    record.totalPayable != null && Number.isFinite(record.totalPayable)
      ? record.totalPayable
      : scheduleTotal > 0
        ? scheduleTotal
        : Math.max(0, (record.saleAmount ?? 0) - (record.downPayment ?? 0))
  );

  let remaining = totalPaid;
  let overdueCount = 0;
  let dueTodayCount = 0;
  let upcoming7Count = 0;
  let nextDueDate: number | null = null;

  const installments: InstallmentView[] = [...record.schedule]
    .sort((a, b) => a.dueDate - b.dueDate)
    .map((it) => {
      const paidAmount = round2(Math.min(remaining, it.amount));
      remaining = round2(remaining - paidAmount);
      let status: InstallmentStatus;
      if (paidAmount >= it.amount && it.amount > 0) {
        status = "paid";
      } else if (paidAmount > 0) {
        status = "partial";
      } else if (it.dueDate < todayStart) {
        status = "overdue";
      } else if (it.dueDate >= todayStart && it.dueDate <= todayEnd) {
        status = "due_today";
      } else {
        status = "upcoming";
      }
      if (status !== "paid") {
        if (nextDueDate == null || it.dueDate < nextDueDate) nextDueDate = it.dueDate;
        if (status === "overdue") overdueCount += 1;
        else if (status === "due_today") dueTodayCount += 1;
        else if (it.dueDate <= weekEnd) upcoming7Count += 1;
      }
      return { ...it, paidAmount, status };
    });

  const balance = round2(Math.max(0, totalPayable - totalPaid));
  const fullyPaid = totalPayable > 0 && balance <= 0;

  return {
    totalPaid,
    totalPayable,
    balance,
    installments,
    nextDueDate,
    overdueCount,
    dueTodayCount,
    upcoming7Count,
    fullyPaid,
  };
}

/** High-level status used for the PDF / list status chip. */
export type CreditDisplayStatus =
  | "paid_in_full"
  | "active_emi"
  | "overdue"
  | "closed"
  | "external_finance";

export function creditDisplayStatus(
  record: CustomerCreditRecord,
  now = Date.now()
): CreditDisplayStatus {
  if (
    record.status === "fully_paid" ||
    record.status === "cancelled" ||
    record.status === "written_off" ||
    record.status === "external_completed"
  ) {
    return record.status === "fully_paid" && isPaidInFull(record.mode)
      ? "paid_in_full"
      : "closed";
  }
  if (record.mode === "external_finance" && !record.shopFollowUpRequired) {
    return "external_finance";
  }
  if (isPaidInFull(record.mode)) return "paid_in_full";
  const summary = computeCreditSummary(record, now);
  if (summary.balance <= 0) return "paid_in_full";
  if (summary.overdueCount > 0) return "overdue";
  return "active_emi";
}

/** Does this record represent an outstanding receivable the shop tracks? */
export function isReceivable(record: CustomerCreditRecord): boolean {
  if (record.status === "cancelled" || record.status === "written_off") return false;
  if (record.status === "fully_paid" || record.status === "external_completed") return false;
  // External finance is NOT a shop receivable unless the user opted into follow-up.
  if (record.mode === "external_finance" && !record.shopFollowUpRequired) return false;
  return true;
}

/** The date the dashboard / calendar / reminders should treat as "payment due". */
export function primaryDueDate(record: CustomerCreditRecord, now = Date.now()): number | null {
  if (!isReceivable(record)) return null;
  const summary = computeCreditSummary(record, now);
  if (summary.balance <= 0) return null;
  return summary.nextDueDate;
}

/**
 * Sale date policy: today or up to 15 days in the past. No future dates. (The
 * app-recorded created date is separate + immutable.)
 */
export function isSaleDateAllowed(ms: number, now = Date.now()): boolean {
  const latest = endOfDay(now);
  const earliest = startOfDay(now) - CREDIT_MAX_BACKDATE_DAYS * ONE_DAY_MS;
  return ms <= latest && ms >= earliest;
}

/** Payment received date cannot be in the future. */
export function isPaymentDateAllowed(ms: number, now = Date.now()): boolean {
  return ms <= endOfDay(now);
}

/**
 * Earliest allowed Dukaan ledger payment / instalment date — the product sale /
 * invoice day. Falls back to record created date when sale date is missing.
 */
export function minDukaanPaymentDate(saleDate: number, recordedAt?: number): number {
  if (Number.isFinite(saleDate) && saleDate > 0) return startOfDay(saleDate);
  if (Number.isFinite(recordedAt) && recordedAt != null && recordedAt > 0) {
    return startOfDay(recordedAt);
  }
  return startOfDay(Date.now());
}

/** Guardrail for Dukaan payment date pickers (~10 years ahead). */
export function maxDukaanPaymentDate(saleDate: number, years = 10): number {
  const anchor = Number.isFinite(saleDate) && saleDate > 0 ? saleDate : Date.now();
  return startOfDay(anchor) + years * 365 * ONE_DAY_MS;
}

/**
 * Dukaan payment / instalment date: on or after the sale / invoice date.
 * Future dates are allowed (scheduled instalments).
 */
export function isDukaanPaymentDateAllowed(
  paidDate: number,
  saleDate: number,
  recordedAt?: number
): boolean {
  if (!Number.isFinite(paidDate) || paidDate <= 0) return false;
  return startOfDay(paidDate) >= minDukaanPaymentDate(saleDate, recordedAt);
}

/** Earliest allowed first EMI due date: the calendar day after the sale / record date. */
export function minFirstDueDate(saleDate: number): number {
  return startOfDay(saleDate) + ONE_DAY_MS;
}

/** Latest allowed first EMI due date (guardrail for the date picker). */
export function maxFirstDueDate(saleDate: number, years = 10): number {
  return startOfDay(saleDate) + years * 365 * ONE_DAY_MS;
}

/** Normalize to local noon — avoids DST / timezone edge cases in date-only pickers. */
export function normalizeCreditCalendarDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

/**
 * First instalment due date must fall strictly after the sale / record date
 * (not the same day, never in the past relative to the record).
 */
export function isFirstDueDateAllowed(firstDueDate: number, saleDate: number): boolean {
  if (!Number.isFinite(firstDueDate) || firstDueDate <= 0) return false;
  return startOfDay(firstDueDate) >= minFirstDueDate(saleDate);
}

/** Whether an EMI schedule field is relevant for this mode. */
export function modeUsesSchedule(mode: CustomerCreditMode): boolean {
  return mode === "shop_emi" || mode === "mixed";
}

/** Whether external-finance fields are relevant for this mode. */
export function modeUsesExternalFinance(mode: CustomerCreditMode): boolean {
  return mode === "external_finance" || mode === "mixed";
}

/** Shop-managed receivable that should use the formal closure sheet (not a simple status flip). */
export function shouldUseClosureFlow(record: CustomerCreditRecord): boolean {
  if (record.status !== "active") return false;
  if (record.mode === "cash") return false;
  if (record.mode === "external_finance" && !record.shopFollowUpRequired) return false;
  const summary = computeCreditSummary(record);
  return summary.balance > 0 || isReceivable(record) || modeUsesSchedule(record.mode);
}
