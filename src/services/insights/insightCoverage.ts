/**
 * Owner-scoped, explainable coverage of records that already exist.
 * Pure: no repositories, no logging, no network. Callers pass one account's
 * records. Money and quantities are never mixed across currencies or units.
 */

import type { BusinessEntryType, EntryRecordStatus } from "@/domain/businessEntry";
import {
  computeCreditSummary,
  isReceivable,
  type CustomerCreditMode,
  type CustomerCreditStatus,
} from "@/domain/customerCredit";
import type { ProfessionalCategory } from "@/domain/professionalPack";
import { getMatterDef } from "@/domain/professionalPackMatters";
import {
  computePurchaseOrderTax,
  type PoTaxApplicability,
  type PurchaseOrderItem,
  type PurchaseOrderStatus,
} from "@/domain/purchaseOrder";
import {
  addQuantity,
  compareDecimal,
  quantity,
  subtractQuantity,
  type Quantity,
} from "@/goodsEvidence/quantities";
import { isComposerEntryType } from "@/domain/composerOptions";
import { parseINRInput } from "@/utils/money/inr";
import {
  insightPhrase,
  insightText,
  renderInsightPhrases,
  type InsightPhrase,
} from "@/services/insights/insightPhrases";
import { formatAmount } from "@/utils/formatters/formatAmount";
import {
  formatFinancialYearLabel,
  getFinancialYearRange,
  startOfMonthMs,
} from "@/utils/financialYear";

export const INSIGHT_DIARY_SCAN_CAP = 5000;
export const INSIGHT_LIST_SCAN_CAP = 2000;
export const INSIGHT_DRAFT_SCAN_CAP = 500;
export const INSIGHT_GRIN_DETAIL_CAP = 200;

const FIG = "businessInsights.figures";

function fig(suffix: string, vars?: Record<string, string | number>): InsightPhrase {
  return insightPhrase(`${FIG}.${suffix}`, vars);
}

function spoken(phrases: readonly InsightPhrase[], joiner = " "): string {
  return renderInsightPhrases(phrases, undefined, joiner);
}

export type InsightReadAvailability = "ready" | "unavailable";

export interface InsightReadState {
  diary: InsightReadAvailability;
  diaryHitCap: boolean;
  purchaseOrders: InsightReadAvailability;
  purchaseOrdersHitCap: boolean;
  credits: InsightReadAvailability;
  creditsHitCap: boolean;
  letterheads: InsightReadAvailability;
  packs: InsightReadAvailability;
  packsHitCap: boolean;
  drafts: InsightReadAvailability;
  draftsHitCap: boolean;
  grin: InsightReadAvailability;
  grinDetailHitCap: boolean;
}

export function readyInsightReads(): InsightReadState {
  return {
    diary: "ready",
    diaryHitCap: false,
    purchaseOrders: "ready",
    purchaseOrdersHitCap: false,
    credits: "ready",
    creditsHitCap: false,
    letterheads: "ready",
    packs: "ready",
    packsHitCap: false,
    drafts: "ready",
    draftsHitCap: false,
    grin: "ready",
    grinDetailHitCap: false,
  };
}

export type CoverageRole = "calculated" | "activity_only";

export interface CoverageMatrixRow {
  recordType: string;
  repository: string;
  dateField: string;
  statusValues: string;
  amountOrUnitFields: string;
  draftFinalDeletedReversed: string;
  role: CoverageRole;
  reason: string;
  insightId: string;
}

export interface InsightSourceLink {
  pathname: string;
  params?: Record<string, string>;
}

export interface ExplainableInsight {
  id: string;
  title: string;
  periodLabel: string;
  howCalculated: string;
  valueLabel: string;
  unavailable: boolean;
  empty: boolean;
  emptyState: string;
  freshnessNote: string;
  source: InsightSourceLink;
  sourceCount: number;
  sourceRecordIds: string[];
  titlePhrases: InsightPhrase[];
  periodPhrases: InsightPhrase[];
  howPhrases: InsightPhrase[];
  valuePhrases: InsightPhrase[];
  emptyPhrases: InsightPhrase[];
  freshnessPhrases: InsightPhrase[];
}

export interface InsightCashSummary {
  fyTotal: number;
  monthTotal: number;
  entryCount: number;
  topRecipients: Array<{ name: string; count: number }>;
}

export interface DiaryCoverageFact {
  id: string;
  entryType: BusinessEntryType;
  entryDate: number;
  createdAt: number;
  deletedAt: number | null;
  status: EntryRecordStatus;
  /** Shown only on the existing cash-paid list, never in explainable text. */
  recipientLabel: string | null;
  cashAmount: number | null;
  cashPaymentDate: number | null;
  materialQuantity: number | null;
  materialUnit: string | null;
  boxes: number | null;
  weight: number | null;
  weightUnit: string | null;
  freightAmount: number | null;
  freightType: string | null;
  pendingAmount: number | null;
  linkedDispatchId: string | null;
}

export interface PurchaseOrderCoverageFact {
  id: string;
  deletedAt: number | null;
  status: PurchaseOrderStatus;
  poDate: number;
  /** Positive order total in paise, or null when the document total is not usable. */
  grandTotalPaise: number | null;
}

export interface CreditPaymentFact {
  id: string;
  amount: number;
  paidDate: number;
}

export interface CreditCoverageFact {
  id: string;
  deletedAt: number | null;
  status: CustomerCreditStatus;
  mode: CustomerCreditMode;
  saleDate: number;
  saleAmount: number;
  downPayment: number | null;
  shopFollowUpRequired: boolean;
  totalPayable: number | null;
  schedule: Array<{ dueDate: number; amount: number }>;
  payments: CreditPaymentFact[];
}

export interface LetterheadCoverageFact {
  id: string;
  saved: boolean;
  dateMs: number;
}

export interface ProfessionalPackCoverageFact {
  id: string;
  deletedAt: number | null;
  matterDate: number;
  /** Null when this matter type has no amount field. */
  statedAmountPaise: number | null;
  hasAmountField: boolean;
  amountReadable: boolean;
}

export interface DraftCoverageFact {
  id: string;
}

export interface GrinLineFact {
  lineId: string;
  unit: string;
  physicallyReceived: { value: string; unit: string };
}

export interface GrinEventFact {
  eventId: string;
  type: string;
  lineId: string | null;
  linkedEventId: string | null;
  returnQty: { value: string; unit: string } | null;
  correctionQty: { value: string; unit: string } | null;
}

export interface GrinCoverageFact {
  receiptId: string;
  localState: string;
  projection: "readable" | "unknown_incomplete";
  detailSkipped: boolean;
  confirmed: null | {
    eventVersion: number;
    voided: boolean;
    custody: string;
    reportedArrivalAt: string;
    reportedArrivalPrecision?: string;
    invoice: { currency: string; minorUnits: number } | null;
    lines: GrinLineFact[];
    events: GrinEventFact[];
  };
}

export interface OwnerInsightCoverageInput {
  fy: number;
  now?: number;
  reads: InsightReadState;
  diary: DiaryCoverageFact[];
  purchaseOrders: PurchaseOrderCoverageFact[];
  credits: CreditCoverageFact[];
  letterheads: LetterheadCoverageFact[];
  packs: ProfessionalPackCoverageFact[];
  drafts: DraftCoverageFact[];
  grin: GrinCoverageFact[];
  /** Diary rows saved on this device that have not synced. They are included. */
  pendingDiaryCount?: number;
  /** This device has no network, so records elsewhere are missing. */
  offline?: boolean;
  /** The server diary list failed and on-device rows were used instead. */
  diaryServerUnread?: boolean;
}

export interface OwnerInsightCoverage {
  insights: ExplainableInsight[];
  matrix: CoverageMatrixRow[];
  cashPaid: InsightCashSummary;
  freshnessSummary: string;
  freshnessPhrases: InsightPhrase[];
}

const ACTIVITY_ONLY_NO_MONEY =
  "Activity and status only because this record has no financial fields. Nothing from it is added to cash paid, money collected, purchase orders, or invoices.";

