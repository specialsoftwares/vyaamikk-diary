/**
 * HOST_CHROMIUM page proof for the cash voucher.
 * Android expo-print is not this test. It stays DEVICE_PENDING.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import net from "node:net";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import { deflateSync } from "node:zlib";
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

function openCdp(wsUrl: string): Promise<{
  send: (method: string, params?: object) => Promise<{ result?: { value?: unknown }; data?: string }>;
  close: () => void;
}> {
  const url = new URL(wsUrl);
  const key = crypto.randomBytes(16).toString("base64");
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: url.hostname, port: Number(url.port) });
    let buffered = Buffer.alloc(0);
    const pending = new Map<number, (value: { result?: { value?: unknown }; data?: string }) => void>();
    let nextId = 0;
    let opened = false;
    const send = (method: string, params?: object) => {
      const id = ++nextId;
      const payload = Buffer.from(JSON.stringify({ id, method, params }));
      const mask = crypto.randomBytes(4);
      const masked = Buffer.alloc(payload.length);
      for (let i = 0; i < payload.length; i += 1) masked[i] = payload[i]! ^ mask[i % 4]!;
      let header: Buffer;
      if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
      else {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 0x80 | 126;
        header.writeUInt16BE(payload.length, 2);
      }
      socket.write(Buffer.concat([header, mask, masked]));
      return new Promise<{ result?: { value?: unknown }; data?: string }>((done) => pending.set(id, done));
    };
    const takeFrame = () => {
      if (buffered.length < 2) return;
      let length = buffered[1]! & 127;
      let start = 2;
      if (length === 126) {
        if (buffered.length < 4) return;
        length = buffered.readUInt16BE(2);
        start = 4;
      } else if (length === 127) {
        if (buffered.length < 10) return;
        length = Number(buffered.readBigUInt64BE(2));
        start = 10;
      }
      if (buffered.length < start + length) return;
      const payload = buffered.subarray(start, start + length);
      buffered = buffered.subarray(start + length);
      const message = JSON.parse(payload.toString("utf8")) as {
        id?: number;
        result?: { result?: { value?: unknown }; data?: string };
      };
      if (message.id != null) {
        const result = message.result ?? {};
        pending.get(message.id)?.({ result: result.result, data: result.data });
      }
      takeFrame();
    };
    socket.on("data", (chunk: Buffer | string) => {
      const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      if (!opened) {
        buffered = Buffer.concat([buffered, bytes]);
        const headerEnd = buffered.indexOf("\r\n\r\n");
        if (headerEnd < 0) return;
        opened = true;
        buffered = buffered.subarray(headerEnd + 4);
        resolve({ send, close: () => socket.end() });
        takeFrame();
        return;
      }
      buffered = Buffer.concat([buffered, bytes]);
      takeFrame();
    });
    socket.on("error", reject);
    socket.write(
      `GET ${url.pathname} HTTP/1.1\r\nHost: ${url.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`
    );
  });
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

async function inspectWithChrome(name: string, html: string, expect: { r: number; g: number; b: number }) {
  const bin = chromeBin();
  assert.ok(bin, `${name}: Chrome/Chromium is required when puppeteer is not installed`);
  const htmlPath = path.join(OUT, `${name}.html`);
  const pngPath = path.join(OUT, `${name}.png`);
  const pdfPath = path.join(OUT, `${name}.pdf`);
  writeFileSync(htmlPath, html);
  const port = 9400 + (name.length % 50);
  const chrome = spawnSync(bin, ["--version"], { encoding: "utf8" });
  assert.equal(chrome.status, 0, `${name} chrome did not start`);
  const { spawn } = await import("node:child_process");
  const child = spawn(bin, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    `--remote-debugging-port=${port}`,
    "about:blank",
  ], { stdio: "ignore" });
  try {
    let pageWs = "";
    for (let attempt = 0; attempt < 40 && !pageWs; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      try {
        await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`file://${htmlPath}`)}`, { method: "PUT" });
        const pages = (await fetch(`http://127.0.0.1:${port}/json/list`).then((res) => res.json())) as {
          type?: string;
          webSocketDebuggerUrl?: string;
          url?: string;
        }[];
        pageWs =
          pages.find((page) => page.type === "page" && page.url?.startsWith("file:"))?.webSocketDebuggerUrl ??
          pages.find((page) => page.type === "page")?.webSocketDebuggerUrl ??
          "";
      } catch {
        pageWs = "";
      }
    }
    assert.ok(pageWs, `${name} debugger did not open`);
    const cdp = await openCdp(pageWs);
    const send = cdp.send.bind(cdp);
    await send("Page.enable");
    await send("Page.navigate", { url: `file://${htmlPath}` });
    await new Promise((resolve) => setTimeout(resolve, 400));
    await send("Runtime.enable");
    const evaluated = await send("Runtime.evaluate", {
      awaitPromise: true,
      returnByValue: true,
      expression: `(() => {
        const img = document.querySelector("img");
        if (!img) return null;
        const ready = img.complete && img.naturalWidth > 0 ? Promise.resolve() : new Promise((resolve) => { img.onload = () => resolve(null); img.onerror = () => resolve(null); });
        return ready.then(() => {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) return null;
          ctx.drawImage(img, 0, 0);
          const mark = ctx.getImageData(2, 2, 1, 1).data;
          const field = ctx.getImageData(img.naturalWidth - 2, img.naturalHeight - 2, 1, 1).data;
          const box = img.getBoundingClientRect();
          return { mark: [mark[0], mark[1], mark[2]], field: [field[0], field[1], field[2]], natural: { w: img.naturalWidth, h: img.naturalHeight }, box: { w: box.width, h: box.height } };
        });
      })()`,
    });
    const sample = evaluated.result?.value as {
      mark: number[];
      field: number[];
      natural: { w: number; h: number };
      box: { w: number; h: number };
    } | null;
    assert.ok(sample, `${name} image did not decode`);
    assert.equal(sample.mark[2]! > 200 && sample.mark[0]! < 40, true, `${name} marker pixel`);
    const near = (actual: number, expectedColor: number) => Math.abs(actual - expectedColor) < 60;
    assert.equal(
      near(sample.field[0] ?? 0, expect.r) && near(sample.field[1] ?? 0, expect.g) && near(sample.field[2] ?? 0, expect.b),
      true,
      `${name} field pixel`
    );
    assert.ok(Math.abs(sample.box.w / sample.box.h - sample.natural.w / sample.natural.h) < 0.08, `${name} rendered image is clipped`);
    assert.ok(sample.box.h > 80, `${name} rendered image is too small`);
    const printed = await send("Page.printToPDF", {
      printBackground: true,
      paperWidth: 8.27,
      paperHeight: 11.69,
    });
    const pdfBytes = Buffer.from(printed.data ?? "", "base64");
    assert.equal(pdfBytes.subarray(0, 4).toString("ascii"), "%PDF");
    assert.ok(pdfBytes.byteLength > 2000, `${name} PDF too small`);
    writeFileSync(pdfPath, pdfBytes);
    const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    writeFileSync(pngPath, Buffer.from(shot.data ?? "", "base64"));
    cdp.close();
    return { pdfBytes: pdfBytes.byteLength, box: sample.box };
  } finally {
    child.kill();
  }
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
