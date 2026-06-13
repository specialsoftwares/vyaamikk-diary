/**
 * Customer Credit / EMI PDF builder.
 *
 * Produces clean, professional A4 business documents for a customer credit
 * record. Five variants share one layout:
 *   - sale_record      → Customer Credit Sale Record
 *   - emi_schedule     → EMI Schedule
 *   - receipt          → Payment Receipt (for a single payment)
 *   - statement        → Outstanding Balance Statement
 *   - external_finance → External Finance Sale Note
 *
 * IMPORTANT product boundary: this is record-keeping only. The PDFs carry the
 * standard minimal footer ("Created using Vyaamikk Diary.") — no lender / NBFC /
 * loan / KYC language and no legal disclaimer. Customer ID document images are
 * NEVER embedded in these shareable PDFs.
 */

import {
  computeChargesBreakdown,
  computeCreditSummary,
  isPaidInFull,
  type CreditDisplayStatus,
  type CreditPaymentEntry,
  type CustomerCreditRecord,
  type InstallmentStatus,
} from "@/domain/customerCredit";
import type { Lang } from "@/i18n/types";
import { pdfLabel } from "@/services/pdf/pdfLabels";
import { formatAmount } from "@/utils/formatters/formatAmount";
import { formatINRInWords } from "@/utils/money/inrWords";

export type CustomerCreditPdfVariant =
  | "sale_record"
  | "emi_schedule"
  | "receipt"
  | "statement"
  | "external_finance";

export interface CustomerCreditPdfLabels {
  titleSaleRecord: string;
  titleSchedule: string;
  titleReceipt: string;
  titleStatement: string;
  titleFinanceNote: string;
  recordNumber: string;
  saleDate: string;
  status: string;
  customer: string;
  shop: string;
  mobile: string;
  address: string;
  product: string;
  brandModel: string;
  serialImei: string;
  invoiceNo: string;
  saleAmount: string;
  downPayment: string;
  interest: string;
  totalPayable: string;
  balance: string;
  amountInWords: string;
  // schedule
  seq: string;
  dueDate: string;
  amount: string;
  instalmentStatus: string;
  paid: string;
  // ledger / receipt
  paymentDate: string;
  paymentMode: string;
  reference: string;
  receivedAmount: string;
  totalReceived: string;
  ledger: string;
  note: string;
  // external finance
  financer: string;
  financeRef: string;
  financeNote: string;
  financeAmount: string;
  // statuses
  stUpcoming: string;
  stDueToday: string;
  stOverdue: string;
  stPaid: string;
  stPartial: string;
  remarks: string;
  modifiedOn: string;
  footer: string;
  // charges
  interestLabel: string;
  processingFee: string;
  otherCharges: string;
  chargesUpfront: string;
  chargesFinanced: string;
  financeProvidedNote: string;
  // structured address / document
  idDocument: string;
  // mixed voucher sections
  mixedShop: string;
  mixedFinance: string;
  mixedPaid: string;
  customerPaidUpfront: string;
  shopBalance: string;
  paidSoFar: string;
  paidInFull: string;
  // status chips
  chipPaidInFull: string;
  chipActiveEmi: string;
  chipOverdue: string;
  chipClosed: string;
  chipExternalFinance: string;
  // closure
  closureTitle: string;
  closureNote: string;
  closureFinalDate: string;
  closureFinalAmount: string;
  closurePaidBy: string;
  closureRecordedBy: string;
  closureClosedOn: string;
  closureBalanceZero: string;
  closureAdjWaiver: string;
  closureAdjRound: string;
  closureAdjExtra: string;
}

type TFn = (k: string, vars?: Record<string, string | number>) => string;

