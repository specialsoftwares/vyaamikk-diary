import assert from "node:assert/strict";

import {
  addMonths,
  computeChargesBreakdown,
  computeCreditSummary,
  creditDisplayStatus,
  formatCreditNumber,
  generateEmiSchedule,
  isPaidInFull,
  isReceivable,
  isSaleDateAllowed,
  isFirstDueDateAllowed,
  isDukaanPaymentDateAllowed,
  minFirstDueDate,
  minDukaanPaymentDate,
  maxFirstDueDate,
  normalizeCreditCalendarDay,
  primaryDueDate,
  shouldUseClosureFlow,
  type CustomerCreditRecord,
} from "./customerCredit";

// --- record number formatting ---
assert.equal(formatCreditNumber(1), "VYD-CR-0001");
assert.equal(formatCreditNumber(42), "VYD-CR-0042");
assert.equal(formatCreditNumber(12345), "VYD-CR-12345");

// --- addMonths handles month-end clamping ---
const jan31 = new Date(2025, 0, 31).getTime();
const feb = new Date(addMonths(jan31, 1));
assert.equal(feb.getMonth(), 1); // February
assert.ok(feb.getDate() === 28 || feb.getDate() === 29);

// --- schedule sums exactly to total payable (last absorbs remainder) ---
const first = new Date(2025, 0, 10).getTime();
const schedule = generateEmiSchedule({
  balancePrincipal: 10000,
  interestCharges: 0,
  emiCount: 3,
  frequency: "monthly",
  firstDueDate: first,
});
assert.equal(schedule.length, 3);
const scheduleSum = Math.round(schedule.reduce((s, i) => s + i.amount, 0) * 100) / 100;
assert.equal(scheduleSum, 10000);
assert.equal(schedule[0].seq, 1);
// monthly cadence advances the month
assert.equal(new Date(schedule[1].dueDate).getMonth(), 1);

// interest is added to total payable
const withInterest = generateEmiSchedule({
  balancePrincipal: 12000,
  interestCharges: 1000,
  emiCount: 4,
  frequency: "weekly",
  firstDueDate: first,
});
const withInterestSum =
  Math.round(withInterest.reduce((s, i) => s + i.amount, 0) * 100) / 100;
assert.equal(withInterestSum, 13000);
// weekly cadence advances 7 days
assert.equal(withInterest[1].dueDate - withInterest[0].dueDate, 7 * 86_400_000);

// --- payment allocation + statuses ---
const baseRecord: CustomerCreditRecord = {
  id: "r1",
  userId: "u1",
  ueid: "UE",
  serial: 1,
  recordNumber: "VYD-CR-0001",
  status: "active",
  mode: "shop_emi",
  saleDate: first,
  customerName: "Test Customer",
  products: [{ productName: "Phone", saleAmount: 12000 }],
  saleAmount: 12000,
  downPayment: 2000,
  interestCharges: 0,
  totalPayable: 10000,
  emiFrequency: "monthly",
  emiCount: 2,
  firstDueDate: first,
  schedule: [
    { seq: 1, dueDate: new Date(2025, 0, 10).getTime(), amount: 5000 },
    { seq: 2, dueDate: new Date(2099, 0, 10).getTime(), amount: 5000 },
  ],
  payments: [],
  firstGeneratedAt: first,
  version: 1,
  editHistory: [],
  createdAt: first,
  updatedAt: first,
};

// No payments, first instalment is in the past → overdue; balance is full.
const s0 = computeCreditSummary(baseRecord, new Date(2025, 5, 1).getTime());
assert.equal(s0.balance, 10000);
assert.equal(s0.installments[0].status, "overdue");
assert.equal(s0.installments[1].status, "upcoming");
assert.equal(s0.overdueCount, 1);
assert.equal(s0.fullyPaid, false);

// One full payment clears the first instalment.
const s1 = computeCreditSummary(
  { ...baseRecord, payments: [{ id: "p", amount: 5000, paidDate: first, mode: "cash", createdAt: first }] },
  new Date(2025, 5, 1).getTime()
);
assert.equal(s1.totalPaid, 5000);
assert.equal(s1.balance, 5000);
assert.equal(s1.installments[0].status, "paid");
assert.equal(s1.installments[1].status, "upcoming");

// Partial payment → partial status on first instalment.
const s2 = computeCreditSummary(
  { ...baseRecord, payments: [{ id: "p", amount: 2500, paidDate: first, mode: "cash", createdAt: first }] },
  new Date(2025, 5, 1).getTime()
);
assert.equal(s2.installments[0].status, "partial");

// Paying everything marks fully paid.
const s3 = computeCreditSummary(
  { ...baseRecord, payments: [{ id: "p", amount: 10000, paidDate: first, mode: "cash", createdAt: first }] },
  new Date(2025, 5, 1).getTime()
);
assert.equal(s3.balance, 0);
assert.equal(s3.fullyPaid, true);

// --- receivable rules ---
assert.equal(isReceivable(baseRecord), true);
assert.equal(isReceivable({ ...baseRecord, status: "cancelled" }), false);
assert.equal(
  isReceivable({ ...baseRecord, mode: "external_finance", shopFollowUpRequired: false }),
  false
);
assert.equal(
  isReceivable({ ...baseRecord, mode: "external_finance", shopFollowUpRequired: true }),
  true
);

// primaryDueDate returns the next unpaid instalment.
const due = primaryDueDate(baseRecord, new Date(2025, 5, 1).getTime());
assert.equal(due, new Date(2025, 0, 10).getTime());

