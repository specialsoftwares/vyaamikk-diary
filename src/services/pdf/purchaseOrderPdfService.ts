/**
 * Purchase Order PDF builder.
 *
 * Produces a clean, professional A4 business document. Unlike letterhead PDFs,
 * the PO is allowed a single minimal footer line ("Created using Vyaamikk
 * Diary.") — no UEID, no legal/operator text, no heavy branding.
 *
 * Layout is built to never clip: long item names / addresses wrap, the table
 * uses fixed proportional columns, and page breaks avoid splitting rows.
 */

import {
  computePurchaseOrderTax,
  itemDisplayName,
  type PurchaseOrder,
} from "@/domain/purchaseOrder";
import { assertEnglishOnlyPdf, clearEnglishOnlyPdfContext } from "@/services/pdf/pdfLabels";
import { formatINRInWords } from "@/utils/money/inrWords";
import { formatAmount } from "@/utils/formatters/formatAmount";
import { gstinStateName } from "@/utils/gst/gstin";

export interface PurchaseOrderPdfLabels {
  documentTitle: string; // "PURCHASE ORDER"
  poNumber: string;
  poDate: string;
  status: string;
  cancelled: string;
  to: string; // "Vendor / Supplier"
  from: string; // "Buyer / Order To"
  shipTo: string;
  gstin: string;
  stateLabel: string;
  contact: string;
  reference: string;
  deliveryLocation: string;
  billingLocation: string;
  expectedDelivery: string;
  itemNo: string;
  description: string;
  qty: string;
  unit: string;
  rate: string;
  taxPct: string;
  amount: string;
  subtotal: string;
  cgst: string;
  sgst: string;
  igst: string;
  tax: string;
  total: string;
  amountInWords: string;
  deliveryTerms: string;
  paymentTerms: string;
  freightTerms: string;
  notes: string;
  terms: string;
  taxAsApplicable: string;
  authorisedSignatory: string;
  for: string; // "For {{buyer}}"
  modifiedOn: string;
  footer: string; // "Created using Vyaamikk Diary."
}

export interface BuildPurchaseOrderHtmlOptions {
  po: PurchaseOrder;
  locale: string;
  labels: PurchaseOrderPdfLabels;
  /** Optional company logo data URI (only when the user opted in). */
  logoDataUri?: string | null;
}

type TFn = (k: string, vars?: Record<string, string | number>) => string;

/** Build the PDF label bundle from the i18n function. */
export function purchaseOrderPdfLabels(t: TFn): PurchaseOrderPdfLabels {
  return {
    documentTitle: t("purchaseOrder.pdf.title"),
    poNumber: t("purchaseOrder.pdf.poNumber"),
    poDate: t("purchaseOrder.pdf.poDate"),
    status: t("purchaseOrder.pdf.status"),
    cancelled: t("purchaseOrder.pdf.cancelled"),
    to: t("purchaseOrder.pdf.to"),
    from: t("purchaseOrder.pdf.from"),
    shipTo: t("purchaseOrder.pdf.shipTo"),
    gstin: t("purchaseOrder.pdf.gstin"),
    stateLabel: t("purchaseOrder.pdf.stateLabel"),
    contact: t("purchaseOrder.pdf.contact"),
    reference: t("purchaseOrder.pdf.reference"),
    deliveryLocation: t("purchaseOrder.pdf.deliveryLocation"),
    billingLocation: t("purchaseOrder.pdf.billingLocation"),
    expectedDelivery: t("purchaseOrder.pdf.expectedDelivery"),
    itemNo: t("purchaseOrder.pdf.itemNo"),
    description: t("purchaseOrder.pdf.description"),
    qty: t("purchaseOrder.pdf.qty"),
    unit: t("purchaseOrder.pdf.unit"),
    rate: t("purchaseOrder.pdf.rate"),
    taxPct: t("purchaseOrder.pdf.taxPct"),
    amount: t("purchaseOrder.pdf.amount"),
    subtotal: t("purchaseOrder.pdf.subtotal"),
    cgst: t("purchaseOrder.pdf.cgst"),
    sgst: t("purchaseOrder.pdf.sgst"),
    igst: t("purchaseOrder.pdf.igst"),
    tax: t("purchaseOrder.pdf.tax"),
    total: t("purchaseOrder.pdf.total"),
    amountInWords: t("purchaseOrder.pdf.amountInWords"),
    deliveryTerms: t("purchaseOrder.pdf.deliveryTerms"),
    paymentTerms: t("purchaseOrder.pdf.paymentTerms"),
    freightTerms: t("purchaseOrder.pdf.freightTerms"),
    notes: t("purchaseOrder.pdf.notes"),
    terms: t("purchaseOrder.pdf.terms"),
    taxAsApplicable: t("purchaseOrder.pdf.taxAsApplicable"),
    authorisedSignatory: t("purchaseOrder.pdf.authorisedSignatory"),
    for: t("purchaseOrder.pdf.for"),
    modifiedOn: t("purchaseOrder.pdf.modifiedOn"),
    footer: t("purchaseOrder.pdf.footer"),
  };
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
  if (!value || !value.trim()) return "";
  return `<div class="kv"><span class="k">${esc(label)}</span><span class="v">${esc(value)}</span></div>`;
}

