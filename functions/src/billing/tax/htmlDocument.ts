/**
 * VYAAMIKK DIARY — INDIA GST TAX-DOCUMENT MODEL
 *
 * This module must not infer GST liability merely from the payment channel.
 *
 * IGST Act section 14 applies to specified OIDAR supplies made from a
 * non-taxable territory to a non-taxable online recipient. It is not a
 * blanket rule making Google Play or Apple the GST supplier for subscriptions
 * sold by an Indian LLP.
 *
 * For India-based Google Play developers, Google's current tax documentation
 * states that the developer remains responsible for determining applicable
 * GST on app / in-app sales; Google separately handles applicable marketplace
 * TDS / GST-TCS obligations.
 *
 * Apple tax treatment must follow the applicable Paid Apps Agreement /
 * Schedule 2, App Store tax settings and India-specific arrangement. Do not
 * assume Apple's tax responsibility until that channel has been formally
 * classified.
 *
 * Therefore tax-document generation is controlled by a verified
 * PlatformTaxPolicy, not merely by whether the buyer supplied a GSTIN.
 *
 * Direct-web/Razorpay sales, when introduced, are developer-direct supplies
 * and have their own explicitly configured GST treatment.
 *
 * Buyer GST registration determines B2B/B2C recipient classification; it
 * does NOT by itself determine whether Special Softwares or a platform is
 * responsible for charging/reporting tax.
 *
 * No tax invoice may be generated from an unconfirmed tax-responsibility
 * policy.
 */

import type { SubscriptionCreditNoteDoc, SubscriptionInvoiceDoc } from "../types";

import { formatIstCalendarDate } from "./financialYearUtils";

const BRAND = "SPECIAL SOFTWARES";
const PRODUCT = "Vyaamikk Diary";
const ITC_FOOTER =
  "This document may be used as supporting tax-invoice documentation for GST purposes, subject to the recipient's eligibility and applicable GST law.";
const PLATFORM_RECEIPT_NOTE =
  "Payment processed through the platform. The applicable tax document/tax treatment is governed by the platform transaction.";

export const APPROVED_RENDERING_PROFILE = "vyd_tax_document_a4_v1" as const;
export type RenderingProfile = typeof APPROVED_RENDERING_PROFILE;

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paise(n: number | null): string {
  if (n == null) return "—";
  const rupees = Math.floor(n / 100);
  const p = String(Math.abs(n % 100)).padStart(2, "0");
  return `₹${rupees}.${p}`;
}

function titleFor(doc: SubscriptionInvoiceDoc): string {
  if (doc.documentType === "tax_invoice_b2b" || doc.documentType === "tax_invoice_b2c") {
    return "TAX INVOICE";
  }
  if (doc.documentType === "platform_subscription_receipt") return "PLATFORM SUBSCRIPTION RECEIPT";
  return "COMPLIANCE REVIEW — NOT A TAX INVOICE";
}

function issueDateLabel(issuedAt: number | null, issuedOnIst: string | null): string {
  if (issuedOnIst) return issuedOnIst;
  if (issuedAt != null) return formatIstCalendarDate(issuedAt);
  return "—";
}

function reverseChargeLabel(mode: SubscriptionInvoiceDoc["reverseChargeMode"]): string {
  if (mode === "yes") return "Yes";
  if (mode === "no") return "No";
  return "—";
}

function descriptionCell(invoice: SubscriptionInvoiceDoc): string {
  const planLine = invoice.subscriptionDescription ?? "Vyaamikk Diary subscription";
  const sacLine = invoice.serviceDescription;
  return sacLine && sacLine !== planLine ? `${esc(planLine)}<br/>${esc(sacLine)}` : esc(planLine);
}

/**
 * Pure HTML builder. No Expo, no React Native, no logging of document contents.
 */
