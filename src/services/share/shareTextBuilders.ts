import type { BusinessEntry, BusinessEntryType } from "@/domain/businessEntry";
import type { CustomerCreditRecord } from "@/domain/customerCredit";
import { computeCreditSummary } from "@/domain/customerCredit";
import type { ProfessionalServicePack } from "@/domain/professionalPack";
import { getMatterDef } from "@/domain/professionalPackMatters";
import { entryListSummary, entryTypeLabelKey } from "@/utils/businessEntry/display";
import { formatFreightShareMessage } from "@/utils/businessEntry/freightShareMessage";
import { formatPaymentPeriodLine } from "@/utils/businessEntry/paymentPeriod";
import { paymentBankDetailsHasContent } from "@/utils/businessEntry/paymentBankDetails";
import type {
  BusinessCashGivenPayload,
  MaterialDispatchedPayload,
  MaterialReceivedPayload,
  MaterialReturnPayload,
  PaymentRequestPayload,
  ReminderEmailPayload,
  ReminderGstReturnPayload,
  ReminderPurchasePayload,
  StaffMatterPayload,
  WorkUpdateIssuePayload,
} from "@/domain/businessEntry";
import { formatEntryDate } from "@/utils/date";
import { formatINR } from "@/utils/money/inr";
import { formatINRWithWords } from "@/utils/money/inrWords";

import { SHARE_TEXT_FOOTER } from "./shareTextFooter";

export type ShareTextLocale = "en" | "hi";

export interface ShareTextOptions {
  locale?: ShareTextLocale;
  t: (key: string, vars?: Record<string, string | number>) => string;
  freightLabels?: Parameters<typeof formatFreightShareMessage>[1];
}

const FOOTER = SHARE_TEXT_FOOTER;

function withFooter(lines: string[]): string {
  const body = lines.filter((l) => l != null && String(l).trim() !== "").join("\n");
  return `${body}\n\n${FOOTER}`;
}

export function canShareEntryAsText(entryType: BusinessEntryType): boolean {
  return entryType !== "letterhead_matter";
}

export function buildPaymentRequestShareText(
  entry: BusinessEntry,
  opts: ShareTextOptions
): string {
  const p = entry.payload as unknown as PaymentRequestPayload;
  const locale = opts.locale ?? "en";
  const lines: string[] = [
    `Payment request — ${p.partyName}`,
    `Invoice / bill no.: ${p.invoiceNumber}`,
    `Pending amount: ${formatINRWithWords(p.pendingAmount, "en-IN")}`,
  ];
  if (p.invoiceDate) lines.push(`Invoice date: ${formatEntryDate(p.invoiceDate)}`);
  if (p.dueDate) lines.push(`Due date: ${formatEntryDate(p.dueDate)}`);
  if (p.includePaymentPeriodInPdf) {
    const period = formatPaymentPeriodLine(p.invoiceDate, p.dueDate, locale);
    if (period) lines.push(period);
  }
  if (p.contactPerson?.trim()) lines.push(`Contact: ${p.contactPerson.trim()}`);
  if (p.requestNote?.trim()) {
    lines.push("", p.requestNote.trim());
  }
  if (p.includeBankDetailsInPdf && p.bankDetails && paymentBankDetailsHasContent(p.bankDetails)) {
    const b = p.bankDetails;
    lines.push("", "Bank details:");
    if (b.accountHolderName.trim()) lines.push(`Account holder: ${b.accountHolderName.trim()}`);
    if (b.bankName.trim()) lines.push(`Bank: ${b.bankName.trim()}`);
    if (b.accountNumber.trim()) lines.push(`Account no.: ${b.accountNumber.trim()}`);
    if (b.ifsc.trim()) lines.push(`IFSC: ${b.ifsc.trim()}`);
    if (b.upiId?.trim()) lines.push(`UPI: ${b.upiId.trim()}`);
    if (b.paymentInstruction?.trim()) lines.push(b.paymentInstruction.trim());
  }
  return withFooter(lines);
}