/** Render a party block with name, address, GSTIN+state, PIN, contact. */
function partyBlock(
  label: string,
  opts: {
    name: string;
    address?: string | null;
    gstin?: string | null;
    state?: string | null;
    pin?: string | null;
    contact?: string | null;
    labels: PurchaseOrderPdfLabels;
  }
): string {
  const { labels } = opts;
  const stateName = opts.gstin ? gstinStateName(opts.gstin) : null;
  const stateLine = stateName ?? opts.state ?? null;
  const lines = [
    `<div class="party-name">${esc(opts.name)}</div>`,
    opts.address ? `<div class="party-line">${esc(opts.address)}</div>` : "",
    opts.pin ? `<div class="party-line">PIN: ${esc(opts.pin)}</div>` : "",
    stateLine ? `<div class="party-line">${esc(labels.stateLabel)}: ${esc(stateLine)}</div>` : "",
    opts.gstin ? `<div class="party-line">${esc(labels.gstin)}: ${esc(opts.gstin)}</div>` : "",
    opts.contact ? `<div class="party-line">${esc(labels.contact)}: ${esc(opts.contact)}</div>` : "",
  ];
  return `<div class="party"><div class="party-label">${esc(label)}</div>${lines.join("")}</div>`;
}

export function buildPurchaseOrderHtml(options: BuildPurchaseOrderHtmlOptions): string {
  assertEnglishOnlyPdf("purchaseOrderPdfService");
  try {
  const { po, labels, logoDataUri } = options;
  const locale = "en-IN" as const;
  const cancelled = po.status === "cancelled";
  const tax = computePurchaseOrderTax(po);
  const showTax = po.taxApplicable === "applicable" && tax.taxAmount > 0;

  const itemsRows = po.items
    .map((it, i) => {
      const name = esc(itemDisplayName(it));
      const descLines = (it.descriptionLines ?? [])
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => `<div class="item-desc">${esc(l)}</div>`)
        .join("");
      const rate = it.taxRate != null ? it.taxRate : tax.effectiveRate;
      return `<tr>
        <td class="c-no">${i + 1}</td>
        <td class="c-desc"><div class="item-name">${name}</div>${descLines}</td>
        <td class="c-num">${esc(it.quantity)}</td>
        <td class="c-unit">${esc(it.unit ?? "")}</td>
        <td class="c-num">${esc(fmtMoney(it.rate, locale))}</td>
        ${showTax ? `<td class="c-num">${rate != null ? `${esc(rate)}%` : ""}</td>` : ""}
        <td class="c-num">${esc(fmtMoney(it.amount, locale))}</td>
      </tr>`;
    })
    .join("");

  const shipName = po.shipSameAsBuyer ? po.buyerName : po.shipName;
  const shipBlock =
    po.shipSameAsBuyer || (shipName && shipName.trim())
      ? partyBlock(labels.shipTo, {
          name: shipName || po.buyerName,
          address: po.shipSameAsBuyer ? po.buyerAddress : po.shipAddress,
          state: po.shipSameAsBuyer ? po.buyerState : po.shipState,
          pin: po.shipSameAsBuyer ? po.buyerPin : po.shipPin,
          contact: po.shipSameAsBuyer ? null : po.shipContact,
          labels,
        })
      : "";

  const vendorContact = [po.vendorContactName, po.vendorContactPhone, po.vendorContactEmail]
    .filter((v) => v && v.trim())
    .join(" · ");

  const metaRows = [
    row(labels.reference, po.referenceNumber),
    row(labels.deliveryLocation, po.deliveryLocation),
    po.expectedDeliveryDate
      ? row(labels.expectedDelivery, fmtDate(po.expectedDeliveryDate, locale))
      : "",
  ].join("");

  const termsRows = [
    row(labels.deliveryTerms, po.deliveryTerms),
    row(labels.paymentTerms, po.paymentTerms),
    row(labels.freightTerms, po.freightTerms),
  ].join("");

  const notesBlock = po.notes?.trim()
    ? `<div class="section"><div class="section-title">${esc(labels.notes)}</div><div class="freeform">${esc(po.notes)}</div></div>`
    : "";

  const userTerms = po.terms?.trim() ?? "";
  const asApplicableNote =
    po.taxApplicable === "as_applicable" ? labels.taxAsApplicable : "";
  const combinedTerms = [userTerms, asApplicableNote].filter(Boolean).join("\n");
  const tncBlock = combinedTerms
    ? `<div class="section"><div class="section-title">${esc(labels.terms)}</div><div class="freeform">${esc(combinedTerms)}</div></div>`
    : "";

  const taxSummaryRows = showTax
    ? [
        `<div class="sum-row"><span>${esc(labels.subtotal)}</span><span>${esc(fmtMoney(tax.subtotal, locale))}</span></div>`,
        tax.intraState === true
          ? `<div class="sum-row"><span>${esc(labels.cgst)}</span><span>${esc(fmtMoney(tax.cgst, locale))}</span></div>
             <div class="sum-row"><span>${esc(labels.sgst)}</span><span>${esc(fmtMoney(tax.sgst, locale))}</span></div>`
          : tax.intraState === false
            ? `<div class="sum-row"><span>${esc(labels.igst)}</span><span>${esc(fmtMoney(tax.igst, locale))}</span></div>`
            : `<div class="sum-row"><span>${esc(labels.tax)}</span><span>${esc(fmtMoney(tax.taxAmount, locale))}</span></div>`,
      ].join("")
    : "";

  const grandTotal = showTax ? tax.grandTotal : tax.subtotal;
  const amountWords = formatINRInWords(grandTotal, "en-IN");

  const modifiedBlock =
    po.version > 1 && po.lastEditedAt
      ? `<div class="modified">${esc(labels.modifiedOn)}: ${esc(fmtDate(po.lastEditedAt, locale))}</div>`
      : "";

  const watermark = cancelled ? `<div class="watermark">${esc(labels.cancelled)}</div>` : "";

  const logoBlock =
    logoDataUri && !cancelled
      ? `<img class="logo" src="${logoDataUri}" alt="" />`
      : "";

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
  .doc-head {
    display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 2px solid #2a2f9a; padding-bottom: 8pt; margin-bottom: 12pt; gap: 12pt;
  }
  .head-left { display: flex; align-items: center; gap: 10pt; min-width: 0; }
  .logo { max-height: 46pt; max-width: 140pt; object-fit: contain; }
  .doc-title { font-size: 17pt; font-weight: 800; letter-spacing: 1px; color: #2a2f9a; }
  .po-meta { text-align: right; font-size: 9.5pt; flex-shrink: 0; }
  .po-meta .po-no { font-size: 13pt; font-weight: 800; color: #14172b; }
  .po-meta .po-date { color: #5c5f7a; }
  .status-cancelled { color: #b91c1c; font-weight: 700; }
  .parties { display: flex; flex-wrap: wrap; gap: 8pt; margin-bottom: 10pt; }
  .party { flex: 1 1 30%; min-width: 150pt; border: 1px solid #e6e8f0; border-radius: 4px; padding: 7pt 9pt; }
  .party-label { font-size: 7.5pt; font-weight: 700; color: #3b41c5; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 3pt; }
  .party-name { font-weight: 700; font-size: 10.5pt; word-wrap: break-word; }
  .party-line { color: #44475f; font-size: 9pt; word-wrap: break-word; }
  .kv { display: flex; gap: 6pt; font-size: 9pt; margin: 1pt 0; }
  .kv .k { color: #5c5f7a; min-width: 110pt; font-weight: 600; }
  .kv .v { color: #14172b; word-wrap: break-word; }
  .meta-block { margin-bottom: 8pt; }
  table.items { width: 100%; border-collapse: collapse; margin: 6pt 0 4pt; table-layout: fixed; }
  table.items th {
    background: #eef0ff; color: #2a2f9a; font-size: 8pt; text-transform: uppercase;
    letter-spacing: .3px; text-align: left; padding: 5pt 5pt; border: 1px solid #d6d9ef;
  }
  table.items td { padding: 5pt 5pt; border: 1px solid #e6e8f0; font-size: 9pt; vertical-align: top; word-wrap: break-word; overflow-wrap: anywhere; }
  tr { page-break-inside: avoid; }
  .c-no { width: 6%; text-align: center; }
  .c-desc { width: 44%; }
  .c-unit { width: 9%; }
  .c-num { text-align: right; }
  .item-name { font-weight: 600; }
  .item-desc { color: #5c5f7a; font-size: 8.5pt; }
  .summary { display: flex; justify-content: flex-end; margin-top: 6pt; }
  .summary .sum-box { min-width: 230pt; }
  .sum-row { display: flex; justify-content: space-between; font-size: 9.5pt; padding: 2pt 0; color: #1f2238; }
  .total-row { display: flex; justify-content: space-between; font-weight: 800; font-size: 12pt; color: #2a2f9a; border-top: 2px solid #2a2f9a; padding-top: 5pt; margin-top: 3pt; }
  .words { margin-top: 6pt; font-size: 9pt; }
  .words .k { color: #5c5f7a; font-weight: 600; }
  .section { margin-top: 10pt; page-break-inside: avoid; }
  .section-title { font-size: 8pt; font-weight: 700; color: #3b41c5; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 3pt; border-bottom: 1px solid #e6e8f0; padding-bottom: 2pt; }
  .freeform { white-space: pre-wrap; font-size: 9pt; color: #1f2238; word-wrap: break-word; }
  .sign-area { margin-top: 26pt; display: flex; justify-content: flex-end; page-break-inside: avoid; }
  .sign-box { text-align: center; min-width: 200pt; }
  .sign-line { border-top: 1px solid #14172b; margin-top: 34pt; padding-top: 4pt; font-size: 9pt; color: #44475f; }
  .modified { margin-top: 10pt; font-size: 8.5pt; color: #5c5f7a; }
  .footer { margin-top: 14pt; padding-top: 6pt; border-top: 1px solid #e6e8f0; text-align: center; font-size: 8pt; color: #9aa0b4; }
  .watermark {
    position: fixed; top: 42%; left: 0; right: 0; text-align: center;
    font-size: 64pt; font-weight: 900; color: rgba(185, 28, 28, 0.12);
    transform: rotate(-24deg); letter-spacing: 6px; z-index: 0;
  }
  .content { position: relative; z-index: 1; }
</style>
</head>
<body>
  ${watermark}
  <div class="content">
    <div class="doc-head">
      <div class="head-left">
        ${logoBlock}
        <div>
          <div class="doc-title">${esc(labels.documentTitle)}</div>
          ${cancelled ? `<div class="status-cancelled">${esc(labels.status)}: ${esc(labels.cancelled)}</div>` : ""}
        </div>
      </div>
      <div class="po-meta">
        <div class="po-no">${esc(po.poNumber)}</div>
        <div class="po-date">${esc(labels.poDate)}: ${esc(fmtDate(po.poDate, locale))}</div>
      </div>
    </div>

    <div class="parties">
      ${partyBlock(labels.from, {
        name: po.buyerName,
        address: po.buyerAddress,
        gstin: po.buyerGstin,
        state: po.buyerState,
        pin: po.buyerPin,
        contact: null,
        labels,
      })}
      ${partyBlock(labels.to, {
        name: po.vendorName,
        address: po.vendorAddress,
        gstin: po.vendorGstin,
        state: po.vendorState,
        pin: po.vendorPin,
        contact: vendorContact || null,
        labels,
      })}
      ${shipBlock}
    </div>

    ${metaRows ? `<div class="meta-block">${metaRows}</div>` : ""}

    <table class="items">
      <thead>
        <tr>
          <th class="c-no">${esc(labels.itemNo)}</th>
          <th>${esc(labels.description)}</th>
          <th class="c-num">${esc(labels.qty)}</th>
          <th class="c-unit">${esc(labels.unit)}</th>
          <th class="c-num">${esc(labels.rate)}</th>
          ${showTax ? `<th class="c-num">${esc(labels.taxPct)}</th>` : ""}
          <th class="c-num">${esc(labels.amount)}</th>
        </tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>

    <div class="summary">
      <div class="sum-box">
        ${taxSummaryRows}
        <div class="total-row"><span>${esc(labels.total)}</span><span>${esc(fmtMoney(grandTotal, locale))}</span></div>
      </div>
    </div>
    <div class="words"><span class="k">${esc(labels.amountInWords)}:</span> ${esc(amountWords)}</div>

    ${termsRows ? `<div class="section"><div class="section-title">${esc(labels.terms)}</div>${termsRows}</div>` : ""}
    ${notesBlock}
    ${tncBlock}

    <div class="sign-area">
      <div class="sign-box">
        <div class="sign-line">
          ${esc(labels.for)} ${esc(po.buyerName)}<br/>
          ${esc(po.authorizedBy || labels.authorisedSignatory)}${
            po.authorizedDesignation ? ` · ${esc(po.authorizedDesignation)}` : ""
          }
        </div>
      </div>
    </div>

    ${modifiedBlock}
    <div class="footer">${esc(labels.footer)}</div>
  </div>
</body>
</html>`;
  } finally {
    clearEnglishOnlyPdfContext();
  }
}