export function coverageMatrix(): CoverageMatrixRow[] {
  const diary = "Diary repository (business entries)";
  return [
    row({
      recordType: "business_cash_given",
      repository: diary,
      dateField: "payload.paymentDate, otherwise entryDate",
      statusValues: "entry status active | settled | archived; cash settlement pending | partial | settled",
      amountOrUnitFields: "payload.amount (stored as rupees; the diary amount field is defined as INR; a non-number is left out, not labelled as another currency)",
      draftFinalDeletedReversed: "Saved records only. Deleted excluded. Settlement is not a second payment. Drafts are a separate repository and are not included.",
      role: "calculated",
      reason: "Sum of positive amounts on non-deleted Cash Given records in the financial year. One row per record id.",
      insightId: "cash_paid",
    }),
    row({
      recordType: "payment_request",
      repository: diary,
      dateField: "entryDate",
      statusValues: "active | settled | archived",
      amountOrUnitFields: "payload.pendingAmount (INR, user-stated)",
      draftFinalDeletedReversed: "Only active, non-deleted requests are summed. Settled and archived are status counts. Deleted excluded. This is not money collected.",
      role: "calculated",
      reason: "Sum of pending amounts the owner wrote on open payment requests. Not added to cash paid or shop collections.",
      insightId: "payment_requested",
    }),
    row({
      recordType: "material_dispatched",
      repository: diary,
      dateField: "entryDate",
      statusValues: "active | settled | archived; freightType to_pay | paid | tbb | other",
      amountOrUnitFields: "quantity + unit; optional freightAmount; optional totalBoxes; optional totalWeight + weightUnit",
      draftFinalDeletedReversed: "Deleted excluded. Quantities are grouped by unit and are not money. Freight amount counts only when freightType is paid and no freight record links to this dispatch. Expected delivery date is not treated as delivery.",
      role: "calculated",
      reason: "Material quantity by unit. Paid freight is counted only when no linked freight document exists. Weight and boxes stay separate from material quantity.",
      insightId: "material_sent",
    }),
    row({
      recordType: "material_received",
      repository: diary,
      dateField: "entryDate",
      statusValues: "active | settled | archived; quality status is not money",
      amountOrUnitFields: "quantity + unit. paymentFollowUp is a flag, not a payment.",
      draftFinalDeletedReversed: "Deleted excluded. Not added to goods-receipt quantities. Not treated as proof that a dispatch was delivered.",
      role: "calculated",
      reason: "Diary receipt quantities grouped by unit. No payment is inferred.",
      insightId: "material_received_diary",
    }),
    row({
      recordType: "material_return",
      repository: diary,
      dateField: "entryDate",
      statusValues: "active | settled | archived",
      amountOrUnitFields: "quantity + unit",
      draftFinalDeletedReversed: "Deleted excluded. Not subtracted from dispatches, because there is no link. Not an economic credit.",
      role: "calculated",
      reason: "Return quantities grouped by unit, kept separate from goods sent.",
      insightId: "material_returned",
    }),
    row({
      recordType: "outward_freight_details",
      repository: diary,
      dateField: "entryDate",
      statusValues: "active | settled | archived; freightType to_pay | paid | tbb | other",
      amountOrUnitFields: "freightAmount; totalBoxes; totalWeight + weightUnit",
      draftFinalDeletedReversed: "Deleted excluded. Only freightType paid is money. to_pay, tbb, and other are status only. This document, not the linked dispatch, is the freight amount when linkedDispatchId is set.",
      role: "calculated",
      reason: "Paid freight amounts in INR. Unpaid freight types are counted but not added. Weight and boxes are separate.",
      insightId: "freight_paid",
    }),
    row({
      recordType: "work_update_issue",
      repository: diary,
      dateField: "entryDate",
      statusValues: "active | settled | archived",
      amountOrUnitFields: "quantityOutput is free text, not a unit quantity",
      draftFinalDeletedReversed: "Non-deleted records are counted. Deleted excluded. Free-text quantity is not summed.",
      role: "activity_only",
      reason: `${ACTIVITY_ONLY_NO_MONEY} The quantity note is free text without a unit, so it is not a financial or quantity total.`,
      insightId: "activity_work_update",
    }),
    row({
      recordType: "staff_matter",
      repository: diary,
      dateField: "entryDate",
      statusValues: "active | settled | archived",
      amountOrUnitFields: "none",
      draftFinalDeletedReversed: "Non-deleted records are counted. Deleted excluded.",
      role: "activity_only",
      reason: ACTIVITY_ONLY_NO_MONEY,
      insightId: "activity_staff",
    }),
    row({
      recordType: "letterhead_matter",
      repository: diary,
      dateField: "entryDate",
      statusValues: "active | settled | archived",
      amountOrUnitFields: "none",
      draftFinalDeletedReversed: "Diary matter rows are counted separately from saved letterhead documents. Neither is money. Deleted diary rows are excluded.",
      role: "activity_only",
      reason: ACTIVITY_ONLY_NO_MONEY,
      insightId: "activity_letterhead_matter",
    }),
    row({
      recordType: "reminder_purchase",
      repository: diary,
      dateField: "entryDate",
      statusValues: "active | settled | archived",
      amountOrUnitFields: "estimatedAmount is free text, not a currency field",
      draftFinalDeletedReversed: "Non-deleted reminders are counted. The estimate is not parsed into money.",
      role: "activity_only",
      reason: "Activity and status only. The estimate is free text, not a currency amount, so it is not summed and is not a purchase-order value.",
      insightId: "activity_reminder_purchase",
    }),
    row({
      recordType: "reminder_email",
      repository: diary,
      dateField: "entryDate",
      statusValues: "active | settled | archived",
      amountOrUnitFields: "none",
      draftFinalDeletedReversed: "Non-deleted reminders are counted. Deleted excluded.",
      role: "activity_only",
      reason: ACTIVITY_ONLY_NO_MONEY,
      insightId: "activity_reminder_email",
    }),
    row({
      recordType: "reminder_gst_return",
      repository: diary,
      dateField: "entryDate (dueDate is a reminder date, not a tax figure)",
      statusValues: "active | settled | archived; return type gstr1 | gstr3b | gstr9 | other",
      amountOrUnitFields: "none",
      draftFinalDeletedReversed: "Non-deleted reminders are counted. No tax amount is stored.",
      role: "activity_only",
      reason: "Activity and status only because no tax amount is stored. This is not a tax liability, overdue balance, or filing.",
      insightId: "activity_gst_reminder",
    }),
    row({
      recordType: "legacy",
      repository: diary,
      dateField: "entryDate",
      statusValues: "active | settled | archived",
      amountOrUnitFields: "quantity is free text",
      draftFinalDeletedReversed: "Non-deleted legacy rows are counted. Free-text quantity is not summed.",
      role: "activity_only",
      reason: "Activity and status only. Legacy quantity is free text, not a unit amount, and there is no currency field.",
      insightId: "activity_legacy",
    }),
    row({
      recordType: "purchase_order",
      repository: "Purchase order repository",
      dateField: "poDate",
      statusValues: "active | cancelled",
      amountOrUnitFields: "line amount and GST when tax is applicable (INR). Item units are not summed into one quantity.",
      draftFinalDeletedReversed: "Active, non-deleted orders only. Cancelled orders are a reversal of the order and are status-only. Deleted excluded. Not money paid and not goods received. Not added to goods-receipt invoice values.",
      role: "calculated",
      reason: "Sum of purchase-order totals for active orders in the financial year.",
      insightId: "purchase_order_value",
    }),
    row({
      recordType: "customer_credit",
      repository: "Customer credit repository",
      dateField: "payments use paidDate; down payment and cash-at-sale use saleDate; open balance uses saleDate",
      statusValues: "active | fully_paid | cancelled | written_off | external_completed; mode cash | credit | shop_emi | external_finance | mixed",
      amountOrUnitFields: "payments[].amount, downPayment, saleAmount only for a cash sale with an empty payment list. financeAmount and financeDownPayment are not shop collections.",
      draftFinalDeletedReversed: "Deleted and cancelled records are excluded (no separate refund amount is stored). Written-off records keep recorded payments but not the unpaid balance. Closure final amount is not added again when it is already a payment. Sale total is not called money collected.",
      role: "calculated",
      reason: "Shop money collected is payment evidence. Open balance is total payable minus recorded payments on receivable records. The two figures are not added together.",
      insightId: "shop_money_collected",
    }),
    row({
      recordType: "letterhead_document",
      repository: "Letterhead document repository",
      dateField: "input.date",
      statusValues: "saved true | false. Edits keep one document id.",
      amountOrUnitFields: "none",
      draftFinalDeletedReversed: "Saved documents are counted once. Share-once documents that were not saved are status-only. Removed documents are absent. Not added to letterhead diary matters.",
      role: "activity_only",
      reason: ACTIVITY_ONLY_NO_MONEY,
      insightId: "activity_letterhead_document",
    }),
    row({
      recordType: "professional_pack",
      repository: "Professional pack repository",
      dateField: "matterDate",
      statusValues: "active | shared | completed",
      amountOrUnitFields: "amount fields on tds_tcs_matter, expense_cash_review, and payment_recovery only (INR). Other matter types have no amount field.",
      draftFinalDeletedReversed: "Non-deleted briefs are included. Amounts stay on this insight and are not added to cash paid, collections, purchase orders, or invoices. Deleted excluded.",
      role: "calculated",
      reason: "Sum of amount fields written on professional briefs. Briefs with no amount field are a status count on the same insight.",
      insightId: "professional_brief_amounts",
    }),
    row({
      recordType: "form_draft",
      repository: "Form drafts repository (composer, letterhead, identity, professional pack)",
      dateField: "not used; open drafts are current, not a financial-year total",
      statusValues: "active drafts only (converted and discarded are not listed)",
      amountOrUnitFields: "payload is not read",
      draftFinalDeletedReversed: "Drafts are not final records. They are a status count only so a later saved record is not counted twice. Retries of the same draft id count once.",
      role: "activity_only",
      reason: "Status only. Draft payloads are not treated as financial fields, because the draft is not a saved record.",
      insightId: "activity_open_drafts",
    }),
    row({
      recordType: "grin_receipt",
      repository: "Goods receipt repository (local session for this account)",
      dateField: "reportedArrivalAt when the precision is a date or an instant. Precision unknown is not used as a date.",
      statusValues: "local draft | queued | dispatching | issued | attachment_pending | conflicted | failed; custody including refused_at_gate and returned; voided",
      amountOrUnitFields: "line physicallyReceived minus confirmed returns, by unit. supplierInvoiceValue grouped by currency. Package count and weight are not added to the material unit.",
      draftFinalDeletedReversed: "Only a readable confirmed receipt that is not voided and not refused at the gate. Returns already confirmed are subtracted. Pending uploads, retries, and duplicate receipt ids are not a second receipt. Invoice value is not money collected and is not added to the purchase order.",
      role: "calculated",
      reason: "Remaining quantity by unit, and supplier invoice value by currency, for confirmed receipts in the financial year.",
      insightId: "goods_receipt_on_hand",
    }),
  ];
}

