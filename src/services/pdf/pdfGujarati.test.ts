import assert from "node:assert/strict";

import {
  buildCustomerCreditHtml,
  customerCreditPdfLabels,
} from "./customerCreditPdfService";
import { buildPurchaseOrderHtml, purchaseOrderPdfLabels } from "./purchaseOrderPdfService";
import { pdfLabel } from "./pdfLabels";
import type { CustomerCreditRecord } from "@/domain/customerCredit";
import type { PurchaseOrder } from "@/domain/purchaseOrder";

const guT = (key: string) => {
  if (key === "customerCredit.pdf.customer") return "ગ્રાહક";
  return key;
};

const sampleCreditRecord = {
  id: "cc1",
  ueid: "VY-TEST",
  recordNumber: "CC-2026-001",
  saleDate: new Date(2026, 5, 4).getTime(),
  status: "active_emi",
  mode: "shop_emi",
  customerName: "Ravi Traders",
  customerMobile: "9876543210",
  customerAddress: "12 Market Road",
  customerLocality: null,
  customerCity: "Ahmedabad",
  customerState: "Gujarat",
  customerPin: "380001",
  documentType: null,
  documentReference: null,
  products: [
    {
      productName: "LED TV 43",
      brandModel: "Samsung",
      serialImei: "SN-123",
      invoiceNumber: "INV-9",
      saleAmount: 123456,
    },
  ],
  saleAmount: 123456,
  downPayment: 20000,
  schedule: [],
  payments: [],
  remarks: null,
  lastEditedAt: null,
  pdfUri: null,
  clientRecordId: "c1",
  createdAt: Date.now(),
  updatedAt: Date.now(),
} as unknown as CustomerCreditRecord;

function run() {
  const labels = customerCreditPdfLabels(guT, "gu");
  assert.equal(labels.customer, "ગ્રાહક");
  assert.equal(labels.saleDate, "વેચાણ તારીખ");

  const html = buildCustomerCreditHtml({
    record: sampleCreditRecord,
    variant: "sale_record",
    locale: "en-IN",
    labels,
    shop: { name: "Demo Shop", gstin: "24AAAAA0000A1Z5" },
    displayStatus: "active_emi",
    extraCss:
      "@font-face{font-family:'NotoSansGujaratiPdf';src:url(data:font/ttf;base64,TEST) format('truetype');}.content{font-family:'NotoSansGujaratiPdf';}",
  });

  assert.ok(html.includes("ગ્રાહક"), "Gujarati structural label present");
  assert.ok(html.includes("Ravi Traders"), "customer name preserved");
  assert.ok(html.includes("CC-2026-001"), "record number preserved");
  assert.ok(html.includes("₹1,23,456") || html.includes("123,456"), "en-IN amount formatting");
  assert.ok(html.includes("NotoSansGujaratiPdf"), "Gujarati font CSS injected");
  assert.ok(!html.includes("ગ્રાહક Traders"), "customer name not translated");

  assert.equal(pdfLabel("date", { uiLang: "gu" }), "તારીખ");

  const poLabels = purchaseOrderPdfLabels((k) => {
    if (k === "purchaseOrder.pdf.documentTitle") return "Purchase Order";
    if (k === "purchaseOrder.pdf.description") return "Description";
    return "Purchase Order";
  });
  const po = {
    poNumber: "PO-2026-42",
    poDate: sampleCreditRecord.saleDate,
    buyerName: "Buyer Ltd",
    vendorName: "Vendor Inc",
    items: [
      {
        name: "Widget",
        quantity: "10",
        unit: "pcs",
        rate: 100,
        amount: 1000,
        descriptionLines: [],
      },
    ],
    status: "active",
    taxApplicable: "not_applicable",
    totalAmount: 1000,
  } as unknown as PurchaseOrder;

  const poHtml = buildPurchaseOrderHtml({ po, labels: poLabels, locale: "en-IN" });
  assert.ok(!/[\u0A80-\u0AFF]/.test(poHtml), "PO HTML has no Gujarati script");
  assert.ok(poHtml.includes("Purchase Order") || poHtml.includes("PO-2026-42"));
  assert.ok(poHtml.includes("Buyer Ltd"));

  assert.equal(pdfLabel("paymentMode", { uiLang: "gu" }), "મોડ");
  assert.equal(pdfLabel("date", { englishOnly: true }), "Date");

  console.log("pdfGujarati.test.ts: ok");
}

run();
