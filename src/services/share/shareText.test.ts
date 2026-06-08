import assert from "node:assert/strict";

import type { BusinessEntry } from "@/domain/businessEntry";
import {
  buildCashPaidShareText,
  buildDukaanShareText,
  buildPaymentRequestShareText,
  buildProfessionalBriefShareText,
} from "./shareTextBuilders";
import { SHARE_TEXT_FOOTER } from "./shareTextFooter";

const t = (key: string) => key;

function paymentEntry(overrides: Record<string, unknown> = {}): BusinessEntry {
  return {
    id: "e1",
    userId: "u1",
    ueid: "VYD-TEST",
    entryType: "payment_request",
    title: "Acme — INV-1",
    entryDate: Date.UTC(2026, 2, 1),
    notes: null,
    reminder: null,
    location: null,
    attachments: [],
    payload: {
      partyName: "Acme Traders",
      invoiceNumber: "INV-1",
      invoiceDate: Date.UTC(2026, 2, 1),
      pendingAmount: 5000,
      dueDate: Date.UTC(2026, 2, 22),
      contactPerson: null,
      requestNote: "Please remit pending dues.",
      includeBankDetailsInPdf: false,
      includePaymentPeriodInPdf: true,
      bankDetails: null,
      ...overrides,
    },
    source: "composer",
    status: "active",
    createdAt: Date.UTC(2026, 2, 1),
    updatedAt: Date.UTC(2026, 2, 1),
    deletedAt: null,
    pdfUri: null,
    documentHistory: {
      firstGeneratedAt: null,
      lastGeneratedAt: null,
      lastEditedAt: null,
      versionNumber: 1,
      editHistory: [],
      pdfGenerationHistory: [],
    },
  } as BusinessEntry;
}

const payText = buildPaymentRequestShareText(paymentEntry(), { t });
assert.ok(payText.includes("Acme Traders"));
assert.ok(payText.includes("Payment period: 21 days"));
assert.ok(!payText.includes("VYD-TEST"));
assert.ok(payText.endsWith(SHARE_TEXT_FOOTER));

const payNoPeriod = buildPaymentRequestShareText(
  paymentEntry({ includePaymentPeriodInPdf: false }),
  { t }
);
assert.ok(!payNoPeriod.includes("Payment period:"));

const cashEntry = paymentEntry();
cashEntry.entryType = "business_cash_given";
cashEntry.payload = {
  amount: 1200,
  givenToName: "Raju",
  purpose: "Site wages",
  paymentDate: Date.UTC(2026, 2, 5),
  paymentMode: "cash",
  settlementStatus: "pending",
  contactMobile: null,
  businessRef: null,
  siteRef: null,
  expectedSettlementDate: null,
  remarks: null,
};
const cashText = buildCashPaidShareText(cashEntry);
assert.ok(cashText.includes("Raju"));
assert.ok(cashText.includes("₹"));
assert.ok(!cashText.includes("attachment"));

const dukaanText = buildDukaanShareText(
  {
    id: "cr1",
    recordNumber: "VYD-CR-0001",
    customerName: "Suresh",
    saleDate: Date.UTC(2026, 1, 10),
    products: [{ productName: "Phone", brandModel: null, serialImei: null, saleAmount: 10000, invoiceNumber: "S-12" }],
    payments: [],
    schedule: [],
    totalPayable: 10000,
    saleAmount: 10000,
    downPayment: 0,
  } as unknown as import("@/domain/customerCredit").CustomerCreditRecord,
  { t }
);
assert.ok(dukaanText.includes("Dukaan — Suresh"));
assert.ok(dukaanText.includes("VYD-CR-0001"));

const proText = buildProfessionalBriefShareText(
  {
    id: "p1",
    title: "GST return support",
    professionalCategory: "ca_tax",
    matterType: "gst_return_support",
    facts: { taxPeriod: "Jan 2026" },
    matterDate: Date.UTC(2026, 1, 31),
    dueDate: null,
    professionalName: null,
    notes: null,
  } as unknown as import("@/domain/professionalPack").ProfessionalServicePack,
  { t }
);
assert.ok(proText.includes("GST return support"));
assert.ok(!proText.includes("ueid"));

console.log("shareText.test.ts: ok");
