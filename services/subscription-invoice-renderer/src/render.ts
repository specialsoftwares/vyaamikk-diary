/**
 * Headless Chromium HTML→PDF. No Firestore, GST, or credential access.
 */
import type { Browser } from "puppeteer";

import { MAX_PDF_BYTES, RENDER_TIMEOUT_MS, RendererProtocolError, type RenderRequest } from "./protocol";

export interface BrowserFactory {
  launch(): Promise<Browser>;
}

export async function renderHtmlToPdf(
  request: RenderRequest,
  factory: BrowserFactory
): Promise<Buffer> {
  let browser: Browser | null = null;
  try {
    browser = await factory.launch();
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (req.url().startsWith("data:") || req.url() === "about:blank") {
        void req.continue();
        return;
      }
      void req.abort();
    });
    await page.setContent(request.html, {
      waitUntil: "domcontentloaded",
      timeout: RENDER_TIMEOUT_MS,
    });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
      timeout: RENDER_TIMEOUT_MS,
    });
    await page.close();
    const buf = Buffer.from(pdf);
    if (buf.length === 0 || buf.length > MAX_PDF_BYTES) {
      throw new RendererProtocolError(500, "pdf_size_rejected", "pdf size rejected");
    }
    return buf;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
