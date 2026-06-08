import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const servicePath = path.join(import.meta.dirname, "letterheadPdfService.ts");
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
    assert.equal(
      source.includes(token),
      false,
      `${label} must not include ${token}`
    );
  }
}

assertNoPlatformFooterInSource("letterheadPdfService.ts", fs.readFileSync(servicePath, "utf8"));
assertNoPlatformFooterInSource("letterhead/create.tsx", fs.readFileSync(createPath, "utf8"));
assertNoPlatformFooterInSource("letterhead/history.tsx", fs.readFileSync(historyPath, "utf8"));

const serviceSource = fs.readFileSync(servicePath, "utf8");

assert(
  serviceSource.includes("letterhead-bg"),
  "letterhead template image layer must remain"
);

// Multi-page guarantees: the template repeats on every page via a fixed-position
// background layer, and the writable area is enforced by @page margins so body
// text that overflows continues inside the safe area on subsequent pages.
assert(
  /position:\s*fixed/.test(serviceSource),
  "letterhead background must be position:fixed so it repeats on every page"
);
assert(
  /@page\s*\{[\s\S]*margin:/.test(serviceSource),
  "letterhead must drive the writable area via @page margins for multi-page safety"
);

console.log("letterheadPdfService.test.ts: ok");