function applyGujaratiStructuralLabels(
  labels: CustomerCreditPdfLabels
): CustomerCreditPdfLabels {
  const gu = (key: Parameters<typeof pdfLabel>[0]) => pdfLabel(key, { uiLang: "gu" });
  return {
    ...labels,
    recordNumber: gu("recordNumber"),
    saleDate: gu("saleDate"),
    status: gu("status"),
    customer: gu("customer"),
    shop: gu("shop"),
    mobile: gu("mobile"),
    address: gu("address"),
    product: gu("product"),
    saleAmount: gu("amount"),
    balance: gu("balance"),
    amount: gu("amount"),
    dueDate: gu("dueDate"),
    paymentDate: gu("date"),
    paymentMode: gu("paymentMode"),
    reference: gu("reference"),
    receivedAmount: gu("received"),
    totalReceived: gu("received"),
    remarks: gu("remarks"),
    note: gu("note"),
    ledger: gu("ledger"),
    paid: gu("paid"),
    seq: gu("seq"),
  };
}

export function customerCreditPdfLabels(t: TFn, uiLang?: Lang): CustomerCreditPdfLabels {
  const p = (k: string) => t(`customerCredit.pdf.${k}`);
  const base: CustomerCreditPdfLabels = {
    titleSaleRecord: p("titleSaleRecord"),
    titleSchedule: p("titleSchedule"),
    titleReceipt: p("titleReceipt"),
    titleStatement: p("titleStatement"),
    titleFinanceNote: p("titleFinanceNote"),
    recordNumber: p("recordNumber"),
    saleDate: p("saleDate"),
    status: p("status"),
    customer: p("customer"),
    shop: p("shop"),
    mobile: p("mobile"),
    address: p("address"),
    product: p("product"),
    brandModel: p("brandModel"),
    serialImei: p("serialImei"),
    invoiceNo: p("invoiceNo"),
    saleAmount: p("saleAmount"),
    downPayment: p("downPayment"),
    interest: p("interest"),
    totalPayable: p("totalPayable"),
    balance: p("balance"),
    amountInWords: p("amountInWords"),
    seq: p("seq"),
    dueDate: p("dueDate"),
    amount: p("amount"),
    instalmentStatus: p("instalmentStatus"),
    paid: p("paid"),
    paymentDate: p("paymentDate"),
    paymentMode: p("paymentMode"),
    reference: p("reference"),
    receivedAmount: p("receivedAmount"),
    totalReceived: p("totalReceived"),
    ledger: p("ledger"),
    note: p("note"),
    financer: p("financer"),
    financeRef: p("financeRef"),
    financeNote: p("financeNote"),
    financeAmount: p("financeAmount"),
    stUpcoming: p("stUpcoming"),
    stDueToday: p("stDueToday"),
    stOverdue: p("stOverdue"),
    stPaid: p("stPaid"),
    stPartial: p("stPartial"),
    remarks: p("remarks"),
    modifiedOn: p("modifiedOn"),
    footer: p("footer"),
    interestLabel: p("interestLabel"),
    processingFee: p("processingFee"),
    otherCharges: p("otherCharges"),
    chargesUpfront: p("chargesUpfront"),
    chargesFinanced: p("chargesFinanced"),
    financeProvidedNote: p("financeProvidedNote"),
    idDocument: p("idDocument"),
    mixedShop: p("mixedShop"),
    mixedFinance: p("mixedFinance"),
    mixedPaid: p("mixedPaid"),
    customerPaidUpfront: p("customerPaidUpfront"),
    shopBalance: p("shopBalance"),
    paidSoFar: p("paidSoFar"),
    paidInFull: p("paidInFull"),
    chipPaidInFull: p("chipPaidInFull"),
    chipActiveEmi: p("chipActiveEmi"),
    chipOverdue: p("chipOverdue"),
    chipClosed: p("chipClosed"),
    chipExternalFinance: p("chipExternalFinance"),
    closureTitle: p("closureTitle"),
    closureNote: p("closureNote"),
    closureFinalDate: p("closureFinalDate"),
    closureFinalAmount: p("closureFinalAmount"),
    closurePaidBy: p("closurePaidBy"),
    closureRecordedBy: p("closureRecordedBy"),
    closureClosedOn: p("closureClosedOn"),
    closureBalanceZero: p("closureBalanceZero"),
    closureAdjWaiver: p("closureAdjWaiver"),
    closureAdjRound: p("closureAdjRound"),
    closureAdjExtra: p("closureAdjExtra"),
  };
  return uiLang === "gu" ? applyGujaratiStructuralLabels(base) : base;
}

