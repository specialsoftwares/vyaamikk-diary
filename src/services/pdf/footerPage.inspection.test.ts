/**
 * HOST_CHROMIUM. Renders the production business-record HTML and prints one page.
 * Android Print is not this test.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";

const NATIVE_STUB_RE = /^(react-native|expo|@react-native|@expo)(\/|$|-)/;
const nativeStub = new Proxy(
  {},
  {
    get: (_target, key) => {
      if (key === "__esModule") return true;
      if (key === "Platform") return { OS: "android" };
      return () => undefined;
    },
  }
);
type Loader = (request: string, ...rest: unknown[]) => unknown;
const moduleLoader = Module as unknown as { _load: Loader };
const originalLoad = moduleLoader._load;
moduleLoader._load = function patchedLoad(this: unknown, request: string, ...rest: unknown[]) {
  if (NATIVE_STUB_RE.test(request)) return nativeStub;
  return originalLoad.call(this, request, ...rest);
};

const OUT = "/tmp/vyd-footer-page-proof";

function chromeBin(): string | null {
  const listed = [
    process.env.CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter((item): item is string => Boolean(item));
  return listed.find((item) => existsSync(item)) ?? null;
}

async function main(): Promise<void> {
  const { buildBusinessEntryPdfHtml, businessEntryPdfLabels } = await import(
    "@/services/pdf/businessEntryPdfTemplate"
  );
  const { defaultPdfLegalFooterLabels } = await import("@/services/pdf/pdfLegalFooter");
  const { PDF_ATTRIBUTION } = await import("@/services/pdf/pdfTheme");
  mkdirSync(OUT, { recursive: true });
  const html = buildBusinessEntryPdfHtml({
    entry: {
      id: "fixture-work",
      entryType: "work_update_issue",
      entryDate: new Date(2026, 9, 17, 12).getTime(),
      title: "Fixture work note",
      notes: "Host page inspection",
      payload: {},
      deletedAt: null,
      source: "composer",
      createdAt: new Date(2026, 9, 17, 12).getTime(),
      updatedAt: new Date(2026, 9, 17, 12).getTime(),
      documentHistory: {
        firstGeneratedAt: null,
        lastGeneratedAt: null,
        lastEditedAt: null,
        versionNumber: 1,
        editHistory: [],
        pdfGenerationHistory: [],
      },
    } as never,
    user: { uid: "owner-proof" } as never,
    labels: businessEntryPdfLabels((key) => key),
    branding: {
      displayName: "Fixture Desk",
      businessName: "Fixture",
      ueid: "VYD-2026-TEST01",
      mobile: null,
      email: null,
      includeLogo: false,
      logoDataUri: null,
      legal: defaultPdfLegalFooterLabels(),
    },
  });
  assert.match(html, new RegExp(PDF_ATTRIBUTION.replace(".", "\\.")));
  assert.equal(/certified/i.test(html), false);
  const htmlPath = path.join(OUT, "work-note.html");
  const pdfPath = path.join(OUT, "work-note.pdf");
  const shotPath = path.join(OUT, "work-note.png");
  writeFileSync(htmlPath, html);
  const bin = chromeBin();
  assert.ok(bin, "Chrome is required to inspect the rendered page");
  const printed = spawnSync(
    bin,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-pdf-header-footer",
      `--print-to-pdf=${pdfPath}`,
      htmlPath,
    ],
    { encoding: "utf8" }
  );
  assert.equal(printed.status, 0, printed.stderr || printed.stdout);
  const pdf = readFileSync(pdfPath);
  assert.equal(pdf.subarray(0, 4).toString("ascii"), "%PDF");
  assert.ok(pdf.byteLength > 2000);
  const dumped = spawnSync(
    bin,
    ["--headless=new", "--disable-gpu", "--no-sandbox", "--dump-dom", htmlPath],
    { encoding: "utf8" }
  );
  assert.equal(dumped.status, 0, dumped.stderr);
  assert.equal(dumped.stdout.includes("Created using Vyaamikk Diary."), true);
  assert.equal(/certified/i.test(dumped.stdout), false);
  const shot = spawnSync(
    bin,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--hide-scrollbars",
      "--window-size=794,1123",
      `--screenshot=${shotPath}`,
      htmlPath,
    ],
    { encoding: "utf8" }
  );
  assert.equal(shot.status, 0, shot.stderr || shot.stdout);
  assert.ok(existsSync(shotPath));
  console.log("footerPage.inspection.test.ts: ok");
}

void main();
