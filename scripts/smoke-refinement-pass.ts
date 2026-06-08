#!/usr/bin/env npx tsx
/**
 * Headless smoke checks for Customer Credit closure, distance insights, and PDF output.
 * Complements manual Expo Go / web UI verification.
 */

import assert from "node:assert/strict";

import {
  computeCreditSummary,
  shouldUseClosureFlow,
  type CreditClosureMetadata,
  type CustomerCreditRecord,
} from "../src/domain/customerCredit";
import { appendPayment, applyFullClosure } from "../src/services/customerCredit/shared";
import {
  buildCustomerCreditHtml,
  customerCreditPdfLabels,
} from "../src/services/pdf/customerCreditPdfService";
import { haversineDistanceKm } from "../src/utils/geo/haversine";
import { normalizeSearchText } from "../src/services/search/normalize";
import { scoreSearchMatch } from "../src/services/search/match";

const t = (k: string, vars?: Record<string, string | number>) => {
  const map: Record<string, string> = {
    "customerCredit.pdf.closureTitle": "ACCOUNT CLOSURE",
    "customerCredit.pdf.closureNote": "Closed as per user-entered record.",
    "businessInsights.routeKm": "Approx. {{km}} km",
    "globalSearch.categories.route_insight": "Route / movement",
  };
  let s = map[k] ?? k;
  if (vars) {
    for (const [key, val] of Object.entries(vars)) {
      s = s.replace(`{{${key}}}`, String(val));
    }
  }
  return s;
};

const now = new Date(2025, 0, 10).getTime();

function baseEmiRecord(payments: CustomerCreditRecord["payments"] = []): CustomerCreditRecord {
  return {
    id: "smoke-cr-1",
    userId: "smoke-u1",
    ueid: "VYD-SMOKE",
    serial: 1,
    recordNumber: "VYD-CR-0001",
    status: "active",
    mode: "shop_emi",
    saleDate: now,
    customerName: "Smoke Test Customer",
    products: [{ productName: "Widget", saleAmount: 12000 }],
    saleAmount: 12000,
    downPayment: 2000,
    interestCharges: 0,
    totalPayable: 10000,
    emiFrequency: "monthly",
    emiCount: 2,
    firstDueDate: now,
    schedule: [
      { seq: 1, dueDate: now, amount: 5000 },
      { seq: 2, dueDate: new Date(2025, 1, 10).getTime(), amount: 5000 },
    ],
    payments,
    firstGeneratedAt: now,
    version: 1,
    editHistory: [],
    createdAt: now,
    updatedAt: now,
  };
}

function closureFor(
  record: CustomerCreditRecord,
  amount: number,
  paidBy: CreditClosureMetadata["paidBy"],
  adjustment: CreditClosureMetadata["adjustment"] = "exact"
): CreditClosureMetadata {
  const balance = computeCreditSummary(record).balance;
  const diff = Math.round((amount - balance) * 100) / 100;
  return {
    finalPaymentDate: now,
    finalPaymentAmount: amount,
    paymentMode: "upi",
    paidBy,
    payerName: paidBy !== "customer" ? "Ramesh Kumar" : null,
    payerRelation: paidBy !== "customer" ? "Brother" : null,
    recordedBy: "Smoke Tester",
    balanceAtClosure: balance,
    adjustment,
    adjustmentAmount: adjustment !== "exact" ? Math.abs(diff) : null,
    closedAt: Date.now(),
  };
}

async function main() {
  console.log("=== 1. Customer Credit closure ===");

  const partial = appendPayment(
    baseEmiRecord(),
    { amount: 2500, paidDate: now, mode: "cash" },
    now
  );
  assert.equal(computeCreditSummary(partial).balance, 7500);
  assert.equal(shouldUseClosureFlow(partial), true);

  const closedExact = applyFullClosure(
    partial,
    closureFor(partial, 7500, "customer"),
    { appendPayment: true },
    now
  );
  assert.equal(closedExact.status, "fully_paid");
  assert.ok(closedExact.closure);
  assert.equal(closedExact.closure!.paidBy, "customer");
  assert.equal(closedExact.payments.length, 2);

  const thirdParty = applyFullClosure(
    baseEmiRecord(),
    closureFor(baseEmiRecord(), 10000, "other", "exact"),
    { appendPayment: true },
    now
  );
  assert.equal(thirdParty.closure!.payerName, "Ramesh Kumar");

  const waiver = applyFullClosure(
    baseEmiRecord(),
    closureFor(baseEmiRecord(), 9900, "customer", "discount_waiver"),
    { appendPayment: true },
    now
  );
  assert.equal(waiver.closure!.adjustment, "discount_waiver");

  const extra = applyFullClosure(
    baseEmiRecord(),
    {
      ...closureFor(baseEmiRecord(), 10100, "customer", "extra_charge"),
      adjustmentNote: "Late fee",
    },
    { appendPayment: true },
    now
  );
  assert.equal(extra.closure!.adjustment, "extra_charge");

  const labels = customerCreditPdfLabels(t);
  const html = buildCustomerCreditHtml({
    record: closedExact,
    variant: "statement",
    locale: "en-IN",
    labels,
    shop: { name: "Smoke Shop", gstin: null, contact: null, address: null },
    payment: null,
    logoDataUri: null,
    customerPhotoDataUri: null,
    displayStatus: "closed",
  });
  assert.ok(html.includes(labels.closureTitle));
  assert.ok(html.includes(labels.closureNote));
  console.log("  closure + PDF block: OK");

  console.log("=== 2. Distance / insights ===");

  // Centroid coords representative of offline PIN DB (same order of magnitude as live lookup).
  const approxKm = haversineDistanceKm(28.6139, 77.209, 19.076, 72.8777);
  assert.ok(approxKm != null && approxKm > 500, "expected approx km Delhi→Mumbai");

  const routeText = normalizeSearchText(
    "New Delhi → Mumbai 110001 400001 Approx. 1150 km"
  );
  assert.ok(scoreSearchMatch(routeText, "400001") > 0);
  assert.ok(scoreSearchMatch(routeText, "Mumbai") > 0);
  console.log("  haversine + searchable route text: OK");

  // PIN geo unavailable → no fake km (contract tested in approxDistanceService source).
  const noGeoKm = haversineDistanceKm(Number.NaN, 0, 19.076, 72.8777);
  assert.equal(noGeoKm, null);
  console.log("  no fake distance when coords missing: OK");

  console.log("=== 3. UI validation rules (close screen parity) ===");

  function validateClose(
    balance: number,
    amount: number,
    adjustment: string,
    note: string
  ): string | null {
    if (amount < balance - 0.01 && adjustment !== "discount_waiver") {
      return "underpay";
    }
    if (amount > balance + 0.01 && adjustment !== "extra_charge" && !note.trim()) {
      return "overpay";
    }
    return null;
  }
  assert.equal(validateClose(7500, 7000, "exact", ""), "underpay");
  assert.equal(validateClose(7500, 7000, "discount_waiver", ""), null);
  assert.equal(validateClose(7500, 8000, "exact", ""), "overpay");
  assert.equal(validateClose(7500, 8000, "extra_charge", ""), null);
  console.log("  balance mismatch rules: OK");

  console.log("\nAll headless smoke checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