function row(entry: CoverageMatrixRow): CoverageMatrixRow {
  return entry;
}

function positivePaise(amount: number | null | undefined): number | null {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;
  const paise = Math.round(amount * 100);
  if (!Number.isSafeInteger(paise) || paise <= 0) return null;
  return paise;
}

export function formatPaise(paise: number): string {
  const negative = paise < 0;
  const abs = Math.abs(Math.trunc(paise));
  const rupees = Math.trunc(abs / 100);
  const rem = abs % 100;
  const grouped = formatAmount(rupees, { withSymbol: true, maximumFractionDigits: 0 });
  const text = rem === 0 ? grouped : `${grouped}.${String(rem).padStart(2, "0")}`;
  return negative ? `-${text}` : text;
}

function paiseToRupees(paise: number): number {
  return Math.trunc(paise) / 100;
}

function num(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function payloadOf(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  return payload as Record<string, unknown>;
}

function dedupe<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const id = row.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ ...row, id });
  }
  return out;
}

export function toDiaryCoverageFact(entry: {
  id: string;
  entryType: BusinessEntryType;
  entryDate: number;
  createdAt: number;
  deletedAt: number | null;
  status: EntryRecordStatus;
  payload: unknown;
}): DiaryCoverageFact {
  const payload = payloadOf(entry.payload);
  const base: DiaryCoverageFact = {
    id: entry.id,
    entryType: entry.entryType,
    entryDate: entry.entryDate,
    createdAt: entry.createdAt,
    deletedAt: entry.deletedAt,
    status: entry.status,
    recipientLabel: null,
    cashAmount: null,
    cashPaymentDate: null,
    materialQuantity: null,
    materialUnit: null,
    boxes: null,
    weight: null,
    weightUnit: null,
    freightAmount: null,
    freightType: null,
    pendingAmount: null,
    linkedDispatchId: null,
  };
  if (!payload) return base;

  const quantityValue = num(payload.quantity);
  const unit = text(payload.unit);
  if (
    entry.entryType === "material_dispatched" ||
    entry.entryType === "material_received" ||
    entry.entryType === "material_return"
  ) {
    base.materialQuantity = quantityValue;
    base.materialUnit = unit;
  }

  if (entry.entryType === "material_dispatched" || entry.entryType === "outward_freight_details") {
    const boxes = num(payload.totalBoxes);
    const weight = num(payload.totalWeight);
    base.boxes = boxes != null && boxes > 0 ? boxes : null;
    base.weight = weight != null && weight > 0 ? weight : null;
    base.weightUnit = text(payload.weightUnit);
    base.freightAmount = num(payload.freightAmount);
    base.freightType = text(payload.freightType);
  }

  if (entry.entryType === "outward_freight_details") {
    base.linkedDispatchId = text(payload.linkedDispatchId);
  }

  if (entry.entryType === "business_cash_given") {
    base.cashAmount = num(payload.amount);
    base.cashPaymentDate = num(payload.paymentDate);
    base.recipientLabel = text(payload.givenToName);
  }

  if (entry.entryType === "payment_request") {
    base.pendingAmount = num(payload.pendingAmount);
  }

  return base;
}

export function toPurchaseOrderCoverageFact(po: {
  id: string;
  deletedAt?: number | null;
  status: PurchaseOrderStatus;
  poDate: number;
  items: PurchaseOrderItem[];
  taxApplicable?: PoTaxApplicability;
  gstRate?: number | null;
}): PurchaseOrderCoverageFact {
  let grandTotalPaise: number | null = null;
  try {
    const summary = computePurchaseOrderTax({
      items: po.items,
      taxApplicable: po.taxApplicable,
      gstRate: po.gstRate,
      vendorGstin: null,
      buyerGstin: null,
    });
    grandTotalPaise = positivePaise(summary.grandTotal);
  } catch {
    grandTotalPaise = null;
  }
  return {
    id: po.id,
    deletedAt: po.deletedAt ?? null,
    status: po.status,
    poDate: po.poDate,
    grandTotalPaise,
  };
}

export function toCreditCoverageFact(record: {
  id: string;
  deletedAt?: number | null;
  status: CustomerCreditStatus;
  mode: CustomerCreditMode;
  saleDate: number;
  saleAmount: number;
  downPayment?: number | null;
  shopFollowUpRequired?: boolean;
  totalPayable?: number | null;
  schedule?: Array<{ dueDate: number; amount: number }>;
  payments?: Array<{ id: string; amount: number; paidDate: number }>;
}): CreditCoverageFact {
  return {
    id: record.id,
    deletedAt: record.deletedAt ?? null,
    status: record.status,
    mode: record.mode,
    saleDate: record.saleDate,
    saleAmount: record.saleAmount,
    downPayment: record.downPayment ?? null,
    shopFollowUpRequired: Boolean(record.shopFollowUpRequired),
    totalPayable: record.totalPayable ?? null,
    schedule: (record.schedule ?? []).map((item) => ({
      dueDate: item.dueDate,
      amount: item.amount,
    })),
    payments: (record.payments ?? []).map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      paidDate: payment.paidDate,
    })),
  };
}

export function toLetterheadCoverageFact(doc: {
  id: string;
  saved: boolean;
  input: { date: number };
}): LetterheadCoverageFact {
  return { id: doc.id, saved: doc.saved, dateMs: doc.input.date };
}

export function statedBriefAmount(pack: {
  professionalCategory: ProfessionalCategory;
  matterType: string;
  facts: Record<string, string | number | null>;
}): { hasAmountField: boolean; amountReadable: boolean; statedAmountPaise: number | null } {
  const def = getMatterDef(pack.professionalCategory, pack.matterType);
  const amountFields = def?.fields.filter((field) => field.kind === "amount") ?? [];
  if (amountFields.length === 0) {
    return { hasAmountField: false, amountReadable: false, statedAmountPaise: null };
  }
  let paise = 0;
  let any = false;
  for (const field of amountFields) {
    const parsed = parseINRInput(pack.facts[field.key]);
    const part = positivePaise(parsed);
    if (part == null) continue;
    any = true;
    paise += part;
  }
  return {
    hasAmountField: true,
    amountReadable: any,
    statedAmountPaise: any ? paise : null,
  };
}

