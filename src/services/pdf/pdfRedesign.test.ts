import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildPdfFooterLine, pdfFooterHtml } from "./pdfLayout";
import { PDF_ATTRIBUTION } from "./pdfTheme";
import { pdfShortFooterHtml } from "./pdfFooter";

const FORBIDDEN = [
  "Ananya Engineered",
  "Legally operated by",
  "SPECIAL SOFTWARES",
  "platform does not verify",
  "Vyaamikk ID:",
  "User-generated payment request",
];

const pdfDir = import.meta.dirname;

function read(name: string): string {
  return fs.readFileSync(path.join(pdfDir, name), "utf8");
}

function assertNoForbiddenInSource(label: string, source: string): void {
  for (const token of FORBIDDEN) {
    assert.equal(source.includes(token), false, `${label} must not contain: ${token}`);
  }
}

// ---- Short footer ----
assert.equal(buildPdfFooterLine(), PDF_ATTRIBUTION);
const footer = pdfShortFooterHtml({ pageLabel: "Page", generatedAtMs: Date.now() });
assert.ok(footer.includes(PDF_ATTRIBUTION), "footer has attribution");
assert.ok(footer.includes("Page 1"), "footer has page number");
assertNoForbiddenInSource("pdfShortFooterHtml", footer);

const legacyFooter = pdfFooterHtml({
  userName: "Test",
  ueid: "VY-1",
  generatedAtMs: Date.now(),
  pageLabel: "Page",
});
assertNoForbiddenInSource("pdfFooterHtml", legacyFooter);

// ---- Core templates migrated to design system ----
const businessTpl = read("businessEntryPdfTemplate.ts");
const businessBodies = read("businessEntryPdfBodies.ts");
const proTpl = read("professionalPackPdfTemplate.ts");
const diaryTpl = read("diaryEntryPdfTemplate.ts");
const ccPdf = read("customerCreditPdfService.ts");
const poPdf = read("purchaseOrderPdfService.ts");
const letterheadTest = read("letterheadPdfService.test.ts");

assert.ok(businessTpl.includes("buildPdfHtmlDocument"), "business entry uses document shell");
assert.ok(businessTpl.includes("pdfDocumentHeader"), "business entry uses document header");
assert.ok(businessTpl.includes("pdfIssuerBlock"), "business entry uses issuer block");
assert.ok(businessBodies.includes("pdfKeyFactsBlock"), "business bodies use key facts");
assert.ok(businessBodies.includes("ewayBillNumber"), "movement PDF includes e-way bill field");

assert.ok(proTpl.includes("buildPdfHtmlDocument"), "pro pack uses document shell");
assert.ok(proTpl.includes("user-created brief"), "pro pack has restrained brief note");

assert.ok(diaryTpl.includes("buildPdfHtmlDocument"), "legacy diary PDF uses document shell");

assertNoForbiddenInSource("businessEntryPdfTemplate", businessTpl);
assertNoForbiddenInSource("professionalPackPdfTemplate", proTpl);
assertNoForbiddenInSource("pdfLayout", read("pdfLayout.ts"));
assertNoForbiddenInSource("pdfFooter", read("pdfFooter.ts"));

// Customer credit already uses short footer label via i18n
assert.ok(ccPdf.includes("footer-left"), "customer credit footer is two-column");
assert.ok(!ccPdf.includes("Ananya"), "customer credit has no operator line");

// PO & Letterhead untouched
assert.ok(
  poPdf.includes('footer: t("purchaseOrder.pdf.footer")'),
  "PO footer i18n unchanged"
);
assert.equal(poPdf.includes("buildPdfHtmlDocument"), false, "PO does not use new shell");
assert.ok(letterheadTest.includes("Ananya Engineered"), "letterhead exclusion test intact");

// Shared design system files exist
for (const f of [
  "pdfTheme.ts",
  "pdfDate.ts",
  "pdfMoney.ts",
  "pdfFooter.ts",
  "pdfSections.ts",
  "pdfTable.ts",
  "pdfComponents.ts",
  "pdfDocumentShell.ts",
  "businessEntryPdfBodies.ts",
]) {
  assert.ok(fs.existsSync(path.join(pdfDir, f)), `${f} exists`);
}

console.log("pdfRedesign.test.ts: ok");
