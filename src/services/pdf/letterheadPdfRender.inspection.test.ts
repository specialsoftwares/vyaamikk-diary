/**
 * Representative letterhead HTML fixtures for visual inspection.
 *
 * Cannot import letterheadPdfService under node --test (pulls expo-file-system → RN).
 * Fixtures mirror the PDF service CSS/header rules; service source is asserted in lockstep.
 * Android Print / device raster remains a later gate.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const serviceSrc = fs.readFileSync(
  path.join(import.meta.dirname, "letterheadPdfService.ts"),
  "utf8"
);

const outDir = path.join(
  import.meta.dirname,
  "../../../docs/release/packets/letterhead/pdf-fixtures"
);
fs.mkdirSync(outDir, { recursive: true });

const tinyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

assert.match(serviceSrc, /object-fit:\s*contain/);
assert.match(serviceSrc, /object-position:\s*top center/);
assert.match(serviceSrc, /generated-logo\.mono \{ filter: grayscale\(1\) contrast\(3\); \}/);
assert.match(serviceSrc, /align-right.*row-reverse/s);
assert.match(serviceSrc, /startsWith\("data:"\)/);

function pageShell(innerBg: string, content: string, margins = "2.25in 1in 1.25in 1in"): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><style>
@page { size: A4; margin: ${margins}; }
* { box-sizing: border-box; }
html, body { margin:0; padding:0; background:#fff; font-family: "Noto Sans", "Noto Sans Devanagari", sans-serif; color:#0F1226; font-size:11.5pt; line-height:1.3; }
.letterhead-bg { position:fixed; top:0; left:0; width:210mm; height:297mm; z-index:0; object-fit:contain; object-position:top center; }
.generated-header { position:fixed; top:0; left:0; width:210mm; padding:12mm 14mm 6mm; z-index:0; display:flex; gap:10pt; }
.generated-header.align-center { justify-content:center; text-align:center; flex-direction:column; align-items:center; }
.generated-header.align-right { justify-content:flex-end; text-align:right; flex-direction:row-reverse; }
.generated-header.align-left { justify-content:flex-start; text-align:left; }
.generated-logo { max-width:72pt; max-height:48pt; object-fit:contain; }
.generated-logo.mono { filter: grayscale(1) contrast(3); }
.generated-logo.grayscale { filter: grayscale(1); }
.generated-name { font-size:13pt; font-weight:700; }
.content { position:relative; z-index:1; }
</style></head><body>${innerBg}<div class="content">${content}</div></body></html>`;
}

const longBody = Array.from({ length: 40 }, (_, i) =>
  `<p>Paragraph ${i + 1}. यह एक लंबा पत्र है with English and देवनागरी.</p>`
).join("");

const cases: { name: string; html: string }[] = [
  {
    name: "imported-contain-top",
    html: pageShell(
      `<img class="letterhead-bg" src="${tinyPng}" alt=""/>`,
      `<p>Imported non-A4 (wide) contain + top-centre.</p>`
    ),
  },
  ...(["left", "center", "right"] as const).map((align) => ({
    name: `generated-${align}`,
    html: pageShell(
      `<div class="generated-header align-${align}"><img class="generated-logo" src="${tinyPng}" alt=""/><div><div class="generated-name">विशेष सॉफ्टवेयर्स · Special Softwares</div><div>Very long address line, Tamil Nadu 600001</div><div>+91 90000 00000 · office@example.com</div><div>GSTIN: 33AAAAA0000A1Z5</div></div></div>`,
      `<p>Generated ${align} layout.</p>`
    ),
  })),
  {
    name: "generated-mono",
    html: pageShell(
      `<div class="generated-header align-left"><img class="generated-logo mono" src="${tinyPng}" alt=""/><div class="generated-name">Mono Co</div></div>`,
      `<p>Monochrome logo via CSS contrast(3).</p>`
    ),
  },
  {
    name: "multi-page-body",
    html: pageShell(
      `<div class="generated-header align-center"><div class="generated-name">Multi Page Traders</div></div>`,
      longBody
    ),
  },
];

for (const c of cases) {
  fs.writeFileSync(path.join(outDir, `${c.name}.html`), c.html, "utf8");
}

fs.writeFileSync(
  path.join(outDir, "MANIFEST.json"),
  JSON.stringify(
    {
      outDir,
      cases: cases.map((c) => c.name),
      note: "HTML fixtures locked to letterheadPdfService.css rules. Open in a browser for visual A4 check. Device Print remains separate.",
    },
    null,
    2
  )
);

console.log(
  "letterheadPdfRender.inspection.test.ts: ok",
  cases.length,
  "fixtures →",
  outDir
);