export function toProfessionalPackCoverageFact(pack: {
  id: string;
  deletedAt: number | null;
  matterDate: number;
  professionalCategory: ProfessionalCategory;
  matterType: string;
  facts: Record<string, string | number | null>;
}): ProfessionalPackCoverageFact {
  const amount = statedBriefAmount(pack);
  return {
    id: pack.id,
    deletedAt: pack.deletedAt,
    matterDate: pack.matterDate,
    statedAmountPaise: amount.statedAmountPaise,
    hasAmountField: amount.hasAmountField,
    amountReadable: amount.amountReadable,
  };
}

export function toDraftCoverageFact(draft: { id: string }): DraftCoverageFact {
  return { id: draft.id };
}

function qtyFact(value: unknown): { value: string; unit: string } | null {
  if (!value || typeof value !== "object") return null;
  const qty = value as { value?: unknown; unit?: unknown };
  if (typeof qty.value !== "string" || typeof qty.unit !== "string") return null;
  if (!qty.unit.trim()) return null;
  return { value: qty.value, unit: qty.unit };
}

export function toGrinCoverageFact(input: {
  receiptId: string;
  localState: string;
  projection: "readable" | "unknown_incomplete";
  detailSkipped?: boolean;
  confirmed: null | {
    eventVersion: number;
    effective: {
      custody: string;
      reportedArrivalAt: string;
      reportedArrivalPrecision?: string;
      commercial: { supplierInvoiceValue: { currency: string; minorUnits: number } | null };
      lines: Array<{
        lineId: string;
        unit: string;
        physicallyReceived: { value: string; unit: string };
      }>;
    };
    events: Array<{ eventId: string; type: string; typedChanges?: Record<string, unknown> }>;
  };
}): GrinCoverageFact {
  const confirmed = input.confirmed;
  if (!confirmed || input.projection !== "readable") {
    return {
      receiptId: input.receiptId,
      localState: input.localState,
      projection: input.projection,
      detailSkipped: Boolean(input.detailSkipped),
      confirmed: null,
    };
  }
  const voided = confirmed.events.some((event) => event.type === "void_with_reason");
  const invoice = confirmed.effective.commercial.supplierInvoiceValue;
  return {
    receiptId: input.receiptId,
    localState: input.localState,
    projection: "readable",
    detailSkipped: Boolean(input.detailSkipped),
    confirmed: {
      eventVersion: confirmed.eventVersion,
      voided,
      custody: confirmed.effective.custody,
      reportedArrivalAt: confirmed.effective.reportedArrivalAt,
      reportedArrivalPrecision: confirmed.effective.reportedArrivalPrecision,
      invoice:
        invoice && typeof invoice.minorUnits === "number"
          ? {
              currency: typeof invoice.currency === "string" ? invoice.currency : "",
              minorUnits: invoice.minorUnits,
            }
          : null,
      lines: confirmed.effective.lines.map((line) => ({
        lineId: line.lineId,
        unit: line.unit,
        physicallyReceived: {
          value: line.physicallyReceived.value,
          unit: line.physicallyReceived.unit,
        },
      })),
      events: confirmed.events.map((event) => {
        const changes = event.typedChanges ?? {};
        return {
          eventId: event.eventId,
          type: event.type,
          lineId: typeof changes.lineId === "string" ? changes.lineId : null,
          linkedEventId: typeof changes.linkedEventId === "string" ? changes.linkedEventId : null,
          returnQty: qtyFact(changes.returnQty),
          correctionQty: qtyFact(changes.correctionQty),
        };
      }),
    },
  };
}