export interface CustomerCreditShopInfo {
  name: string;
  address?: string | null;
  contact?: string | null;
  gstin?: string | null;
}

export interface BuildCustomerCreditHtmlOptions {
  record: CustomerCreditRecord;
  variant: CustomerCreditPdfVariant;
  locale: string;
  labels: CustomerCreditPdfLabels;
  shop: CustomerCreditShopInfo;
  /** Required for the "receipt" variant — the specific payment being receipted. */
  payment?: CreditPaymentEntry | null;
  logoDataUri?: string | null;
  /** Optional, consent-based customer photo as a data URI. */
  customerPhotoDataUri?: string | null;
  /** High-level status for the document chip. */
  displayStatus: CreditDisplayStatus;
  /** Gujarati @font-face CSS injected when UI language is gu. */
  extraCss?: string;
}

function esc(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtMoney(value: number, _locale: string): string {
  return formatAmount(value);
}

function fmtDate(ms: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toDateString();
  }
}

function row(label: string, value: string | null | undefined): string {
  if (!value || !value.toString().trim()) return "";
  return `<div class="kv"><span class="k">${esc(label)}</span><span class="v">${esc(value)}</span></div>`;
}

function statusLabel(status: InstallmentStatus, labels: CustomerCreditPdfLabels): string {
  switch (status) {
    case "paid":
      return labels.stPaid;
    case "partial":
      return labels.stPartial;
    case "overdue":
      return labels.stOverdue;
    case "due_today":
      return labels.stDueToday;
    default:
      return labels.stUpcoming;
  }
}

function partyBlock(
  label: string,
  lines: Array<string | null | undefined>
): string {
  const body = lines
    .filter((l) => l && l.toString().trim())
    .map((l, i) =>
      i === 0
        ? `<div class="party-name">${esc(l)}</div>`
        : `<div class="party-line">${esc(l)}</div>`
    )
    .join("");
  return `<div class="party"><div class="party-label">${esc(label)}</div>${body}</div>`;
}

function chipLabel(status: CreditDisplayStatus, labels: CustomerCreditPdfLabels): string {
  switch (status) {
    case "paid_in_full":
      return labels.chipPaidInFull;
    case "active_emi":
      return labels.chipActiveEmi;
    case "overdue":
      return labels.chipOverdue;
    case "closed":
      return labels.chipClosed;
    case "external_finance":
      return labels.chipExternalFinance;
    default:
      return "";
  }
}

function titleForVariant(
  variant: CustomerCreditPdfVariant,
  labels: CustomerCreditPdfLabels
): string {
  switch (variant) {
    case "emi_schedule":
      return labels.titleSchedule;
    case "receipt":
      return labels.titleReceipt;
    case "statement":
      return labels.titleStatement;
    case "external_finance":
      return labels.titleFinanceNote;
    default:
      return labels.titleSaleRecord;
  }
}