export function buildCashPaidShareText(entry: BusinessEntry): string {
  const p = entry.payload as unknown as BusinessCashGivenPayload;
  const paidMs =
    p.paymentDate != null && Number(p.paymentDate) > 0 ? p.paymentDate : entry.entryDate;
  const lines = [
    `Cash paid — ${p.givenToName}`,
    `Amount: ${formatINR(p.amount)}`,
    `Payment date: ${formatEntryDate(paidMs)}`,
    `Purpose: ${p.purpose}`,
  ];
  if (p.businessRef?.trim()) lines.push(`Reference: ${p.businessRef.trim()}`);
  if (p.remarks?.trim()) lines.push(`Note: ${p.remarks.trim()}`);
  return withFooter(lines);
}

export function buildWorkUpdateShareText(entry: BusinessEntry): string {
  const p = entry.payload as unknown as WorkUpdateIssuePayload;
  const lines = [entry.title, `Date: ${formatEntryDate(entry.entryDate)}`];
  if (p.sitePlace?.trim()) lines.push(`Site / place: ${p.sitePlace.trim()}`);
  if (p.workDone?.trim()) lines.push(`Work update: ${p.workDone.trim()}`);
  if (p.issueProblem?.trim()) lines.push(`Follow-up: ${p.issueProblem.trim()}`);
  return withFooter(lines);
}

export function buildStaffMatterShareText(entry: BusinessEntry): string {
  const p = entry.payload as unknown as StaffMatterPayload;
  const lines = [
    `Staff note — ${p.staffName}`,
    `Date: ${formatEntryDate(entry.entryDate)}`,
    p.matterDetails.trim(),
  ];
  if (p.actionRequired?.trim()) lines.push(`Action: ${p.actionRequired.trim()}`);
  return withFooter(lines);
}

export function buildMaterialDispatchedShareText(entry: BusinessEntry): string {
  const p = entry.payload as unknown as MaterialDispatchedPayload;
  const lines = [
    entry.title,
    `Party: ${p.partyName}`,
    `Material: ${p.materialName} — ${p.quantity} ${p.unit}`,
    `Date: ${formatEntryDate(entry.entryDate)}`,
  ];
  if (p.invoiceChallan?.trim()) lines.push(`Invoice / challan: ${p.invoiceChallan.trim()}`);
  if (p.lrGrNumber?.trim()) lines.push(`LR / GR: ${p.lrGrNumber.trim()}`);
  if (p.destination?.trim()) lines.push(`Destination: ${p.destination.trim()}`);
  return withFooter(lines);
}

export function buildMaterialReceivedShareText(entry: BusinessEntry): string {
  const p = entry.payload as unknown as MaterialReceivedPayload;
  const lines = [
    entry.title,
    `Supplier: ${p.supplierName}`,
    `Material: ${p.materialName} — ${p.quantity} ${p.unit}`,
    `Date: ${formatEntryDate(entry.entryDate)}`,
  ];
  if (p.invoiceBill?.trim()) lines.push(`Invoice / bill: ${p.invoiceBill.trim()}`);
  return withFooter(lines);
}

export function buildMaterialReturnShareText(entry: BusinessEntry): string {
  const p = entry.payload as unknown as MaterialReturnPayload;
  const lines = [
    entry.title,
    `Party: ${p.partyName}`,
    `Material: ${p.materialName} — ${p.quantity} ${p.unit}`,
    `Date: ${formatEntryDate(entry.entryDate)}`,
  ];
  if (p.returnReason?.trim()) lines.push(`Reason: ${p.returnReason.trim()}`);
  return withFooter(lines);
}

function buildReminderShareText(entry: BusinessEntry): string {
  const p = entry.payload as unknown as Record<string, unknown>;
  const lines = [entry.title, `Reminder date: ${formatEntryDate(entry.entryDate)}`];
  switch (entry.entryType) {
    case "reminder_purchase": {
      const d = p as unknown as ReminderPurchasePayload;
      if (d.itemMaterial?.trim()) lines.push(`Item: ${d.itemMaterial.trim()}`);
      break;
    }
    case "reminder_email": {
      const d = p as unknown as ReminderEmailPayload;
      if (d.purposeSubject?.trim()) lines.push(`Purpose: ${d.purposeSubject.trim()}`);
      if (d.recipientName?.trim()) lines.push(`Recipient: ${d.recipientName.trim()}`);
      break;
    }
    case "reminder_gst_return": {
      const d = p as unknown as ReminderGstReturnPayload;
      if (d.taxPeriod?.trim()) lines.push(`Tax period: ${d.taxPeriod.trim()}`);
      if (d.returnType) lines.push(`Return: ${String(d.returnType).toUpperCase()}`);
      break;
    }
    default:
      break;
  }
  if (entry.notes?.trim()) lines.push(entry.notes.trim());
  return withFooter(lines);
}

