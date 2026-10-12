/**
 * Headless Chromium HTML→PDF. No Firestore, GST, or credential access.
 *
 * Containment layers (all required; none alone is a sandbox claim):
 * 1. JavaScript is disabled on the page. The approved tax-document profile
 *    is static HTML/CSS, and active content is the only way to reach
 *    channels that request interception cannot see (WebSocket handshakes,
 *    window.open targets, beacons, workers).
 * 2. Request interception permits only `data:` URLs and `about:blank`.
 * 3. Any additional browser target opened during a render is closed
 *    immediately; only the single render page may exist.
 * Infrastructure egress restriction remains a deployment control.
 */
import type { Browser, Target } from "puppeteer";

import { MAX_PDF_BYTES, RENDER_TIMEOUT_MS, RendererProtocolError, type RenderRequest } from "./protocol";

export interface BrowserFactory {
  launch(): Promise<Browser>;
}

export function isPermittedRenderUrl(url: string): boolean {
  return url.startsWith("data:") || url === "about:blank";
}

export async function renderHtmlToPdf(
  request: RenderRequest,
  factory: BrowserFactory
): Promise<Buffer> {
  let browser: Browser | null = null;
  try {
    browser = await factory.launch();
    const page = await browser.newPage();
    // Close anything that is not the render page (popups, new windows, workers' targets).
    const closeStrayTarget = (target: Target) => {
      void (async () => {
        try {
          const stray = await target.page();
          if (stray && stray !== page) await stray.close();
        } catch {
          // Target may already be gone; nothing else to do.
        }
      })();
    };
    browser.on("targetcreated", closeStrayTarget);
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (isPermittedRenderUrl(req.url())) {
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
    browser.off("targetcreated", closeStrayTarget);
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