export function grinArrivalMs(
  arrival: string,
  precision: string | undefined
): number | null {
  if (precision === "unknown") return null;
  const value = arrival.trim();
  if (!value) return null;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (day) {
    const year = Number(day[1]);
    const month = Number(day[2]);
    const date = Number(day[3]);
    if (!year || month < 1 || month > 12 || date < 1 || date > 31) return null;
    return new Date(year, month - 1, date, 12, 0, 0, 0).getTime();
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function inPeriod(ms: number, startMs: number, endMs: number): boolean {
  return Number.isFinite(ms) && ms >= startMs && ms < endMs;
}

function recordDate(fact: DiaryCoverageFact): number {
  if (Number.isFinite(fact.entryDate) && fact.entryDate > 0) return fact.entryDate;
  return fact.createdAt;
}

function unitKey(unit: string): string {
  return unit.trim().toLowerCase();
}

function isBoxUnit(unit: string | null): boolean {
  if (!unit) return false;
  const key = unitKey(unit);
  return key === "box" || key === "boxes";
}

interface UnitBucket {
  display: string;
  total: number;
}

function addNumberQuantity(buckets: Map<string, UnitBucket>, unit: string, amount: number) {
  const key = unitKey(unit);
  if (!key || !Number.isFinite(amount) || amount <= 0) return;
  const prev = buckets.get(key);
  if (prev) prev.total += amount;
  else buckets.set(key, { display: unit.trim(), total: amount });
}

function formatNumberQuantities(buckets: Map<string, UnitBucket>): string {
  const parts = [...buckets.values()]
    .sort((a, b) => a.display.localeCompare(b.display))
    .map((bucket) => `${trimNumber(bucket.total)} ${bucket.display}`);
  return parts.join(" · ");
}

function trimNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function idsOf(ids: string[]): { sourceCount: number; sourceRecordIds: string[] } {
  const unique = [...new Set(ids.filter(Boolean))].sort();
  return { sourceCount: unique.length, sourceRecordIds: unique.slice(0, 20) };
}

function linkFor(listPath: string, one: { pathname: string; param: string } | null, ids: string[]): InsightSourceLink {
  if (ids.length === 1 && one) {
    return { pathname: one.pathname, params: { [one.param]: ids[0]! } };
  }
  return { pathname: listPath };
}

function diaryLink(ids: string[], entryType?: BusinessEntryType | null): InsightSourceLink {
  if (ids.length === 1) {
    return { pathname: "/(app)/diary/[id]", params: { id: ids[0]! } };
  }
  if (ids.length > 1 && entryType && isComposerEntryType(entryType)) {
    return { pathname: "/(app)/diary", params: { type: entryType } };
  }
  return { pathname: "/(app)/diary" };
}

interface InsightDraft {
  id: string;
  title: InsightPhrase[];
  how: InsightPhrase[];
  value: InsightPhrase[];
  unavailable: boolean;
  empty: boolean;
  emptyState: InsightPhrase[];
  source: InsightSourceLink;
  ids: string[];
  extras: InsightPhrase[];
  period?: InsightPhrase[];
}

function phrasesOf(items: Array<InsightPhrase | false | null | undefined>): InsightPhrase[] {
  return items.filter((item): item is InsightPhrase => Boolean(item));
}

function materialize(
  draft: InsightDraft,
  periodLabel: string,
  reads: InsightReadState,
  sharedFreshness: InsightPhrase[]
): ExplainableInsight {
  const extras = [...draft.extras];
  if (reads.diaryHitCap && draftUsesDiary(draft.id)) {
    extras.push(fig("freshnessDiary", { count: INSIGHT_DIARY_SCAN_CAP }));
  }
  if (reads.purchaseOrdersHitCap && draft.id === "purchase_order_value") {
    extras.push(fig("freshnessOrders", { count: INSIGHT_LIST_SCAN_CAP }));
  }
  if (reads.creditsHitCap && (draft.id === "shop_money_collected" || draft.id === "shop_balance_open")) {
    extras.push(fig("freshnessCredit", { count: INSIGHT_LIST_SCAN_CAP }));
  }
  if (reads.packsHitCap && draft.id === "professional_brief_amounts") {
    extras.push(fig("freshnessBriefs", { count: INSIGHT_LIST_SCAN_CAP }));
  }
  if (reads.draftsHitCap && draft.id === "activity_open_drafts") {
    extras.push(fig("freshnessDrafts", { count: INSIGHT_DRAFT_SCAN_CAP }));
  }
  if (reads.grinDetailHitCap && draft.id.startsWith("goods_receipt")) {
    extras.push(fig("freshnessReceipts", { count: INSIGHT_GRIN_DETAIL_CAP }));
  }
  const freshnessPhrases = [...sharedFreshness, ...extras];
  const periodPhrases = draft.period ?? [insightText(periodLabel)];
  const picked = idsOf(draft.ids);
  return {
    id: draft.id,
    title: spoken(draft.title),
    periodLabel: spoken(periodPhrases),
    howCalculated: spoken(draft.how),
    valueLabel: spoken(draft.value, " · "),
    unavailable: draft.unavailable,
    empty: draft.empty,
    emptyState: spoken(draft.emptyState),
    freshnessNote: spoken(freshnessPhrases),
    source: draft.source,
    sourceCount: picked.sourceCount,
    sourceRecordIds: picked.sourceRecordIds,
    titlePhrases: draft.title,
    periodPhrases,
    howPhrases: draft.how,
    valuePhrases: draft.value,
    emptyPhrases: draft.emptyState,
    freshnessPhrases,
  };
}

const DIARY_INSIGHT_IDS = new Set([
  "cash_paid",
  "payment_requested",
  "freight_paid",
  "transport_measure",
  "material_sent",
  "material_received_diary",
  "material_returned",
  "activity_work_update",
  "activity_staff",
  "activity_letterhead_matter",
  "activity_reminder_purchase",
  "activity_reminder_email",
  "activity_gst_reminder",
  "activity_legacy",
]);

function draftUsesDiary(id: string): boolean {
  return DIARY_INSIGHT_IDS.has(id);
}

function unavailableInsight(
  id: string,
  titleKey: string,
  emptyKey: string,
  source: InsightSourceLink
): InsightDraft {
  const emptyState = [fig(emptyKey)];
  return {
    id,
    title: [fig(titleKey)],
    how: emptyState,
    value: [fig("notRead")],
    unavailable: true,
    empty: true,
    emptyState,
    source,
    ids: [],
    extras: [],
  };
}

function moneyOrNone(empty: boolean, paise: number): InsightPhrase[] {
  return empty ? [fig("none")] : [insightText(formatPaise(paise))];
}

function countValue(count: number, oneKey: string, manyKey: string): InsightPhrase[] {
  if (count <= 0) return [fig("none")];
  if (count === 1) return [fig(oneKey)];
  return [fig(manyKey, { count })];
}

function remainingGrinQuantity(line: GrinLineFact, events: GrinEventFact[]): Quantity | null {
  if (line.physicallyReceived.unit !== line.unit) return null;
  let received: Quantity;
  let returned: Quantity;
  try {
    received = quantity(line.physicallyReceived.value, line.unit);
    returned = quantity("0", line.unit);
  } catch {
    return null;
  }
  const dispatches = events.filter(
    (event) => event.type === "return_dispatched" && event.lineId === line.lineId && event.returnQty
  );
  try {
    for (const event of dispatches) {
      if (!event.returnQty || event.returnQty.unit !== line.unit) return null;
      let remaining = quantity(event.returnQty.value, line.unit);
      for (const correction of events) {
        if (correction.type !== "return_received") continue;
        if (correction.linkedEventId !== event.eventId) continue;
        if (!correction.correctionQty || correction.correctionQty.unit !== line.unit) return null;
        remaining = subtractQuantity(remaining, quantity(correction.correctionQty.value, line.unit));
      }
      if (compareDecimal(remaining.value, "0") < 0) return null;
      returned = addQuantity(returned, remaining);
    }
    const available = subtractQuantity(received, returned);
    if (compareDecimal(available.value, "0") < 0) return null;
    return available;
  } catch {
    return null;
  }
}

function dedupeEvents(events: GrinEventFact[]): GrinEventFact[] {
  const seen = new Set<string>();
  const out: GrinEventFact[] = [];
  for (const event of events) {
    if (!event.eventId || seen.has(event.eventId)) continue;
    seen.add(event.eventId);
    out.push(event);
  }
  return out;
}

export function buildOwnerInsightCoverage(input: OwnerInsightCoverageInput): OwnerInsightCoverage {
  const now = input.now ?? Date.now();
  const periodLabel = formatFinancialYearLabel(input.fy);
  const { startMs, endMs } = getFinancialYearRange(input.fy);
  const monthStart = startOfMonthMs(now);
  const reads = input.reads;
  const diary = dedupe(input.diary);
  const purchaseOrders = dedupe(input.purchaseOrders);
  const credits = dedupe(input.credits);
  const letterheads = dedupe(input.letterheads);
  const packs = dedupe(input.packs);
  const drafts = dedupe(input.drafts);
  const grinSeen = new Set<string>();
  const grin: GrinCoverageFact[] = [];
  for (const fact of input.grin) {
    const id = fact.receiptId.trim();
    if (!id || grinSeen.has(id)) continue;
    grinSeen.add(id);
    grin.push({ ...fact, receiptId: id });
  }

  const freightLinks = new Set<string>();
  for (const fact of diary) {
    if (fact.deletedAt) continue;
    if (fact.entryType !== "outward_freight_details") continue;
    if (fact.linkedDispatchId) freightLinks.add(fact.linkedDispatchId);
  }

  const insights: InsightDraft[] = [];
  const cash = summarizeCash(diary, reads, startMs, endMs, monthStart);
  insights.push(cash.insight);
  insights.push(summarizePaymentRequests(diary, reads, startMs, endMs));
  insights.push(summarizeFreightPaid(diary, freightLinks, reads, startMs, endMs));
  insights.push(summarizeTransport(diary, freightLinks, reads, startMs, endMs));
  insights.push(summarizeMaterial(diary, "material_dispatched", "material_sent", "materialSent", reads, startMs, endMs));
  insights.push(
    summarizeMaterial(diary, "material_received", "material_received_diary", "materialReceived", reads, startMs, endMs)
  );
  insights.push(summarizeMaterial(diary, "material_return", "material_returned", "materialReturned", reads, startMs, endMs));
  const shop = summarizeShop(credits, reads, startMs, endMs, now);
  insights.push(shop.collected, shop.balance);
  insights.push(summarizePurchaseOrders(purchaseOrders, reads, startMs, endMs));
  const goods = summarizeGrin(grin, reads, startMs, endMs);
  insights.push(goods.onHand, goods.invoice, goods.excluded);
  insights.push(summarizeBriefs(packs, reads, startMs, endMs));
  insights.push(activityDiary(diary, reads, "work_update_issue", "activity_work_update", "work", startMs, endMs));
  insights.push(activityDiary(diary, reads, "staff_matter", "activity_staff", "staff", startMs, endMs));
  insights.push(
    activityDiary(diary, reads, "letterhead_matter", "activity_letterhead_matter", "letterNotes", startMs, endMs)
  );
  insights.push(summarizeLetterheads(letterheads, reads, startMs, endMs));
  insights.push(
    activityDiary(diary, reads, "reminder_purchase", "activity_reminder_purchase", "purchaseReminders", startMs, endMs)
  );
  insights.push(activityDiary(diary, reads, "reminder_email", "activity_reminder_email", "emailReminders", startMs, endMs));
  insights.push(
    activityDiary(diary, reads, "reminder_gst_return", "activity_gst_reminder", "gstReminders", startMs, endMs)
  );
  insights.push(activityDiary(diary, reads, "legacy", "activity_legacy", "legacy", startMs, endMs));
  insights.push(summarizeDrafts(drafts, reads));

  const freshnessPhrases = sharedFreshness(input);
  return {
    insights: insights.map((draft) => materialize(draft, periodLabel, reads, freshnessPhrases)),
    matrix: coverageMatrix(),
    cashPaid: cash.summary,
    freshnessSummary: spoken(freshnessPhrases),
    freshnessPhrases,
  };
}

function sharedFreshness(input: OwnerInsightCoverageInput): InsightPhrase[] {
  const phrases: InsightPhrase[] = [fig("freshness")];
  const pending = input.pendingDiaryCount ?? 0;
  if (pending > 0) phrases.push(fig("freshnessPending", { count: pending }));
  if (input.offline) phrases.push(fig("freshnessOffline"));
  if (input.diaryServerUnread) phrases.push(fig("freshnessServerUnread"));
  return phrases;
}

function summarizeCash(
  diary: DiaryCoverageFact[],
  reads: InsightReadState,
  startMs: number,
  endMs: number,
  monthStart: number
): { insight: InsightDraft; summary: InsightCashSummary } {
  if (reads.diary === "unavailable") {
    return {
      insight: unavailableInsight("cash_paid", "cashPaid.title", "cashPaid.unread", { pathname: "/(app)/diary" }),
      summary: { fyTotal: 0, monthTotal: 0, entryCount: 0, topRecipients: [] },
    };
  }
  let fyPaise = 0;
  let monthPaise = 0;
  let unreadable = 0;
  const ids: string[] = [];
  const recipients = new Map<string, number>();
  for (const fact of diary) {
    if (fact.deletedAt || fact.entryType !== "business_cash_given") continue;
    const when = fact.cashPaymentDate && fact.cashPaymentDate > 0 ? fact.cashPaymentDate : recordDate(fact);
    if (!inPeriod(when, startMs, endMs)) continue;
    const paise = positivePaise(fact.cashAmount);
    if (paise == null) {
      unreadable += 1;
      continue;
    }
    fyPaise += paise;
    if (when >= monthStart) monthPaise += paise;
    ids.push(fact.id);
    if (fact.recipientLabel) {
      recipients.set(fact.recipientLabel, (recipients.get(fact.recipientLabel) ?? 0) + 1);
    }
  }
  const topRecipients = [...recipients.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));
  const empty = ids.length === 0;
  return {
    summary: {
      fyTotal: paiseToRupees(fyPaise),
      monthTotal: paiseToRupees(monthPaise),
      entryCount: ids.length,
      topRecipients,
    },
    insight: {
      id: "cash_paid",
      title: [fig("cashPaid.title")],
      how: phrasesOf([
        fig("cashPaid.how"),
        unreadable ? fig("cashPaid.unreadable", { count: unreadable }) : null,
      ]),
      value: moneyOrNone(empty, fyPaise),
      unavailable: false,
      empty,
      emptyState: [fig("cashPaid.empty")],
      source: diaryLink(ids, "business_cash_given"),
      ids,
      extras: [],
    },
  };
}

function summarizePaymentRequests(
  diary: DiaryCoverageFact[],
  reads: InsightReadState,
  startMs: number,
  endMs: number
): InsightDraft {
  if (reads.diary === "unavailable") {
    return unavailableInsight("payment_requested", "paymentRequested.title", "paymentRequested.unread", {
      pathname: "/(app)/diary",
    });
  }
  let paise = 0;
  let settled = 0;
  const ids: string[] = [];
  for (const fact of diary) {
    if (fact.deletedAt || fact.entryType !== "payment_request") continue;
    if (!inPeriod(recordDate(fact), startMs, endMs)) continue;
    if (fact.status !== "active") {
      settled += 1;
      continue;
    }
    const amount = positivePaise(fact.pendingAmount);
    if (amount == null) continue;
    paise += amount;
    ids.push(fact.id);
  }
  const empty = ids.length === 0;
  return {
    id: "payment_requested",
    title: [fig("paymentRequested.title")],
    how: phrasesOf([
      fig("paymentRequested.how"),
      settled ? fig("paymentRequested.settled", { count: settled }) : null,
    ]),
    value: moneyOrNone(empty, paise),
    unavailable: false,
    empty,
    emptyState: [fig("paymentRequested.empty")],
    source: diaryLink(ids, "payment_request"),
    ids,
    extras: [],
  };
}

function summarizeFreightPaid(
  diary: DiaryCoverageFact[],
  freightLinks: Set<string>,
  reads: InsightReadState,
  startMs: number,
  endMs: number
): InsightDraft {
  if (reads.diary === "unavailable") {
    return unavailableInsight("freight_paid", "freightPaid.title", "freightPaid.unread", {
      pathname: "/(app)/diary",
    });
  }
  let paise = 0;
  let unpaid = 0;
  const ids: string[] = [];
  for (const fact of diary) {
    if (fact.deletedAt) continue;
    if (!inPeriod(recordDate(fact), startMs, endMs)) continue;
    const isFreight = fact.entryType === "outward_freight_details";
    const isDispatch = fact.entryType === "material_dispatched";
    if (!isFreight && !isDispatch) continue;
    if (isDispatch && freightLinks.has(fact.id)) continue;
    if (fact.freightType !== "paid") {
      if (fact.freightAmount != null) unpaid += 1;
      continue;
    }
    const amount = positivePaise(fact.freightAmount);
    if (amount == null) continue;
    paise += amount;
    ids.push(fact.id);
  }
  const empty = ids.length === 0;
  return {
    id: "freight_paid",
    title: [fig("freightPaid.title")],
    how: phrasesOf([fig("freightPaid.how"), unpaid ? fig("freightPaid.unpaid", { count: unpaid }) : null]),
    value: moneyOrNone(empty, paise),
    unavailable: false,
    empty,
    emptyState: [fig("freightPaid.empty")],
    source: diaryLink(ids),
    ids,
    extras: [],
  };
}

function summarizeTransport(
  diary: DiaryCoverageFact[],
  freightLinks: Set<string>,
  reads: InsightReadState,
  startMs: number,
  endMs: number
): InsightDraft {
  if (reads.diary === "unavailable") {
    return unavailableInsight("transport_measure", "transport.title", "transport.unread", {
      pathname: "/(app)/diary",
    });
  }
  const weights = new Map<string, UnitBucket>();
  let boxes = 0;
  let missingUnit = 0;
  const ids: string[] = [];
  for (const fact of diary) {
    if (fact.deletedAt) continue;
    if (fact.entryType !== "material_dispatched" && fact.entryType !== "outward_freight_details") continue;
    if (!inPeriod(recordDate(fact), startMs, endMs)) continue;
    if (fact.entryType === "material_dispatched" && freightLinks.has(fact.id)) continue;
    let used = false;
    if (fact.weight != null && fact.weight > 0) {
      if (!fact.weightUnit) missingUnit += 1;
      else {
        addNumberQuantity(weights, fact.weightUnit, fact.weight);
        used = true;
      }
    }
    if (fact.boxes != null && fact.boxes > 0 && !isBoxUnit(fact.materialUnit)) {
      boxes += fact.boxes;
      used = true;
    }
    if (used) ids.push(fact.id);
  }
  const parts = [];
  const weightLabel = formatNumberQuantities(weights);
  if (weightLabel) parts.push(weightLabel);
  if (boxes > 0) parts.push(`${trimNumber(boxes)} boxes`);
  const empty = parts.length === 0;
  return {
    id: "transport_measure",
    title: [fig("transport.title")],
    how: phrasesOf([
      fig("transport.how"),
      missingUnit ? fig("transport.missingUnit", { count: missingUnit }) : null,
    ]),
    value: empty
      ? [fig("none")]
      : [
          ...(weightLabel ? [insightText(weightLabel)] : []),
          ...(boxes > 0 ? [fig("boxes", { count: trimNumber(boxes) })] : []),
        ],
    unavailable: false,
    empty,
    emptyState: [fig("transport.empty")],
    source: diaryLink(ids),
    ids,
    extras: [],
  };
}

function summarizeMaterial(
  diary: DiaryCoverageFact[],
  entryType: BusinessEntryType,
  id: string,
  figure: "materialSent" | "materialReceived" | "materialReturned",
  reads: InsightReadState,
  startMs: number,
  endMs: number
): InsightDraft {
  if (reads.diary === "unavailable") {
    return unavailableInsight(id, `${figure}.title`, `${figure}.unread`, { pathname: "/(app)/diary" });
  }
  const buckets = new Map<string, UnitBucket>();
  let missingUnit = 0;
  const ids: string[] = [];
  for (const fact of diary) {
    if (fact.deletedAt || fact.entryType !== entryType) continue;
    if (!inPeriod(recordDate(fact), startMs, endMs)) continue;
    if (fact.materialQuantity == null || fact.materialQuantity <= 0) continue;
    if (!fact.materialUnit) {
      missingUnit += 1;
      continue;
    }
    addNumberQuantity(buckets, fact.materialUnit, fact.materialQuantity);
    ids.push(fact.id);
  }
  const label = formatNumberQuantities(buckets);
  const empty = !label;
  return {
    id,
    title: [fig(`${figure}.title`)],
    how: phrasesOf([
      fig(`${figure}.how`),
      missingUnit ? fig(`${figure}.missingUnit`, { count: missingUnit }) : null,
    ]),
    value: empty ? [fig("none")] : [insightText(label)],
    unavailable: false,
    empty,
    emptyState: [fig(`${figure}.empty`)],
    source: diaryLink(ids, entryType),
    ids,
    extras: [],
  };
}

function creditAllowed(fact: CreditCoverageFact): boolean {
  return !fact.deletedAt && fact.status !== "cancelled";
}

function summarizeShop(
  credits: CreditCoverageFact[],
  reads: InsightReadState,
  startMs: number,
  endMs: number,
  now: number
): { collected: InsightDraft; balance: InsightDraft } {
  if (reads.credits === "unavailable") {
    return {
      collected: unavailableInsight("shop_money_collected", "shopCollected.title", "shopCollected.unread", {
        pathname: "/(app)/customer-credit",
      }),
      balance: unavailableInsight("shop_balance_open", "shopBalance.title", "shopBalance.unread", {
        pathname: "/(app)/customer-credit",
      }),
    };
  }
  let collected = 0;
  const collectedIds: string[] = [];
  let balance = 0;
  let overdue = 0;
  const balanceIds: string[] = [];
  for (const fact of credits) {
    if (!creditAllowed(fact)) continue;
    const payments = dedupe(fact.payments);
    const paymentPaise = payments.reduce((sum, payment) => {
      if (!inPeriod(payment.paidDate, startMs, endMs)) return sum;
      const paise = positivePaise(payment.amount);
      return paise == null ? sum : sum + paise;
    }, 0);
    let extra = 0;
    if (fact.mode === "cash" && payments.length === 0 && inPeriod(fact.saleDate, startMs, endMs)) {
      extra = positivePaise(fact.saleAmount) ?? 0;
    } else if (fact.mode !== "cash" && inPeriod(fact.saleDate, startMs, endMs)) {
      extra = positivePaise(fact.downPayment) ?? 0;
    }
    if (paymentPaise + extra > 0) {
      collected += paymentPaise + extra;
      collectedIds.push(fact.id);
    }
    if (fact.deletedAt || fact.status === "written_off") continue;
    if (!inPeriod(fact.saleDate, startMs, endMs)) continue;
    const receivable = isReceivable({
      status: fact.status,
      mode: fact.mode,
      shopFollowUpRequired: fact.shopFollowUpRequired,
    } as never);
    if (!receivable) continue;
    const summary = computeCreditSummary(
      {
        schedule: fact.schedule.map((item, index) => ({
          seq: index + 1,
          dueDate: item.dueDate,
          amount: item.amount,
        })),
        payments: payments.map((payment) => ({
          id: payment.id,
          amount: payment.amount,
          paidDate: payment.paidDate,
          mode: "other" as const,
          createdAt: payment.paidDate,
        })),
        totalPayable: fact.totalPayable,
        saleAmount: fact.saleAmount,
        downPayment: fact.downPayment,
      },
      now
    );
    const open = positivePaise(summary.balance);
    if (open == null) continue;
    balance += open;
    overdue += summary.overdueCount;
    balanceIds.push(fact.id);
  }
  return {
    collected: {
      id: "shop_money_collected",
      title: [fig("shopCollected.title")],
      how: [fig("shopCollected.how")],
      value: moneyOrNone(collectedIds.length === 0, collected),
      unavailable: false,
      empty: collectedIds.length === 0,
      emptyState: [fig("shopCollected.empty")],
      source: linkFor(
        "/(app)/customer-credit",
        { pathname: "/(app)/customer-credit/[id]", param: "id" },
        collectedIds
      ),
      ids: collectedIds,
      extras: [],
    },
    balance: {
      id: "shop_balance_open",
      title: [fig("shopBalance.title")],
      how: phrasesOf([
        fig("shopBalance.how"),
        overdue ? fig("shopBalance.overdue", { count: overdue }) : fig("shopBalance.noOverdue"),
      ]),
      value: moneyOrNone(balanceIds.length === 0, balance),
      unavailable: false,
      empty: balanceIds.length === 0,
      emptyState: [fig("shopBalance.empty")],
      source: linkFor(
        "/(app)/customer-credit",
        { pathname: "/(app)/customer-credit/[id]", param: "id" },
        balanceIds
      ),
      ids: balanceIds,
      extras: [],
    },
  };
}

function summarizePurchaseOrders(
  orders: PurchaseOrderCoverageFact[],
  reads: InsightReadState,
  startMs: number,
  endMs: number
): InsightDraft {
  if (reads.purchaseOrders === "unavailable") {
    return unavailableInsight(
      "purchase_order_value",
      "purchaseOrders.title",
      "purchaseOrders.unread",
      { pathname: "/(app)/purchase-order" }
    );
  }
  let paise = 0;
  let cancelled = 0;
  const ids: string[] = [];
  for (const order of orders) {
    if (order.deletedAt) continue;
    if (!inPeriod(order.poDate, startMs, endMs)) continue;
    if (order.status === "cancelled") {
      cancelled += 1;
      continue;
    }
    if (order.status !== "active" || order.grandTotalPaise == null) continue;
    paise += order.grandTotalPaise;
    ids.push(order.id);
  }
  const empty = ids.length === 0;
  return {
    id: "purchase_order_value",
    title: [fig("purchaseOrders.title")],
    how: phrasesOf([
      fig("purchaseOrders.how"),
      cancelled ? fig("purchaseOrders.cancelled", { count: cancelled }) : null,
    ]),
    value: moneyOrNone(empty, paise),
    unavailable: false,
    empty,
    emptyState: [fig("purchaseOrders.empty")],
    source: linkFor(
      "/(app)/purchase-order",
      { pathname: "/(app)/purchase-order/form", param: "id" },
      ids
    ),
    ids,
    extras: [],
  };
}

function grinConfirmedUsable(fact: GrinCoverageFact): fact is GrinCoverageFact & {
  confirmed: NonNullable<GrinCoverageFact["confirmed"]>;
} {
  return (
    fact.projection === "readable" &&
    !fact.detailSkipped &&
    fact.confirmed != null &&
    fact.confirmed.eventVersion >= 1 &&
    !fact.confirmed.voided &&
    fact.confirmed.custody !== "refused_at_gate"
  );
}

function summarizeGrin(
  grin: GrinCoverageFact[],
  reads: InsightReadState,
  startMs: number,
  endMs: number
): { onHand: InsightDraft; invoice: InsightDraft; excluded: InsightDraft } {
  if (reads.grin === "unavailable") {
    return {
      onHand: unavailableInsight("goods_receipt_on_hand", "goodsOnHand.title", "goodsOnHand.unread", {
        pathname: "/(app)/grin",
      }),
      invoice: unavailableInsight("goods_receipt_invoice", "goodsInvoice.title", "goodsInvoice.unread", {
        pathname: "/(app)/grin",
      }),
      excluded: unavailableInsight(
        "activity_goods_receipt_excluded",
        "goodsExcluded.title",
        "goodsExcluded.unread",
        { pathname: "/(app)/grin" }
      ),
    };
  }

  const buckets = new Map<string, Quantity>();
  const onHandIds: string[] = [];
  let skippedLines = 0;
  let outsideFy = 0;
  let undated = 0;
  let considered = 0;
  let inrPaise = 0;
  const invoiceIds: string[] = [];
  const foreign = new Map<string, number>();
  let blankCurrency = 0;
  const excludedIds: string[] = [];
  let excluded = 0;

  for (const fact of grin) {
    if (!grinConfirmedUsable(fact)) {
      excluded += 1;
      excludedIds.push(fact.receiptId);
      continue;
    }
    const when = grinArrivalMs(fact.confirmed.reportedArrivalAt, fact.confirmed.reportedArrivalPrecision);
    if (when == null) {
      undated += 1;
      excludedIds.push(fact.receiptId);
      continue;
    }
    if (!inPeriod(when, startMs, endMs)) {
      outsideFy += 1;
      continue;
    }
    considered += 1;
    const events = dedupeEvents(fact.confirmed.events);
    let lineUsed = false;
    for (const line of fact.confirmed.lines) {
      const available = remainingGrinQuantity(line, events);
      if (!available) {
        skippedLines += 1;
        continue;
      }
      if (compareDecimal(available.value, "0") <= 0) continue;
      const key = unitKey(available.unit);
      const prev = buckets.get(key);
      try {
        buckets.set(key, prev ? addQuantity(prev, available) : available);
        lineUsed = true;
      } catch {
        skippedLines += 1;
      }
    }
    if (lineUsed) onHandIds.push(fact.receiptId);

    const invoice = fact.confirmed.invoice;
    if (invoice && Number.isInteger(invoice.minorUnits) && invoice.minorUnits > 0) {
      const currency = invoice.currency.trim().toUpperCase();
      if (!currency) {
        blankCurrency += 1;
      } else if (currency === "INR") {
        inrPaise += invoice.minorUnits;
        invoiceIds.push(fact.receiptId);
      } else {
        foreign.set(currency, (foreign.get(currency) ?? 0) + 1);
      }
    }
  }

  const qtyParts = [...buckets.values()]
    .sort((a, b) => a.unit.localeCompare(b.unit))
    .map((qty) => `${qty.value} ${qty.unit}`);
  const foreignText = [...foreign.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([currency, count]) => `${count} ${currency}`)
    .join(", ");

  return {
    onHand: {
      id: "goods_receipt_on_hand",
      title: [fig("goodsOnHand.title")],
      how: phrasesOf([
        fig("goodsOnHand.how"),
        outsideFy ? fig("goodsOnHand.outside", { count: outsideFy }) : null,
        undated ? fig("goodsOnHand.undated", { count: undated }) : null,
        skippedLines ? fig("goodsOnHand.skipped", { count: skippedLines }) : null,
      ]),
      value: qtyParts.length === 0 ? [fig("none")] : qtyParts.map((part) => insightText(part)),
      unavailable: false,
      empty: qtyParts.length === 0,
      emptyState: [fig(considered > 0 ? "goodsOnHand.emptySome" : "goodsOnHand.emptyNone")],
      source: linkFor("/(app)/grin", { pathname: "/(app)/grin/[receiptId]", param: "receiptId" }, onHandIds),
      ids: onHandIds,
      extras: [],
    },
    invoice: {
      id: "goods_receipt_invoice",
      title: [fig("goodsInvoice.title")],
      how: phrasesOf([
        fig("goodsInvoice.how"),
        foreignText ? fig("goodsInvoice.foreign", { list: foreignText }) : null,
        blankCurrency ? fig("goodsInvoice.blank", { count: blankCurrency }) : null,
        fig("goodsInvoice.rest"),
      ]),
      value: moneyOrNone(invoiceIds.length === 0, inrPaise),
      unavailable: false,
      empty: invoiceIds.length === 0,
      emptyState: [fig("goodsInvoice.empty")],
      source: linkFor("/(app)/grin", { pathname: "/(app)/grin/[receiptId]", param: "receiptId" }, invoiceIds),
      ids: invoiceIds,
      extras: [],
    },
    excluded: {
      id: "activity_goods_receipt_excluded",
      title: [fig("goodsExcluded.title")],
      how: [fig("goodsExcluded.how")],
      value: excluded === 0 ? [fig("none")] : [fig("receipts", { count: excluded })],
      unavailable: false,
      empty: excluded === 0,
      emptyState: [fig("goodsExcluded.empty")],
      source: { pathname: "/(app)/grin" },
      ids: excludedIds,
      extras: [],
    },
  };
}

function summarizeBriefs(
  packs: ProfessionalPackCoverageFact[],
  reads: InsightReadState,
  startMs: number,
  endMs: number
): InsightDraft {
  if (reads.packs === "unavailable") {
    return unavailableInsight(
      "professional_brief_amounts",
      "briefs.title",
      "briefs.unread",
      { pathname: "/(app)/professional-pack/history" }
    );
  }
  let paise = 0;
  let noAmount = 0;
  let unreadable = 0;
  const amountIds: string[] = [];
  const activityIds: string[] = [];
  for (const pack of packs) {
    if (pack.deletedAt) continue;
    if (!inPeriod(pack.matterDate, startMs, endMs)) continue;
    if (!pack.hasAmountField) {
      noAmount += 1;
      activityIds.push(pack.id);
      continue;
    }
    if (!pack.amountReadable || pack.statedAmountPaise == null) {
      unreadable += 1;
      continue;
    }
    paise += pack.statedAmountPaise;
    amountIds.push(pack.id);
  }
  const linked = amountIds.length > 0 ? amountIds : activityIds;
  const empty = amountIds.length === 0 && noAmount === 0;
  return {
    id: "professional_brief_amounts",
    title: [fig("briefs.title")],
    how: phrasesOf([
      fig("briefs.how"),
      noAmount ? fig("briefs.noAmount", { count: noAmount }) : null,
      unreadable ? fig("briefs.unreadable", { count: unreadable }) : null,
    ]),
    value:
      amountIds.length === 0
        ? noAmount
          ? [fig("briefsNoAmount", { count: noAmount })]
          : [fig("none")]
        : [insightText(formatPaise(paise))],
    unavailable: false,
    empty,
    emptyState: [fig("briefs.empty")],
    source: linkFor(
      "/(app)/professional-pack/history",
      { pathname: "/(app)/professional-pack/[id]", param: "id" },
      linked
    ),
    ids: linked,
    extras: [],
  };
}

function activityDiary(
  diary: DiaryCoverageFact[],
  reads: InsightReadState,
  entryType: BusinessEntryType,
  id: string,
  figure: "work" | "staff" | "letterNotes" | "purchaseReminders" | "emailReminders" | "gstReminders" | "legacy",
  startMs: number,
  endMs: number
): InsightDraft {
  if (reads.diary === "unavailable") {
    return unavailableInsight(id, `${figure}.title`, `${figure}.unread`, { pathname: "/(app)/diary" });
  }
  const ids = diary
    .filter((fact) => !fact.deletedAt && fact.entryType === entryType && inPeriod(recordDate(fact), startMs, endMs))
    .map((fact) => fact.id);
  const empty = ids.length === 0;
  return {
    id,
    title: [fig(`${figure}.title`)],
    how: [fig(`${figure}.how`)],
    value: countValue(ids.length, "recordOne", "records"),
    unavailable: false,
    empty,
    emptyState: [fig(`${figure}.empty`)],
    source: diaryLink(ids, entryType),
    ids,
    extras: [],
  };
}

function summarizeLetterheads(
  docs: LetterheadCoverageFact[],
  reads: InsightReadState,
  startMs: number,
  endMs: number
): InsightDraft {
  if (reads.letterheads === "unavailable") {
    return unavailableInsight("activity_letterhead_document", "letters.title", "letters.unread", {
      pathname: "/(app)/letterhead/history",
    });
  }
  let unsaved = 0;
  const ids: string[] = [];
  for (const doc of docs) {
    if (!inPeriod(doc.dateMs, startMs, endMs)) continue;
    if (!doc.saved) {
      unsaved += 1;
      continue;
    }
    ids.push(doc.id);
  }
  const empty = ids.length === 0;
  return {
    id: "activity_letterhead_document",
    title: [fig("letters.title")],
    how: phrasesOf([fig("letters.how"), unsaved ? fig("letters.unsaved", { count: unsaved }) : null]),
    value: countValue(ids.length, "letterOne", "letterCount"),
    unavailable: false,
    empty,
    emptyState: [fig("letters.empty")],
    source: linkFor(
      "/(app)/letterhead/history",
      { pathname: "/(app)/letterhead/create", param: "documentId" },
      ids
    ),
    ids,
    extras: [],
  };
}

function summarizeDrafts(drafts: DraftCoverageFact[], reads: InsightReadState): InsightDraft {
  if (reads.drafts === "unavailable") {
    return unavailableInsight("activity_open_drafts", "drafts.title", "drafts.unread", {
      pathname: "/(app)/drafts",
    });
  }
  const ids = drafts.map((draft) => draft.id);
  const empty = ids.length === 0;
  return {
    id: "activity_open_drafts",
    title: [fig("drafts.title")],
    how: [fig("drafts.how")],
    value: countValue(ids.length, "draftOne", "draftCount"),
    unavailable: false,
    empty,
    emptyState: [fig("drafts.empty")],
    source: { pathname: "/(app)/drafts" },
    ids,
    extras: [],
    period: [fig("openNow")],
  };
}
