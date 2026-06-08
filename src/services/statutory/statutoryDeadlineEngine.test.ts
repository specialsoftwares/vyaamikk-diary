import assert from "node:assert/strict";

import { generateAllStatutoryDues } from "./statutoryDeadlineEngine";

function dueParts(ms: number): { y: number; m: number; d: number } {
  const dt = new Date(ms);
  return { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() };
}

/** 5 June 2026 — May-period monthly GST/TDS dues fall in June, not July. */
const ref = new Date(2026, 5, 5, 12, 0, 0, 0);
const dues = generateAllStatutoryDues(ref);

const gstr1May = dues.find(
  (d) =>
    d.templateId === "gst_gstr1_monthly" &&
    d.periodLabel === "May 2026" &&
    dueParts(d.dueDateMs).m === 5 &&
    dueParts(d.dueDateMs).d === 11
);
assert.ok(gstr1May, "GSTR-1 monthly: May 2026 period, due 11 Jun 2026");

const gstr3bMay = dues.find(
  (d) =>
    d.templateId === "gst_gstr3b_monthly" &&
    d.periodLabel === "May 2026" &&
    dueParts(d.dueDateMs).m === 5 &&
    dueParts(d.dueDateMs).d === 20
);
assert.ok(gstr3bMay, "GSTR-3B monthly: May 2026 period, due 20 Jun 2026");

const tdsMay = dues.find(
  (d) =>
    d.templateId === "tds_monthly_deposit" &&
    d.periodLabel === "May 2026 deductions" &&
    dueParts(d.dueDateMs).m === 5 &&
    dueParts(d.dueDateMs).d === 7
);
assert.ok(tdsMay, "TDS deposit: May 2026 deductions, due 7 Jun 2026");

const wrongMayInJuly = dues.find(
  (d) =>
    d.templateId === "gst_gstr1_monthly" &&
    d.periodLabel === "May 2026" &&
    dueParts(d.dueDateMs).m === 6
);
assert.equal(wrongMayInJuly, undefined, "May period must not due in July");

const julyForJunePeriod = dues.find(
  (d) =>
    d.templateId === "gst_gstr1_monthly" &&
    d.periodLabel === "Jun 2026" &&
    dueParts(d.dueDateMs).m === 6 &&
    dueParts(d.dueDateMs).d === 11
);
assert.ok(julyForJunePeriod, "June period GSTR-1 correctly due 11 Jul 2026");

console.log("statutoryDeadlineEngine.test.ts: ok");
