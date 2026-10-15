/**
 * HOST_CHROMIUM page proof for the cash voucher.
 * Android expo-print is not this test. It stays DEVICE_PENDING.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import { deflateSync, inflateSync } from "node:zlib";
import path from "node:path";

import type { BusinessEntry } from "@/domain/businessEntry";
import type { PreparedReceiptPhoto } from "@/services/attachments/preparedReceiptPhoto";
import type { UserPdfBranding } from "@/services/pdf/userPdfBranding";

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

const OUT = "/tmp/vyd-cash-voucher-proof";

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, checksum]);
}

function solidPng(width: number, height: number, paint: (x: number, y: number) => [number, number, number]): string {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      const i = row + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

function photo(dataUri: string, hash: string): PreparedReceiptPhoto {
  return { status: "ready", dataUri, mime: "image/png", contentHash: hash, width: 280, height: 180 };
}

function entry(hash: string): BusinessEntry {
  return {
    id: "voucher-proof",
    userId: "owner-proof",
    ueid: "VYD-2026-TEST01",
    entryType: "business_cash_given",
    title: "Cash paid",
    entryDate: Date.UTC(2026, 9, 1),
    notes: null,
    reminder: null,
    location: null,
    attachments: [
      {
        id: "cash_paid_receipt",
        uri: `file:///cash-paid-photos/owner-proof/${hash}.png`,
        mimeType: "image/png",
        name: "receipt.png",
        contentHash: hash,
        revision: hash,
        byteSize: 128,
      },
    ],
    payload: {
      amount: 2000,
      givenToName: "Proof Receiver",
      purpose: "Receipt photo proof",
      paymentDate: Date.UTC(2026, 9, 1),
      paymentMode: "Cash",
      settlementStatus: "pending",
      contactMobile: null,
      businessRef: null,
      siteRef: null,
      expectedSettlementDate: null,
      remarks: null,
    },
    source: "composer",
    status: "active",
    createdAt: Date.UTC(2026, 9, 1),
    updatedAt: Date.UTC(2026, 9, 1),
    deletedAt: null,
    pdfUri: null,
    documentHistory: {
      firstGeneratedAt: null,
      lastGeneratedAt: null,
      lastEditedAt: null,
      versionNumber: 1,
      editHistory: [],
      pdfGenerationHistory: [],
    },
  };
}

function brandingFor(legal: UserPdfBranding["legal"]): UserPdfBranding {
  return {
    displayName: "Fixture Desk",
    businessName: "Fixture",
    ueid: "VYD-2026-TEST01",
    mobile: null,
    email: null,
    includeLogo: false,
    logoDataUri: null,
    legal,
  };
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(buf: Buffer): { w: number; h: number; rgba: Buffer } {
  let offset = 8;
  let width = 0;
  let height = 0;
  let color = 0;
  const idats: Buffer[] = [];
  while (offset + 8 <= buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      color = data[9] ?? 0;
    } else if (type === "IDAT") idats.push(Buffer.from(data));
    else if (type === "IEND") break;
    offset += 12 + len;
  }
  const channels = color === 6 ? 4 : 3;
  const inflated = inflateSync(Buffer.concat(idats));
  const stride = width * channels;
  const rows: Buffer[] = [];
  let src = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[src] ?? 0;
    src += 1;
    const row = Buffer.alloc(stride);
    const raw = inflated.subarray(src, src + stride);
    src += stride;
    const prev = rows[y - 1];
    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? row[i - channels] ?? 0 : 0;
      const up = prev?.[i] ?? 0;
      const ul = i >= channels ? prev?.[i - channels] ?? 0 : 0;
      const value = raw[i] ?? 0;
      if (filter === 1) row[i] = (value + left) & 255;
      else if (filter === 2) row[i] = (value + up) & 255;
      else if (filter === 3) row[i] = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[i] = (value + paeth(left, up, ul)) & 255;
      else row[i] = value;
    }
    rows.push(row);
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const row = rows[y]!;
    for (let x = 0; x < width; x += 1) {
      const s = x * channels;
      const d = (y * width + x) * 4;
      rgba[d] = row[s] ?? 0;
      rgba[d + 1] = row[s + 1] ?? 0;
      rgba[d + 2] = row[s + 2] ?? 0;
      rgba[d + 3] = channels === 4 ? row[s + 3] ?? 255 : 255;
    }
  }
  return { w: width, h: height, rgba };
}

function chromeBin(): string | null {
  const listed = [
    process.env.CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((item): item is string => Boolean(item));
  const found = listed.find((item) => existsSync(item));
  if (found) return found;
  const which = spawnSync("bash", ["-lc", "command -v chromium || command -v chromium-browser || command -v google-chrome || true"], {
    encoding: "utf8",
  });
  const bin = which.stdout.trim();
  return bin || null;
}

function inspectWithChrome(name: string, html: string, expect: { r: number; g: number; b: number }) {
  const bin = chromeBin();
  assert.ok(bin, `${name}: Chrome/Chromium is required when puppeteer is not installed`);
  const htmlPath = path.join(OUT, `${name}.html`);
  const pngPath = path.join(OUT, `${name}.png`);
  const pdfPath = path.join(OUT, `${name}.pdf`);
  writeFileSync(htmlPath, html);
  const shot = spawnSync(bin, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--window-size=1280,2200",
    `--screenshot=${pngPath}`,
    `file://${htmlPath}`,
  ], { encoding: "utf8", timeout: 60_000 });
  assert.equal(shot.status, 0, `${name} screenshot failed`);
  const image = decodePng(readFileSync(pngPath));
  let minX = image.w;
  let minY = image.h;
  let maxX = 0;
  let maxY = 0;
  let blue = 0;
  const near = (actual: number, expected: number) => Math.abs(actual - expected) < 70;
  for (let y = 0; y < image.h; y += 1) {
    for (let x = 0; x < image.w; x += 1) {
      const i = (y * image.w + x) * 4;
      const r = image.rgba[i] ?? 0;
      const g = image.rgba[i + 1] ?? 0;
      const b = image.rgba[i + 2] ?? 0;
      if (near(r, expect.r) && near(g, expect.g) && near(b, expect.b)) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      if (b > 180 && r < 80 && g < 80) blue += 1;
    }
  }
  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  assert.ok(boxH > 80, `${name} rendered image is too small`);
  assert.ok(Math.abs(boxW / boxH - 280 / 180) < 0.2, `${name} rendered image is clipped`);
  assert.ok(blue > 10, `${name} corner marker is missing`);
  const printed = spawnSync(bin, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-pdf-header-footer",
    `--print-to-pdf=${pdfPath}`,
    `file://${htmlPath}`,
  ], { encoding: "utf8", timeout: 60_000 });
  assert.equal(printed.status, 0, `${name} PDF failed`);
  const pdfBytes = readFileSync(pdfPath);
  assert.equal(pdfBytes.subarray(0, 4).toString("ascii"), "%PDF");
  assert.ok(pdfBytes.byteLength > 2000, `${name} PDF too small`);
  return { pdfBytes: pdfBytes.byteLength, box: { w: boxW, h: boxH } };
}

async function inspect(name: string, html: string, expect: { r: number; g: number; b: number }) {
  if (process.env.VYD_PDF_CHROME === "1") return inspectWithChrome(name, html, expect);
  const require = createRequire(import.meta.url);
  let puppeteer: {
    launch: (opts?: object) => Promise<{
      newPage: () => Promise<{
        setContent: (html: string, opts?: object) => Promise<void>;
        pdf: (opts?: object) => Promise<Uint8Array>;
        screenshot: (opts?: object) => Promise<Uint8Array>;
        evaluate: <T>(fn: () => T) => Promise<T>;
        close: () => Promise<void>;
      }>;
      close: () => Promise<void>;
    }>;
  };
  try {
    puppeteer = require(path.join(
      import.meta.dirname,
      "../../../services/subscription-invoice-renderer/node_modules/puppeteer"
    ));
  } catch {
    return inspectWithChrome(name, html, expect);
  }
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const sample = await page.evaluate(() => {
      const img = document.querySelector("img");
      if (!img) return null;
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx || img.naturalWidth < 2 || img.naturalHeight < 2) return null;
      ctx.drawImage(img, 0, 0);
      const mark = ctx.getImageData(2, 2, 1, 1).data;
      const field = ctx.getImageData(img.naturalWidth - 2, img.naturalHeight - 2, 1, 1).data;
      const box = img.getBoundingClientRect();
      return {
        mark: [mark[0], mark[1], mark[2]],
        field: [field[0], field[1], field[2]],
        natural: { w: img.naturalWidth, h: img.naturalHeight },
        box: { w: box.width, h: box.height },
      };
    });
    assert.ok(sample, `${name} image did not decode`);
    assert.equal(sample.mark[2] > 200 && sample.mark[0] < 40, true, `${name} marker pixel`);
    const near = (actual: number, expected: number) => Math.abs(actual - expected) < 60;
    assert.equal(
      near(sample.field[0] ?? 0, expect.r) &&
        near(sample.field[1] ?? 0, expect.g) &&
        near(sample.field[2] ?? 0, expect.b),
      true,
      `${name} field pixel`
    );
    const ratio = sample.natural.w / sample.natural.h;
    const shown = sample.box.w / sample.box.h;
    assert.ok(Math.abs(shown - ratio) < 0.08, `${name} image aspect changed`);
    assert.ok(sample.box.h > 24, `${name} image collapsed`);
    const pdfBytes = Buffer.from(await page.pdf({ format: "A4", printBackground: true }));
    const shot = Buffer.from(await page.screenshot({ fullPage: true }));
    assert.equal(pdfBytes.subarray(0, 4).toString("ascii"), "%PDF");
    assert.ok(pdfBytes.includes(Buffer.from("/Image")), `${name} PDF has no image`);
    assert.ok(pdfBytes.byteLength > 2000, `${name} PDF too small`);
    writeFileSync(path.join(OUT, `${name}.pdf`), pdfBytes);
    writeFileSync(path.join(OUT, `${name}.png`), shot);
    await page.close();
    return { pdfBytes: pdfBytes.byteLength, box: sample.box };
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const { ReceiptPhotoUnavailableError } = await import("@/services/attachments/cashVoucherPhotoPlan");
  const { buildBusinessEntryPdfHtml, businessEntryPdfLabels } = await import(
    "@/services/pdf/businessEntryPdfTemplate"
  );
  const { generateCashPaidVoucherPdf } = await import("@/services/pdf/cashPaidPdfService");
  const { defaultPdfLegalFooterLabels } = await import("@/services/pdf/pdfLegalFooter");
  const { p50, p95 } = await import("@/services/diary/saveStageTiming");
  mkdirSync(OUT, { recursive: true });
  const red = solidPng(280, 180, (x, y) => (x < 28 && y < 28 ? [0, 0, 255] : [220, 30, 30]));
  const green = solidPng(280, 180, (x, y) => (x < 28 && y < 28 ? [0, 0, 255] : [30, 180, 40]));
  const labels = businessEntryPdfLabels((key) => key);
  const branding = brandingFor(defaultPdfLegalFooterLabels());
  const firstEntry = entry("rev-red");
  const generic = buildBusinessEntryPdfHtml({
    entry: firstEntry,
    user: { uid: "owner-proof" } as never,
    labels,
    branding,
    receiptPhoto: photo(red, "rev-red"),
  });
  assert.match(generic, /rev-red|data:image\/png/);
  const dedicated = await generateCashPaidVoucherPdf({
    entry: firstEntry,
    user: { uid: "owner-proof", businessName: "Fixture" } as never,
    mode: "fieldVoucher",
    t: (key) => key,
    preparedPhoto: photo(red, "rev-red"),
  });
  assert.equal(dedicated.status, "ready");
  if (dedicated.status !== "ready") return;
  assert.equal(dedicated.photoOmitted, false);
  assert.equal(dedicated.documentRevision.attachmentRevision.includes("rev-red") || dedicated.html.includes(red.slice(0, 40)), true);

  const replaced = await generateCashPaidVoucherPdf({
    entry: entry("rev-green"),
    user: { uid: "owner-proof", businessName: "Fixture" } as never,
    mode: "fieldVoucher",
    t: (key) => key,
    preparedPhoto: photo(green, "rev-green"),
  });
  assert.equal(replaced.status, "ready");
  if (replaced.status !== "ready") return;
  assert.equal(replaced.html.includes(red), false);
  assert.equal(replaced.html.includes(green), true);

  const missing = await generateCashPaidVoucherPdf({
    entry: firstEntry,
    user: { uid: "owner-proof" } as never,
    mode: "fieldVoucher",
    t: (key) => key,
    preparedPhoto: { status: "unavailable", reason: "missing_local" },
  });
  assert.equal(missing.status, "unavailable");
  if (missing.status === "unavailable") {
    assert.equal("html" in missing, false);
    assert.deepEqual(missing.recovery, ["retry", "generate_without_photo"]);
  }
  assert.throws(
    () =>
      buildBusinessEntryPdfHtml({
        entry: firstEntry,
        user: { uid: "owner-proof" } as never,
        labels,
        branding,
        receiptPhoto: { status: "unavailable", reason: "missing_local" },
      }),
    ReceiptPhotoUnavailableError
  );

  const renderMs: number[] = [];
  const timed = async (name: string, html: string, expect: { r: number; g: number; b: number }) => {
    const started = performance.now();
    const page = await inspect(name, html, expect);
    renderMs.push(performance.now() - started);
    return page;
  };
  const genericPage = await timed("generic-cash-record", generic, { r: 220, g: 30, b: 30 });
  const dedicatedPage = await timed("dedicated-voucher", dedicated.html, { r: 220, g: 30, b: 30 });
  const replacementPage = await timed("replacement-voucher", replaced.html, { r: 30, g: 180, b: 40 });
  console.log(JSON.stringify({
    label: "HOST_CHROMIUM",
    androidExpoPrint: "DEVICE_PENDING",
    sampleCount: renderMs.length,
    pdfRenderMs: { p50: p50(renderMs), p95: p95(renderMs) },
    genericPage,
    dedicatedPage,
    replacementPage,
    out: OUT,
  }));
  console.log("cashVoucherPdf.inspection.test.ts ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
