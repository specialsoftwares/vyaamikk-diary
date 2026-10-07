/**
 * Production HTML composer fixtures + optional Chromium PDF raster.
 * Device Print / expo-print remains a separate gate.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import { composeLetterheadHtml } from "./letterheadPdfHtml";
import type { LetterheadConfig } from "@/services/letterhead";

const outDir = path.join(
  import.meta.dirname,
  "../../../docs/release/packets/letterhead/pdf-fixtures"
);
fs.mkdirSync(outDir, { recursive: true });

const labels = {
  subject: "Subject",
  date: "Date",
  reference: "Ref",
  to: "To",
};

/** ~64×32 PNG logo (not 1×1) — blue rectangle with alpha. */
const LOGO_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAYAAACinX6EAAAAhElEQVRoge3WMQqAMBAF0X/7H8VOsLGwsLGwsLGwsPFvYWEFC8nM7M7sLnhwIJDJy4YMAAAAAAAAAAAAAPxfVd1J+pL0IelZ0l3SVdJF0lHSTtJG0lrSUtJc0lTSWNJQ0kBSX1JPUldSR1JbUktSU1JDUl1STVJVUkVSWVJFUllSRQAAAAAAAAAAAAD8zQsO3gF+0nY1mwAAAABJRU5ErkJggg==";

/** Wide non-A4 page (~2:1) gray PNG header band. */
const WIDE_PAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAACCAYAAABvenbTAAAAFUlEQVQIW2NkYGD4z0AEYBxVlFFwAABh6AH5bYzq9gAAAABJRU5ErkJggg==";

/** Tall page (~1:2). */
const TALL_PAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAAICAYAAADRmmy5AAAAE0lEQVQIW2NkYGD4z8DAwMAIYwIADfwB/WqK2VwAAAAASUVORK5CYII=";

const longBody = Array.from({ length: 45 }, (_, i) =>
  `Paragraph ${i + 1}. विशेष सॉफ्टवेयर्स — long bilingual body for pagination.`
).join("\n\n");

function baseDoc(body?: string) {
  return {
    title: "Inspection letter",
    date: Date.UTC(2026, 9, 7),
    reference: "LH-CLOSEOUT",
    recipientName: "Acme Traders",
    recipientAddress: "12 Market Road\nChennai 600001",
    subject: "Letterhead PDF closeout",
    salutation: "Dear Sir/Madam,",
    body: body ?? "One-page body.",
    closing: "Yours faithfully,",
    name: "Owner",
    designation: "Proprietor",
    place: "Chennai",
  };
}

function writeCase(name: string, config: LetterheadConfig, body?: string) {
  const isGenerated =
    config.sourceType === "generated_layout" && Boolean(config.generatedLayout);
  const { html } = composeLetterheadHtml({
    config,
    doc: baseDoc(body),
    labels,
    locale: "en-IN",
    templateSrc: isGenerated ? null : config.imageDataUri ?? null,
  });
  const file = path.join(outDir, `${name}.html`);
  fs.writeFileSync(file, html, "utf8");
  return { html, file };
}

const importedWide = writeCase("imported-contain-top", {
  userId: "u1",
  sourceType: "imported_image",
  imageDataUri: WIDE_PAGE,
  imageWidth: 800,
  imageHeight: 400,
  margins: { topPct: 19, bottomPct: 11, leftPct: 12, rightPct: 12 },
  createdAt: 1,
  updatedAt: 1,
});
assert.match(importedWide.html, /object-fit:\s*contain/);
assert.match(importedWide.html, /object-position:\s*top center/);

writeCase("imported-tall", {
  userId: "u1",
  sourceType: "imported_image",
  imageDataUri: TALL_PAGE,
  imageWidth: 400,
  imageHeight: 800,
  margins: { topPct: 19, bottomPct: 11, leftPct: 12, rightPct: 12 },
  createdAt: 1,
  updatedAt: 1,
});

/** Ordinary near-A4 portrait (~3:4) — not a 1×1 substitute. */
const A4ISH_PAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAQCAYAAAAiYZ4HAAAAE0lEQVQ4T2NkYGD4z0ABYBxVMAoGAATIAQH0q7e0AAAAAElFTkSuQmCC";

writeCase("imported-a4ish", {
  userId: "u1",
  sourceType: "imported_image",
  imageDataUri: A4ISH_PAGE,
  imageWidth: 595,
  imageHeight: 842,
  margins: { topPct: 19, bottomPct: 11, leftPct: 12, rightPct: 12 },
  createdAt: 1,
  updatedAt: 1,
});