export function buildSubscriptionTaxDocumentHtml(invoice: SubscriptionInvoiceDoc): string {
  const seller = invoice.seller;
  const buyer = invoice.buyer;
  const isTaxInvoice =
    invoice.documentType === "tax_invoice_b2b" || invoice.documentType === "tax_invoice_b2c";
  const interState = invoice.taxType === "igst";
  const issued = issueDateLabel(invoice.invoiceIssuedAt, invoice.invoiceIssuedOnIst);

  const supplierBlock = seller
    ? `<p><strong>${esc(seller.legalName)}</strong>${
        seller.tradeName ? `<br/>Trade name: ${esc(seller.tradeName)}` : ""
      }<br/>GSTIN: ${esc(seller.gstin)}<br/>${esc(seller.registeredAddress)}<br/>State: ${esc(
        seller.stateName
      )} (${esc(seller.stateCode)})</p>`
    : `<p>Supplier identity incomplete — this document is not a final tax invoice.</p>`;

  const recipientBlock = `<p>${
    buyer.legalName
      ? esc(buyer.legalName)
      : isTaxInvoice && invoice.issueStatus === "issued"
        ? "Recipient particulars incomplete — this document is not a final tax invoice."
        : "Unregistered recipient"
  }<br/>${
    buyer.gstin && buyer.gstinVerificationStatus === "verified"
      ? `GSTIN: ${esc(buyer.gstin)}<br/>`
      : ""
  }${
    buyer.billingAddress ? `${esc(buyer.billingAddress)}<br/>` : ""
  }${
    buyer.stateName && buyer.stateCode
      ? `State: ${esc(buyer.stateName)} (${esc(buyer.stateCode)})`
      : ""
  }</p>`;

  const footer = isTaxInvoice
    ? `<p class="note">${esc(ITC_FOOTER)}</p>`
    : invoice.documentType === "platform_subscription_receipt"
      ? `<p class="note">${esc(PLATFORM_RECEIPT_NOTE)}</p>`
      : `<p class="note">No tax invoice has been issued. Platform tax responsibility is unconfirmed or legal identity is incomplete.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${esc(titleFor(invoice))}</title>
<style>
  body { font-family: Helvetica, Arial, sans-serif; font-size: 12px; color: #111; margin: 0; }
  .page { width: 190mm; margin: 10mm auto; }
  .brand { font-size: 18px; letter-spacing: 0.08em; font-weight: 700; }
  .sub { color: #444; margin-bottom: 16px; }
  h1 { font-size: 16px; margin: 12px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  .note { margin-top: 18px; font-size: 11px; }
  .meta { margin-top: 8px; }
</style>
</head>
<body>
<div class="page">
  <div class="brand">${esc(BRAND)}</div>
  <div class="sub">${esc(PRODUCT)} subscription tax document</div>
  <h1>${esc(titleFor(invoice))}</h1>
  <div class="meta">
    <div>Document number: ${esc(invoice.documentNumber ?? "—")}</div>
    <div>Issue date: ${esc(issued)}</div>
    <div>Place of supply: ${esc(
      invoice.placeOfSupplyStateName
        ? `${invoice.placeOfSupplyStateName} (${invoice.placeOfSupplyStateCode ?? ""})`
        : "—"
    )}</div>
  </div>
  <h2>Supplier</h2>
  ${supplierBlock}
  <h2>Recipient</h2>
  ${recipientBlock}
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>SAC</th>
        <th>Taxable value</th>
        <th>Rate</th>
        <th>Tax</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${descriptionCell(invoice)}</td>
        <td>${esc(invoice.sacCode ?? "—")}</td>
        <td>${paise(invoice.taxableAmountInPaise)}</td>
        <td>${invoice.gstRateBps != null ? `${(invoice.gstRateBps / 100).toFixed(2)}%` : "—"}</td>
        <td>${paise(invoice.totalTaxInPaise)}</td>
        <td>${paise(invoice.totalInPaise)}</td>
      </tr>
    </tbody>
  </table>
  ${
    isTaxInvoice
      ? `<p>CGST: ${paise(invoice.cgstInPaise)} &nbsp; SGST: ${paise(
          invoice.sgstInPaise
        )} &nbsp; IGST: ${paise(invoice.igstInPaise)}</p>
         <p>Reverse charge: ${esc(reverseChargeLabel(invoice.reverseChargeMode))}</p>`
      : ""
  }
  ${interState && isTaxInvoice ? `<p>Inter-State supply. Place of supply as stated above.</p>` : ""}
  ${footer}
  <p class="note">Computer-generated document. Brand mark ${esc(
    BRAND
  )} is a trade presentation; the GST supplier is the legal person on the GST registration.</p>
</div>
</body>
</html>`;
}