// --- date policy ---
const now = new Date(2025, 5, 15, 12, 0, 0).getTime();
assert.equal(isSaleDateAllowed(now, now), true);
assert.equal(isSaleDateAllowed(now - 10 * 86_400_000, now), true);
assert.equal(isSaleDateAllowed(now - 20 * 86_400_000, now), false);
assert.equal(isSaleDateAllowed(now + 2 * 86_400_000, now), false);

const saleToday = new Date(now);
saleToday.setHours(0, 0, 0, 0);
const saleTodayMs = saleToday.getTime();
assert.equal(isFirstDueDateAllowed(saleTodayMs, saleTodayMs), false);
assert.equal(isFirstDueDateAllowed(minFirstDueDate(saleTodayMs), saleTodayMs), true);
const salePast = saleTodayMs - 5 * 86_400_000;
assert.equal(isFirstDueDateAllowed(salePast, salePast), false);
assert.equal(isFirstDueDateAllowed(minFirstDueDate(salePast), salePast), true);
assert.equal(isFirstDueDateAllowed(saleTodayMs, salePast), true);
assert.equal(isFirstDueDateAllowed(0, saleTodayMs), false);

// --- Dukaan payment / instalment date policy ---
const invoiceDay = saleTodayMs;
assert.equal(isDukaanPaymentDateAllowed(invoiceDay, invoiceDay), true);
assert.equal(isDukaanPaymentDateAllowed(invoiceDay + 86_400_000, invoiceDay), true);
assert.equal(
  isDukaanPaymentDateAllowed(invoiceDay + 180 * 86_400_000, invoiceDay),
  true,
  "future instalment date allowed"
);
assert.equal(isDukaanPaymentDateAllowed(invoiceDay - 86_400_000, invoiceDay), false);
assert.equal(minDukaanPaymentDate(0, invoiceDay), saleTodayMs);

// --- interest / charges model ---
// none → all zero
assert.equal(computeChargesBreakdown(null, 10000, 12000).totalCharges, 0);
assert.equal(computeChargesBreakdown({ mode: "none" }, 10000, 12000).financedCharges, 0);

// fixed charges are financed
const fixed = computeChargesBreakdown({ mode: "fixed", fixedAmount: 500 }, 10000, 12000);
assert.equal(fixed.financedCharges, 500);
assert.equal(fixed.upfrontCharges, 0);

// interest percentage on principal (default base)
const intP = computeChargesBreakdown({ mode: "interest_pct", interestPercent: 18 }, 10000, 12000);
assert.equal(intP.interestAmount, 1800);
assert.equal(intP.financedCharges, 1800);

// decimal interest on sale base
const intSale = computeChargesBreakdown(
  { mode: "interest_pct", interestPercent: 12.5, base: "sale" },
  10000,
  12000
);
assert.equal(intSale.interestAmount, 1500);

// processing fee upfront is NOT financed
const procUp = computeChargesBreakdown(
  { mode: "processing_pct", processingPercent: 2, processingUpfront: true },
  10000,
  12000
);
assert.equal(procUp.processingAmount, 200);
assert.equal(procUp.upfrontCharges, 200);
assert.equal(procUp.financedCharges, 0);

// processing fee financed is added to EMI total
const procFin = computeChargesBreakdown(
  { mode: "processing_pct", processingAmount: 300, processingUpfront: false },
  10000,
  12000
);
assert.equal(procFin.financedCharges, 300);

// interest + processing combined
const combo = computeChargesBreakdown(
  { mode: "interest_plus_processing", interestPercent: 10, processingPercent: 2, processingUpfront: true },
  10000,
  12000
);
assert.equal(combo.interestAmount, 1000);
assert.equal(combo.processingAmount, 200);
assert.equal(combo.financedCharges, 1000); // processing upfront excluded
assert.equal(combo.totalCharges, 1200);

// manual entry overrides computation
const manual = computeChargesBreakdown(
  { mode: "custom", manualEntered: true, manualChargesAmount: 750 },
  10000,
  12000
);
assert.equal(manual.financedCharges, 750);
assert.equal(manual.manual, true);

// --- paid-in-full / display status ---
assert.equal(isPaidInFull("cash"), true);
assert.equal(isPaidInFull("shop_emi"), false);
assert.equal(creditDisplayStatus({ ...baseRecord, mode: "cash", status: "fully_paid" }), "paid_in_full");
assert.equal(creditDisplayStatus(baseRecord, new Date(2025, 5, 1).getTime()), "overdue");
assert.equal(
  creditDisplayStatus({ ...baseRecord, mode: "external_finance", shopFollowUpRequired: false }),
  "external_finance"
);
assert.equal(creditDisplayStatus({ ...baseRecord, status: "cancelled" }), "closed");

// --- closure flow eligibility ---
assert.equal(shouldUseClosureFlow({ ...baseRecord, status: "fully_paid" }), false);
assert.equal(shouldUseClosureFlow({ ...baseRecord, mode: "cash", status: "active" }), false);
assert.equal(
  shouldUseClosureFlow({
    ...baseRecord,
    mode: "external_finance",
    shopFollowUpRequired: false,
    status: "active",
  }),
  false
);
assert.equal(shouldUseClosureFlow({ ...baseRecord, mode: "shop_emi", status: "active" }), true);

console.log("customerCredit.test.ts: all cases passed");