for (const align of ["left", "center", "right"] as const) {
  const r = writeCase(`generated-${align}`, {
    userId: "u1",
    sourceType: "generated_layout",
    generatedLayout: {
      version: 1,
      logoAlign: align,
      appearance: align === "right" ? "mono" : "color",
      businessName: "विशेष सॉफ्टवेयर्स · Special Softwares Private Limited",
      address:
        "Very long address line that wraps across the header band, Tamil Nadu 600001, India",
      contact: "+91 90000 00000 · office@example.com",
      gstin: "33AAAAA0000A1Z5",
      logoUri: LOGO_PNG,
    },
    imageDataUri: null,
    imageWidth: 0,
    imageHeight: 0,
    margins: { topPct: 22, bottomPct: 12, leftPct: 12, rightPct: 12 },
    createdAt: 1,
    updatedAt: 1,
  });
  assert.match(r.html, new RegExp(`align-${align}`));
  if (align === "right") {
    assert.match(r.html, /justify-content:\s*flex-start[\s\S]*row-reverse/);
    assert.match(r.html, /generated-logo mono/);
  }
}

const multi = writeCase(
  "multi-page-body",
  {
    userId: "u1",
    sourceType: "generated_layout",
    generatedLayout: {
      version: 1,
      logoAlign: "center",
      appearance: "grayscale",
      businessName: "Multi Page Traders",
      address: null,
      contact: null,
      gstin: null,
      logoUri: LOGO_PNG,
    },
    imageDataUri: null,
    imageWidth: 0,
    imageHeight: 0,
    margins: { topPct: 19, bottomPct: 11, leftPct: 12, rightPct: 12 },
    createdAt: 1,
    updatedAt: 1,
  },
  longBody
);
assert.match(multi.html, /Paragraph 45/);
assert.match(multi.html, /grayscale/);

/** Required fresh renders — committed PDFs under pdf/ do not count. */
const REQUIRED_PDF_NAMES = [
  "imported-contain-top",
  "imported-tall",
  "imported-a4ish",
  "generated-left",
  "generated-center",
  "generated-right",
  "multi-page-body",
] as const;

const freshPdfDir = path.join(outDir, `pdf-fresh-${Date.now()}`);
fs.mkdirSync(freshPdfDir, { recursive: true });

/** Inspect production HTML for clipping / stacking / header placement. */
function inspectHtmlGeometry(name: string, html: string): void {
  if (name.startsWith("imported-")) {
    assert.match(html, /object-fit:\s*contain/, `${name}: contain`);
    assert.match(html, /object-position:\s*top center/, `${name}: top centre`);
    assert.match(html, /class="letterhead-bg"/, `${name}: bg layer`);
    assert.match(html, /\.letterhead-bg\s*\{[^}]*position:\s*fixed/, `${name}: fixed bg`);
  }
  if (name.startsWith("generated-")) {
    assert.match(html, /class="generated-header/, `${name}: header`);
    assert.match(html, /\.generated-header\s*\{[^}]*position:\s*fixed/, `${name}: fixed header`);
  }
  assert.match(html, /\.content\s*\{[^}]*z-index:\s*1/, `${name}: body above letterhead`);
  assert.doesNotMatch(html, /object-fit:\s*cover/, `${name}: must not cover-crop`);
  assert.doesNotMatch(html, /object-fit:\s*fill/, `${name}: must not stretch-fill`);
}

for (const name of REQUIRED_PDF_NAMES) {
  const html = fs.readFileSync(path.join(outDir, `${name}.html`), "utf8");
  inspectHtmlGeometry(name, html);
}

function countPdfPages(pdfBytes: Buffer): number {
  const text = pdfBytes.toString("latin1");
  const matches = text.match(/\/Type\s*\/Page(?![sA-Za-z])/g);
  return matches ? matches.length : 0;
}

async function renderFreshPdfs(): Promise<string[]> {
  const names = [...REQUIRED_PDF_NAMES];
  const require = createRequire(import.meta.url);
  const puppeteerCandidates = [
    path.join(
      import.meta.dirname,
      "../../../services/subscription-invoice-renderer/node_modules/puppeteer"
    ),
  ];
  for (const c of puppeteerCandidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const puppeteer = require(c) as {
        launch: (opts?: object) => Promise<{
          newPage: () => Promise<{
            setContent: (h: string, o?: object) => Promise<void>;
            pdf: (o: object) => Promise<Uint8Array>;
            close?: () => Promise<void>;
          }>;
          close: () => Promise<void>;
        }>;
      };
      const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      const written: string[] = [];
      try {
        for (const name of names) {
          const html = fs.readFileSync(path.join(outDir, `${name}.html`), "utf8");
          const page = await browser.newPage();
          await page.setContent(html, { waitUntil: "load" });
          const pdfBytes = Buffer.from(
            await page.pdf({
              format: "A4",
              printBackground: true,
              preferCSSPageSize: true,
            })
          );
          const pdfPath = path.join(freshPdfDir, `${name}.pdf`);
          fs.writeFileSync(pdfPath, pdfBytes);
          assert.ok(pdfBytes.byteLength > 1000, `${name} PDF too small`);
          assert.equal(pdfBytes.subarray(0, 4).toString("ascii"), "%PDF");
          written.push(pdfPath);
          await page.close?.();
        }
      } finally {
        await browser.close();
      }
      return written;
    } catch {
      // fall through to Chrome CLI
    }
  }

  const chromeCandidates = [
    process.env.LETTERHEAD_CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/lib/chromium/chromium",
  ].filter((p): p is string => Boolean(p && p.trim()));
  const chromeBin = chromeCandidates.find((p) => fs.existsSync(p));
  if (!chromeBin) {
    return [];
  }

  const { spawnSync } = await import("node:child_process");
  const written: string[] = [];
  for (const name of names) {
    const htmlPath = path.join(outDir, `${name}.html`);
    const pdfPath = path.join(freshPdfDir, `${name}.pdf`);
    const started = Date.now();
    const r = spawnSync(
      chromeBin,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        `--print-to-pdf=${pdfPath}`,
        `file://${htmlPath}`,
      ],
      { encoding: "utf8", timeout: 60_000 }
    );
    if (r.status !== 0 || !fs.existsSync(pdfPath)) {
      console.log(`letterheadPdfRender: Chrome PDF failed for ${name}`, r.stderr?.slice(0, 200));
      continue;
    }
    const st = fs.statSync(pdfPath);
    assert.ok(st.mtimeMs >= started - 1000, `${name}: PDF must be freshly written`);
    const pdfBytes = fs.readFileSync(pdfPath);
    assert.ok(pdfBytes.byteLength > 1000, `${name} PDF too small`);
    assert.equal(pdfBytes.subarray(0, 4).toString("ascii"), "%PDF");
    written.push(pdfPath);
  }
  return written;
}