export function buildGenericEntryShareText(entry: BusinessEntry, opts: ShareTextOptions): string {
  const lines = [
    entry.title,
    `${opts.t(entryTypeLabelKey(entry.entryType))} · ${formatEntryDate(entry.entryDate)}`,
  ];
  const summary = entryListSummary(entry, opts.t);
  if (summary) lines.push(summary);
  if (entry.notes?.trim()) {
    lines.push("", entry.notes.trim());
  }
  return withFooter(lines);
}

export function buildBusinessEntryShareText(entry: BusinessEntry, opts: ShareTextOptions): string {
  switch (entry.entryType) {
    case "payment_request":
      return buildPaymentRequestShareText(entry, opts);
    case "business_cash_given":
      return buildCashPaidShareText(entry);
    case "work_update_issue":
      return buildWorkUpdateShareText(entry);
    case "staff_matter":
      return buildStaffMatterShareText(entry);
    case "material_dispatched":
      return buildMaterialDispatchedShareText(entry);
    case "material_received":
      return buildMaterialReceivedShareText(entry);
    case "material_return":
      return buildMaterialReturnShareText(entry);
    case "outward_freight_details":
      if (opts.freightLabels) {
        return `${formatFreightShareMessage(entry, opts.freightLabels)}\n\n${FOOTER}`;
      }
      return buildGenericEntryShareText(entry, opts);
    case "reminder_purchase":
    case "reminder_email":
    case "reminder_gst_return":
      return buildReminderShareText(entry);
    default:
      return buildGenericEntryShareText(entry, opts);
  }
}

export function buildDukaanShareText(
  record: CustomerCreditRecord,
  _opts: Pick<ShareTextOptions, "t">
): string {
  const summary = computeCreditSummary(record);
  const lines = [
    `Dukaan — ${record.customerName}`,
    `Record: ${record.recordNumber}`,
    `Sale date: ${formatEntryDate(record.saleDate)}`,
    `Balance: ${formatINR(summary.balance)}`,
  ];
  const firstProduct = record.products[0];
  if (firstProduct?.invoiceNumber?.trim()) {
    lines.push(`Invoice: ${firstProduct.invoiceNumber.trim()}`);
  }
  if (firstProduct?.productName?.trim()) {
    lines.push(`Product: ${firstProduct.productName.trim()}`);
  }
  return withFooter(lines);
}

export function buildProfessionalBriefShareText(
  pack: ProfessionalServicePack,
  opts: Pick<ShareTextOptions, "t">
): string {
  const matter = getMatterDef(pack.professionalCategory, pack.matterType);
  const lines = [
    pack.title,
    opts.t(`proPack.categories.${pack.professionalCategory}`),
    matter ? opts.t(`proPack.matters.${matter.labelKey}`) : pack.matterType,
    `Matter date: ${formatEntryDate(pack.matterDate)}`,
  ];
  if (pack.dueDate) lines.push(`Due date: ${formatEntryDate(pack.dueDate)}`);
  if (pack.professionalName?.trim()) {
    lines.push(`Professional: ${pack.professionalName.trim()}`);
  }
  const factKeys = matter?.fields.slice(0, 4).map((f) => f.key) ?? [];
  for (const key of factKeys) {
    const val = pack.facts[key];
    if (val == null || String(val).trim() === "") continue;
    const label = opts.t(`proPack.fields.${key}`);
    lines.push(`${label}: ${String(val).trim()}`);
  }
  if (pack.notes?.trim()) lines.push(pack.notes.trim());
  return withFooter(lines);
}
