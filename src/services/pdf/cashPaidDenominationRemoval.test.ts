import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const cashPaidPdfSrc = fs.readFileSync(
  path.join(process.cwd(), "src/services/pdf/cashPaidPdfService.ts"),
  "utf8"
);
const exportSrc = fs.readFileSync(
  path.join(process.cwd(), "src/services/diary/exportCashPaidPdf.ts"),
  "utf8"
);

assert.ok(!cashPaidPdfSrc.includes("denominationBlock"), "CPV PDF must not render denomination block");
assert.ok(!cashPaidPdfSrc.includes("denominationTable("), "CPV PDF must not include denomination table");
assert.ok(
  !exportSrc.includes("validateDenominationForFullLegal"),
  "export must not block on denomination validation"
);

// Legacy records may still carry denominationBreakdown on payload — PDF path ignores it.
const legacyBreakdown = { 500: 1, 200: 0, 100: 2, 50: 0, total: 700 };
const rendersDenomination =
  cashPaidPdfSrc.includes("payload.denominationBreakdown") &&
  cashPaidPdfSrc.includes("fullLegalRecord");
assert.equal(rendersDenomination, false);

void legacyBreakdown;

console.log("cashPaidDenominationRemoval.test.ts: ok");