async function main(): Promise<void> {
  const pdfs = await renderFreshPdfs();
  const basenames = new Set(pdfs.map((p) => path.basename(p, ".pdf")));

  // Required-render check: old committed PDFs must not satisfy this.
  const missing = REQUIRED_PDF_NAMES.filter((n) => !basenames.has(n));
  assert.equal(
    missing.length,
    0,
    `Required PDFs were not freshly rendered (missing: ${missing.join(", ")}). ` +
      "Committed pdf/ fixtures do not count. Provide Chrome/puppeteer on the host."
  );

  const multiBytes = fs.readFileSync(path.join(freshPdfDir, "multi-page-body.pdf"));
  assert.ok(
    countPdfPages(multiBytes) >= 2,
    "multi-page-body must span ≥2 PDF pages (body must not collapse into header)"
  );

  const tallBytes = fs.readFileSync(path.join(freshPdfDir, "imported-tall.pdf"));
  assert.ok(tallBytes.byteLength > 1000, "imported-tall PDF present");
  assert.equal(countPdfPages(tallBytes), 1, "imported-tall single page");

  // Publish a stable copy for docs without treating it as the freshness gate.
  const stablePdfDir = path.join(outDir, "pdf");
  fs.mkdirSync(stablePdfDir, { recursive: true });
  for (const name of REQUIRED_PDF_NAMES) {
    fs.copyFileSync(
      path.join(freshPdfDir, `${name}.pdf`),
      path.join(stablePdfDir, `${name}.pdf`)
    );
  }

  fs.writeFileSync(
    path.join(outDir, "MANIFEST.json"),
    JSON.stringify(
      {
        outDir,
        freshPdfDir,
        html: fs.readdirSync(outDir).filter((f) => f.endsWith(".html")),
        pdfsFresh: [...basenames],
        note:
          "Fresh HTML from composeLetterheadHtml + Chromium/Chrome PDF. " +
          "Freshness gated on pdf-fresh-* (not committed pdf/). Device Print still pending.",
      },
      null,
      2
    )
  );

  console.log(
    "letterheadPdfRender.inspection.test.ts: ok",
    "html=",
    fs.readdirSync(outDir).filter((f) => f.endsWith(".html")).length,
    "pdfFresh=",
    pdfs.length
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
