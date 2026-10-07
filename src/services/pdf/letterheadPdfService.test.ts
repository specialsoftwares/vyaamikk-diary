import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const servicePath = path.join(import.meta.dirname, "letterheadPdfService.ts");
const htmlPath = path.join(import.meta.dirname, "letterheadPdfHtml.ts");
const createPath = path.join(import.meta.dirname, "../../../app/(app)/letterhead/create.tsx");
const historyPath = path.join(import.meta.dirname, "../../../app/(app)/letterhead/history.tsx");

function assertNoPlatformFooterInSource(label: string, source: string): void {
  const forbidden = [
    "pdfFooterHtml(",
    "pdfLayoutCss(",
    "buildPdfFooterLine",
    "Generated using Vyaamikk Diary",
    "SPECIAL SOFTWARES",
    "Ananya Engineered",
  ];
  for (const token of forbidden) {
    assert.equal(source.includes(token), false, `${label} must not include ${token}`);
  }
}

assertNoPlatformFooterInSource("letterheadPdfService.ts", fs.readFileSync(servicePath, "utf8"));
assertNoPlatformFooterInSource("letterheadPdfHtml.ts", fs.readFileSync(htmlPath, "utf8"));
assertNoPlatformFooterInSource("letterhead/create.tsx", fs.readFileSync(createPath, "utf8"));
assertNoPlatformFooterInSource("letterhead/history.tsx", fs.readFileSync(historyPath, "utf8"));

const htmlSource = fs.readFileSync(htmlPath, "utf8");
assert(htmlSource.includes("letterhead-bg"), "letterhead template image layer must remain");
assert(/object-fit:\s*contain/.test(htmlSource), "imported letterhead PDF must use object-fit:contain");
assert(/object-position:\s*top center/.test(htmlSource), "imported page must be top-centred");
assert(htmlSource.includes("generated-header"), "generated layout must render an HTML header");
assert(
  /align-right \{ justify-content: flex-start;[\s\S]*row-reverse/.test(htmlSource),
  "right alignment must use row-reverse + flex-start"
);
assert(/generated-logo\.mono \{ filter: grayscale\(1\) contrast\(3\); \}/.test(htmlSource));
assert(/position:\s*fixed/.test(htmlSource), "letterhead background must be position:fixed");
assert(/@page\s*\{[\s\S]*margin:/.test(htmlSource), "letterhead must drive writable area via @page");

const serviceSource = fs.readFileSync(servicePath, "utf8");
assert(serviceSource.includes("composeLetterheadHtml"), "service must call pure composer");
assert(serviceSource.includes("resolveLetterheadImageSource"), "service resolves Storage images");

console.log("letterheadPdfService.test.ts: ok");