export function buildCustomerCreditHtml(options: BuildCustomerCreditHtmlOptions): string {
  const {
    record,
    variant,
    locale,
    labels,
    shop,
    payment,
    logoDataUri,
    customerPhotoDataUri,
    displayStatus,
    extraCss = "",
  } = options;
  const inrLocale = "en-IN" as const;
  const formatLocale = inrLocale;
  const summary = computeCreditSummary(record);
  const paidInFull = isPaidInFull(record.mode);

  const addressLine = [record.customerAddress, record.customerLocality]
    .filter((v) => v && v.toString().trim())
    .join(", ");
  const cityLine = [record.customerCity, record.customerState]
    .filter((v) => v && v.toString().trim())
    .join(", ");
  const docLine =
    record.documentType && record.documentReference
      ? `${labels.idDocument}: ${record.documentReference}`
      : null;

  const photoBlock = customerPhotoDataUri
    ? `<img class="cust-photo" src="${customerPhotoDataUri}" alt="" />`
    : "";

  const customerBlock = `<div class="party party-cust">
      ${photoBlock}
      <div class="party-body">
        <div class="party-label">${esc(labels.customer)}</div>
        <div class="party-name">${esc(record.customerName)}</div>
        ${record.customerMobile ? `<div class="party-line">${esc(labels.mobile)}: ${esc(record.customerMobile)}</div>` : ""}
        ${addressLine ? `<div class="party-line">${esc(addressLine)}</div>` : ""}
        ${
          record.customerPin
            ? `<div class="party-line">PIN: ${esc(record.customerPin)}${cityLine ? ` · ${esc(cityLine)}` : ""}</div>`
            : cityLine
              ? `<div class="party-line">${esc(cityLine)}</div>`
              : ""
        }
        ${docLine ? `<div class="party-line">${esc(docLine)}</div>` : ""}
      </div>
    </div>`;

  const shopBlock = partyBlock(labels.shop, [
    shop.name,
    shop.address,
    shop.gstin ? `GSTIN: ${shop.gstin}` : null,
    shop.contact,
  ]);

  // Product table (sale_record / external_finance / statement headers).
  const productRows = record.products
    .map((pr, i) => {
      const extra = [
        pr.brandModel ? `${esc(labels.brandModel)}: ${esc(pr.brandModel)}` : "",
        pr.serialImei ? `${esc(labels.serialImei)}: ${esc(pr.serialImei)}` : "",
        pr.invoiceNumber ? `${esc(labels.invoiceNo)}: ${esc(pr.invoiceNumber)}` : "",
      ]
        .filter(Boolean)
        .map((l) => `<div class="item-desc">${l}</div>`)
        .join("");
      return `<tr>
        <td class="c-no">${i + 1}</td>
        <td class="c-desc"><div class="item-name">${esc(pr.productName)}</div>${extra}</td>
        <td class="c-num">${esc(fmtMoney(pr.saleAmount, formatLocale))}</td>
      </tr>`;
    })
    .join("");

  const productTable = `
    <table class="items">
      <thead>
        <tr>
          <th class="c-no">#</th>
          <th>${esc(labels.product)}</th>
          <th class="c-num">${esc(labels.saleAmount)}</th>
        </tr>
      </thead>
      <tbody>${productRows}</tbody>
    </table>`;

  // EMI schedule table.
  const scheduleRows = summary.installments
    .map(
      (it) => `<tr>
        <td class="c-no">${it.seq}</td>
        <td>${esc(fmtDate(it.dueDate, formatLocale))}</td>
        <td class="c-num">${esc(fmtMoney(it.amount, formatLocale))}</td>
        <td class="c-num">${esc(fmtMoney(it.paidAmount, formatLocale))}</td>
        <td><span class="pill pill-${it.status}">${esc(statusLabel(it.status, labels))}</span></td>
      </tr>`
    )
    .join("");

  const scheduleTable =
    summary.installments.length > 0
      ? `<table class="items">
          <thead>
            <tr>
              <th class="c-no">${esc(labels.seq)}</th>
              <th>${esc(labels.dueDate)}</th>
              <th class="c-num">${esc(labels.amount)}</th>
              <th class="c-num">${esc(labels.paid)}</th>
              <th>${esc(labels.instalmentStatus)}</th>
            </tr>
          </thead>
          <tbody>${scheduleRows}</tbody>
        </table>`
      : "";

  // Payment ledger table.
  const ledgerRows = record.payments
    .slice()
    .sort((a, b) => a.paidDate - b.paidDate)
    .map(
      (p) => `<tr>
        <td>${esc(fmtDate(p.paidDate, formatLocale))}</td>
        <td>${esc(p.mode)}</td>
        <td>${esc(p.reference ?? "")}</td>
        <td class="c-num">${esc(fmtMoney(p.amount, formatLocale))}</td>
      </tr>`
    )
    .join("");

  const ledgerTable =
    record.payments.length > 0
      ? `<div class="section"><div class="section-title">${esc(labels.ledger)}</div>
          <table class="items">
            <thead>
              <tr>
                <th>${esc(labels.paymentDate)}</th>
                <th>${esc(labels.paymentMode)}</th>
                <th>${esc(labels.reference)}</th>
                <th class="c-num">${esc(labels.receivedAmount)}</th>
              </tr>
            </thead>
            <tbody>${ledgerRows}</tbody>
          </table>
        </div>`
      : "";

  // Charges breakdown (interest / processing / other).
  const principalBalance = Math.max(0, record.saleAmount - (record.downPayment ?? 0));
  const charges = computeChargesBreakdown(record.charges, principalBalance, record.saleAmount);
  const chargesRows = [
    charges.interestAmount > 0
      ? `<div class="sum-row"><span>${esc(labels.interestLabel)}</span><span>${esc(fmtMoney(charges.interestAmount, formatLocale))}</span></div>`
      : "",
    charges.processingAmount > 0
      ? `<div class="sum-row"><span>${esc(labels.processingFee)}${charges.processingUpfront ? ` (${esc(labels.chargesUpfront)})` : ""}</span><span>${esc(fmtMoney(charges.processingAmount, formatLocale))}</span></div>`
      : "",
    charges.otherAmount > 0
      ? `<div class="sum-row"><span>${esc(labels.otherCharges)}</span><span>${esc(fmtMoney(charges.otherAmount, formatLocale))}</span></div>`
      : "",
  ].join("");

  // Money summary.
  const moneySummary = `
    <div class="summary"><div class="sum-box">
      ${`<div class="sum-row"><span>${esc(labels.saleAmount)}</span><span>${esc(fmtMoney(record.saleAmount, formatLocale))}</span></div>`}
      ${record.downPayment ? `<div class="sum-row"><span>${esc(labels.downPayment)}</span><span>${esc(fmtMoney(record.downPayment, formatLocale))}</span></div>` : ""}
      ${chargesRows}
      ${summary.totalPayable > 0 ? `<div class="sum-row"><span>${esc(labels.totalPayable)}</span><span>${esc(fmtMoney(summary.totalPayable, formatLocale))}</span></div>` : ""}
      <div class="sum-row"><span>${esc(labels.totalReceived)}</span><span>${esc(fmtMoney(summary.totalPaid, formatLocale))}</span></div>
      <div class="total-row"><span>${esc(paidInFull ? labels.paidInFull : labels.balance)}</span><span>${esc(paidInFull ? fmtMoney(summary.totalPaid || record.saleAmount, formatLocale) : fmtMoney(summary.balance, formatLocale))}</span></div>
    </div></div>`;

  // Mixed-voucher component breakdown (shop / external finance / customer paid).
  const financedExternally = Math.max(0, record.financeAmount ?? 0);
  const customerUpfront = Math.max(0, record.downPayment ?? 0);
  const shopBalance = Math.max(0, record.saleAmount - customerUpfront - financedExternally);
  const mixedSections =
    record.mode === "mixed"
      ? `<div class="mixed">
          <div class="mixed-col">
            <div class="section-title">${esc(labels.mixedPaid)}</div>
            ${row(labels.customerPaidUpfront, customerUpfront > 0 ? fmtMoney(customerUpfront, formatLocale) : "—")}
            ${row(labels.paidSoFar, fmtMoney(summary.totalPaid, formatLocale))}
          </div>
          <div class="mixed-col">
            <div class="section-title">${esc(labels.mixedFinance)}</div>
            ${row(labels.financer, record.financerName)}
            ${row(labels.financeRef, record.financeRefNumber)}
            ${row(labels.financeAmount, financedExternally > 0 ? fmtMoney(financedExternally, formatLocale) : "—")}
          </div>
          <div class="mixed-col">
            <div class="section-title">${esc(labels.mixedShop)}</div>
            ${row(labels.shopBalance, fmtMoney(shopBalance, formatLocale))}
            ${row(labels.totalPayable, summary.totalPayable > 0 ? fmtMoney(summary.totalPayable, formatLocale) : "—")}
            ${row(labels.balance, fmtMoney(summary.balance, formatLocale))}
          </div>
        </div>`
      : "";

  // ---- Per-variant body assembly ----
  let body = "";
  let wordsLine = "";

  if (variant === "receipt" && payment) {
    body = `
      <div class="section"><div class="section-title">${esc(labels.titleReceipt)}</div>
        ${row(labels.paymentDate, fmtDate(payment.paidDate, formatLocale))}
        ${row(labels.paymentMode, payment.mode)}
        ${row(labels.reference, payment.reference)}
        ${row(labels.receivedAmount, fmtMoney(payment.amount, formatLocale))}
        ${payment.note ? row(labels.note, payment.note) : ""}
      </div>
      <div class="summary"><div class="sum-box">
        <div class="sum-row"><span>${esc(labels.totalReceived)}</span><span>${esc(fmtMoney(summary.totalPaid, formatLocale))}</span></div>
        <div class="total-row"><span>${esc(labels.balance)}</span><span>${esc(fmtMoney(summary.balance, formatLocale))}</span></div>
      </div></div>`;
    wordsLine = `<div class="words"><span class="k">${esc(labels.amountInWords)}:</span> ${esc(
      formatINRInWords(payment.amount, inrLocale)
    )}</div>`;
  } else if (variant === "emi_schedule") {
    body = `${mixedSections}${moneySummary}${scheduleTable ? `<div class="section"><div class="section-title">${esc(labels.titleSchedule)}</div>${scheduleTable}</div>` : ""}`;
  } else if (variant === "statement") {
    body = `${productTable}${mixedSections}${moneySummary}${ledgerTable}${scheduleTable ? `<div class="section"><div class="section-title">${esc(labels.titleSchedule)}</div>${scheduleTable}</div>` : ""}`;
    wordsLine = `<div class="words"><span class="k">${esc(labels.amountInWords)}:</span> ${esc(
      formatINRInWords(summary.balance, inrLocale)
    )}</div>`;
  } else if (variant === "external_finance") {
    body = `
      <div class="section"><div class="section-title">${esc(labels.titleFinanceNote)}</div>
        ${row(labels.financer, record.financerName)}
        ${row(labels.financeRef, record.financeRefNumber)}
        ${financedExternally > 0 ? row(labels.financeAmount, fmtMoney(financedExternally, formatLocale)) : ""}
        ${record.financeDownPayment ? row(labels.downPayment, fmtMoney(record.financeDownPayment, formatLocale)) : ""}
      </div>
      ${productTable}
      ${record.charges?.financeProvided ? `<div class="freeform-note">${esc(labels.financeProvidedNote)}</div>` : ""}
      <div class="freeform-note">${esc(labels.financeNote)}</div>`;
  } else {
    // sale_record (default)
    body = `${productTable}${mixedSections}${moneySummary}`;
    wordsLine = `<div class="words"><span class="k">${esc(labels.amountInWords)}:</span> ${esc(
      formatINRInWords(record.saleAmount, inrLocale)
    )}</div>`;
  }

  const closure = record.closure;
  const paidByDisplay = closure
    ? closure.paidBy === "customer"
      ? labels.customer
      : [closure.payerName, closure.payerRelation].filter(Boolean).join(" · ") || closure.paidBy
    : "";

  const closureBlock = closure
    ? `<div class="section closure">
        <div class="section-title">${esc(labels.closureTitle)}</div>
        <div class="freeform-note">${esc(labels.closureNote)}</div>
        ${row(labels.closureFinalDate, fmtDate(closure.finalPaymentDate, formatLocale))}
        ${row(labels.closureFinalAmount, fmtMoney(closure.finalPaymentAmount, formatLocale))}
        ${row(labels.paymentMode, closure.paymentMode)}
        ${closure.paymentReference ? row(labels.reference, closure.paymentReference) : ""}
        ${row(labels.closurePaidBy, paidByDisplay)}
        ${row(labels.closureRecordedBy, closure.recordedBy)}
        ${row(labels.closureClosedOn, fmtDate(closure.closedAt, formatLocale))}
        ${row(labels.closureBalanceZero, fmtMoney(0, formatLocale))}
        ${
          closure.adjustment === "discount_waiver" && closure.adjustmentAmount
            ? row(labels.closureAdjWaiver, fmtMoney(closure.adjustmentAmount, formatLocale))
            : ""
        }
        ${
          closure.adjustment === "round_off" && closure.adjustmentAmount
            ? row(labels.closureAdjRound, fmtMoney(closure.adjustmentAmount, formatLocale))
            : ""
        }
        ${
          closure.adjustment === "extra_charge" && closure.adjustmentAmount
            ? row(labels.closureAdjExtra, fmtMoney(closure.adjustmentAmount, formatLocale))
            : ""
        }
        ${closure.closingRemarks ? row(labels.note, closure.closingRemarks) : ""}
      </div>`
    : "";

  const remarksBlock = record.remarks?.trim()
    ? `<div class="section"><div class="section-title">${esc(labels.remarks)}</div><div class="freeform">${esc(record.remarks)}</div></div>`
    : "";

  const modifiedBlock =
    record.version > 1 && record.lastEditedAt
      ? `<div class="modified">${esc(labels.modifiedOn)}: ${esc(fmtDate(record.lastEditedAt, formatLocale))}</div>`
      : "";

  const logoBlock = logoDataUri ? `<img class="logo" src="${logoDataUri}" alt="" />` : "";

  return `<!DOCTYPE html>
<html lang="${esc(locale)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  @page { size: A4; margin: 14mm 13mm 16mm 13mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; background: #ffffff; color: #14172b;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari", sans-serif;
    font-size: 10pt; line-height: 1.4;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .doc-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f766e; padding-bottom: 8pt; margin-bottom: 12pt; gap: 12pt; }
  .head-left { display: flex; align-items: center; gap: 10pt; min-width: 0; }
  .logo { max-height: 46pt; max-width: 140pt; object-fit: contain; }
  .doc-title { font-size: 16pt; font-weight: 800; letter-spacing: .5px; color: #0f766e; }
  .meta { text-align: right; font-size: 9.5pt; flex-shrink: 0; }
  .meta .no { font-size: 13pt; font-weight: 800; color: #14172b; }
  .meta .date { color: #5c5f7a; }
  .status-chip { display: inline-block; margin-top: 4pt; padding: 2pt 8pt; border-radius: 10pt; font-size: 8pt; font-weight: 800; text-transform: uppercase; letter-spacing: .4px; }
  .chip-paid_in_full { background: #dcfce7; color: #166534; }
  .chip-active_emi { background: #e0e7ff; color: #3730a3; }
  .chip-overdue { background: #fee2e2; color: #b91c1c; }
  .chip-closed { background: #e5e7eb; color: #374151; }
  .chip-external_finance { background: #ffedd5; color: #c2410c; }
  .parties { display: flex; flex-wrap: wrap; gap: 8pt; margin-bottom: 10pt; }
  .party { flex: 1 1 40%; min-width: 170pt; border: 1px solid #e6e8f0; border-radius: 4px; padding: 7pt 9pt; }
  .party-cust { display: flex; gap: 9pt; align-items: flex-start; }
  .party-cust .party-body { min-width: 0; flex: 1; }
  .cust-photo { width: 54pt; height: 72pt; object-fit: cover; border-radius: 4px; border: 1px solid #e6e8f0; flex-shrink: 0; }
  .party-label { font-size: 7.5pt; font-weight: 700; color: #0f766e; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 3pt; }
  .party-name { font-weight: 700; font-size: 10.5pt; word-wrap: break-word; }
  .party-line { color: #44475f; font-size: 9pt; word-wrap: break-word; }
  .mixed { display: flex; gap: 8pt; margin-top: 10pt; flex-wrap: wrap; }
  .mixed-col { flex: 1 1 30%; min-width: 150pt; border: 1px solid #e6e8f0; border-radius: 4px; padding: 7pt 9pt; }
  .mixed-col .kv { flex-direction: column; gap: 0; }
  .mixed-col .kv .k { min-width: 0; }
  .kv { display: flex; gap: 6pt; font-size: 9pt; margin: 1pt 0; }
  .kv .k { color: #5c5f7a; min-width: 120pt; font-weight: 600; }
  .kv .v { color: #14172b; word-wrap: break-word; }
  table.items { width: 100%; border-collapse: collapse; margin: 6pt 0 4pt; table-layout: fixed; }
  table.items th { background: #e7f6f3; color: #0f766e; font-size: 8pt; text-transform: uppercase; letter-spacing: .3px; text-align: left; padding: 5pt; border: 1px solid #cfe9e4; }
  table.items td { padding: 5pt; border: 1px solid #e6e8f0; font-size: 9pt; vertical-align: top; word-wrap: break-word; overflow-wrap: anywhere; }
  tr { page-break-inside: avoid; }
  .c-no { width: 7%; text-align: center; }
  .c-desc { width: 56%; }
  .c-num { text-align: right; }
  .item-name { font-weight: 600; }
  .item-desc { color: #5c5f7a; font-size: 8.5pt; }
  .pill { display: inline-block; padding: 1pt 6pt; border-radius: 8pt; font-size: 8pt; font-weight: 700; }
  .pill-paid { background: #dcfce7; color: #166534; }
  .pill-partial { background: #fef9c3; color: #854d0e; }
  .pill-overdue { background: #fee2e2; color: #b91c1c; }
  .pill-due_today { background: #ffedd5; color: #c2410c; }
  .pill-upcoming { background: #e0e7ff; color: #3730a3; }
  .summary { display: flex; justify-content: flex-end; margin-top: 6pt; }
  .summary .sum-box { min-width: 240pt; }
  .sum-row { display: flex; justify-content: space-between; font-size: 9.5pt; padding: 2pt 0; color: #1f2238; }
  .total-row { display: flex; justify-content: space-between; font-weight: 800; font-size: 12pt; color: #0f766e; border-top: 2px solid #0f766e; padding-top: 5pt; margin-top: 3pt; }
  .words { margin-top: 6pt; font-size: 9pt; }
  .words .k { color: #5c5f7a; font-weight: 600; }
  .section { margin-top: 10pt; page-break-inside: avoid; }
  .section-title { font-size: 8pt; font-weight: 700; color: #0f766e; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 3pt; border-bottom: 1px solid #e6e8f0; padding-bottom: 2pt; }
  .freeform { white-space: pre-wrap; font-size: 9pt; color: #1f2238; word-wrap: break-word; }
  .freeform-note { margin-top: 8pt; font-size: 8.5pt; color: #5c5f7a; font-style: italic; }
  .modified { margin-top: 10pt; font-size: 8.5pt; color: #5c5f7a; }
  .footer { margin-top: 14pt; padding-top: 6pt; border-top: 1px solid #e6e8f0; font-size: 7.5pt; color: #9aa0b4; }
  .footer-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12pt; }
  .footer-left { text-align: left; flex: 1; }
  .footer-right { text-align: right; white-space: nowrap; }
${extraCss}
</style>
</head>
<body>
  <div class="content">
    <div class="doc-head">
      <div class="head-left">
        ${logoBlock}
        <div class="doc-title">${esc(titleForVariant(variant, labels))}</div>
      </div>
      <div class="meta">
        <div class="no">${esc(record.recordNumber)}</div>
        <div class="date">${esc(labels.saleDate)}: ${esc(fmtDate(record.saleDate, formatLocale))}</div>
        <div class="status-chip chip-${displayStatus}">${esc(chipLabel(displayStatus, labels))}</div>
      </div>
    </div>

    <div class="parties">
      ${shopBlock}
      ${customerBlock}
    </div>

    ${body}
    ${wordsLine}
    ${closureBlock}
    ${remarksBlock}
    ${modifiedBlock}
    <div class="footer"><div class="footer-row"><div class="footer-left">${esc(labels.footer)}</div><div class="footer-right">Page 1</div></div></div>
  </div>
</body>
</html>`;
}