export function buildSubscriptionCreditNoteHtml(note: SubscriptionCreditNoteDoc): string {
  const issued = issueDateLabel(note.issuedAt, note.issuedOnIst);
  const originalDate = note.originalInvoiceIssuedOnIst ?? "—";
  const seller = note.seller;
  const buyer = note.buyer;
  const supplierBlock = seller
    ? `<p><strong>${esc(seller.legalName)}</strong>${
        seller.tradeName ? `<br/>Trade name: ${esc(seller.tradeName)}` : ""
      }<br/>GSTIN: ${esc(seller.gstin)}<br/>${esc(seller.registeredAddress)}<br/>State: ${esc(
        seller.stateName
      )} (${esc(seller.stateCode)})</p>`
    : `<p>Supplier identity incomplete — this document is not a final credit note.</p>`;
  const recipientBlock = `<p>${
    buyer?.legalName ? esc(buyer.legalName) : "Recipient particulars incomplete"
  }<br/>${
    buyer?.gstin ? `GSTIN: ${esc(buyer.gstin)}<br/>` : ""
  }${buyer?.billingAddress ? `${esc(buyer.billingAddress)}<br/>` : ""}${
    buyer?.stateName && buyer.stateCode
      ? `State: ${esc(buyer.stateName)} (${esc(buyer.stateCode)})`
      : ""
  }</p>`;
  const interState = note.taxType === "igst";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>CREDIT NOTE</title>
<style>
  body { font-family: Helvetica, Arial, sans-serif; font-size: 12px; color: #111; margin: 0; }
  .page { width: 190mm; margin: 10mm auto; }
  .brand { font-size: 18px; letter-spacing: 0.08em; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
</style>
</head>
<body>
<div class="page">
  <div class="brand">${esc(BRAND)}</div>
  <h1>CREDIT NOTE</h1>
  <div>Nature of document: CREDIT NOTE</div>
  <div>Document number: ${esc(note.documentNumber ?? "—")}</div>
  <div>Issue date: ${esc(issued)}</div>
  <div>Original tax invoice number: ${esc(note.originalDocumentNumber ?? note.originalInvoiceId)}</div>
  <div>Original invoice date: ${esc(originalDate)}</div>
  <div>Place of supply: ${esc(
    note.placeOfSupplyStateName
      ? `${note.placeOfSupplyStateName} (${note.placeOfSupplyStateCode ?? ""})`
      : (note.placeOfSupplyStateCode ?? "—")
  )}</div>
  <h2>Supplier</h2>
  ${supplierBlock}
  <h2>Recipient</h2>
  ${recipientBlock}
  <table>
    <thead>
      <tr>
        <th>Taxable value credited</th>
        <th>Rate</th>
        <th>CGST</th>
        <th>SGST</th>
        <th>IGST</th>
        <th>Total credited</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${paise(note.taxableAmountReversedInPaise)}</td>
        <td>${note.gstRateBps != null ? `${(note.gstRateBps / 100).toFixed(2)}%` : "—"}</td>
        <td>${paise(note.cgstReversedInPaise)}</td>
        <td>${paise(note.sgstReversedInPaise)}</td>
        <td>${paise(note.igstReversedInPaise)}</td>
        <td>${paise(note.totalReversedInPaise)}</td>
      </tr>
    </tbody>
  </table>
  ${interState ? `<p>Inter-State supply. Place of supply as stated above.</p>` : ""}
  <p class="note">Computer-generated document. Brand mark ${esc(
    BRAND
  )} is a trade presentation; the GST supplier is the legal person on the GST registration.</p>
</div>
</body>
</html>`;
}
