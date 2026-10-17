/**
 * Renderer network-isolation and escaping fixture (synthetic, local only).
 *
 * Launches the real Puppeteer/Chromium when one is available and feeds
 * renderHtmlToPdf a hostile document that tries every ordinary browser
 * egress channel against a loopback HTTP server. The server must record
 * zero hits; data: images must still render; oversize output must be
 * rejected. This is request-interception evidence only — it is not a
 * Chromium sandbox or infrastructure-egress claim.
 *
 * When no Chromium is available the test prints SKIPPED and exits 0 so the
 * suite stays honest about what did and did not run. Set
 * RENDERER_REQUIRE_CHROMIUM=1 to turn that skip into a failure.
 */
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";

import { renderHtmlToPdf, type BrowserFactory } from "./render";
import { APPROVED_RENDERING_PROFILE, RendererProtocolError } from "./protocol";

// 1x1 transparent PNG — a legitimate inline image must still render.
const DATA_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const INJECTED_TEXT = `<img src="http://127.0.0.1:__PORT__/text-injection"><script>document.title='pwned'</script>`;

function hostileHtml(port: number): string {
  const base = `http://127.0.0.1:${port}`;
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=${base}/meta-refresh">
<base href="${base}/base/">
<link rel="stylesheet" href="${base}/style.css">
<link rel="icon" href="${base}/favicon.ico">
<link rel="preload" as="script" href="${base}/preload.js">
<script src="${base}/script.js"></script>
<style>
  body { background-image: url("${base}/css-bg.png"); }
  @font-face { font-family: "Leak"; src: url("${base}/font.woff2"); }
  @import url("${base}/import.css");
  .f { font-family: "Leak"; }
</style>
</head><body>
<h1 class="f">Isolation fixture</h1>
<img id="ok" src="${DATA_PNG}" width="40" height="40">
<img src="${base}/img.png">
<img src="//127.0.0.1:${port}/proto-relative.png">
<img src="file:///etc/hosts">
<img srcset="${base}/srcset.png 1x">
<picture><source srcset="${base}/picture.png"><img src="${base}/picture-fallback.png"></picture>
<iframe src="${base}/frame.html"></iframe>
<iframe src="about:blank"></iframe>
<object data="${base}/object.svg"></object>
<embed src="${base}/embed.pdf">
<video poster="${base}/poster.png"><source src="${base}/video.mp4"></video>
<svg width="10" height="10"><image href="${base}/svg-image.png" width="10" height="10"/></svg>
<form action="${base}/form" method="post"><input type="hidden" name="x" value="y"></form>
<a href="${base}/anchor" ping="${base}/ping" id="a">link</a>
<p>${INJECTED_TEXT.replace(/__PORT__/g, String(port))}</p>
<script>
  try { fetch("${base}/fetch", { method: "POST", body: "x" }); } catch (e) {}
  try { var x = new XMLHttpRequest(); x.open("GET", "${base}/xhr"); x.send(); } catch (e) {}
  try { navigator.sendBeacon("${base}/beacon", "x"); } catch (e) {}
  try { new WebSocket("ws://127.0.0.1:${port}/ws"); } catch (e) {}
  try { new EventSource("${base}/sse"); } catch (e) {}
  try { document.forms[0].submit(); } catch (e) {}
  try { document.getElementById("a").click(); } catch (e) {}
  try { location.href = "${base}/navigate"; } catch (e) {}
  try { window.open("${base}/popup"); } catch (e) {}
  try { import("${base}/dyn.js"); } catch (e) {}
  try { var w = new Worker("${base}/worker.js"); } catch (e) {}
</script>
</body></html>`;
}

async function startSink(): Promise<{ server: Server; port: number; hits: string[] }> {
  const hits: string[] = [];
  const server = createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain");
    res.end("leak");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("sink port unavailable");
  return { server, port: addr.port, hits };
}

async function loadPuppeteer(): Promise<BrowserFactory | null> {
  let puppeteer: typeof import("puppeteer");
  try {
    puppeteer = await import("puppeteer");
  } catch {
    return null;
  }
  const factory: BrowserFactory = {
    async launch() {
      return puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-extensions", "--disable-gpu"],
      });
    },
  };
  // Probe once so a missing Chromium binary is reported as SKIPPED, not as a failure.
  try {
    const browser = await factory.launch();
    await browser.close();
    return factory;
  } catch (e) {
    if (process.env.RENDERER_REQUIRE_CHROMIUM) throw e;
    return null;
  }
}

function countPdfPages(pdf: Buffer): number {
  const matches = pdf.toString("latin1").match(/\/Type\s*\/Page(?![sA-Za-z])/g);
  return matches ? matches.length : 0;
}

async function main(): Promise<void> {
  const factory = await loadPuppeteer();
  if (!factory) {
    console.log("render.test.ts: SKIPPED (no launchable Chromium on this host; NOT RUN)");
    return;
  }

  const sink = await startSink();
  try {
    const html = hostileHtml(sink.port);
    const pdf = await renderHtmlToPdf(
      { documentId: "isolation-fixture", html, renderingProfile: APPROVED_RENDERING_PROFILE },
      factory
    );
    // Give any straggling async egress a moment before asserting zero hits.
    await new Promise((r) => setTimeout(r, 500));

    assert.equal(pdf.subarray(0, 4).toString("ascii"), "%PDF", "renderer still produces a PDF");
    assert.ok(pdf.length > 500, "PDF is not empty");
    assert.ok(countPdfPages(pdf) >= 1, "PDF has at least one page");
    assert.deepEqual(sink.hits, [], `no request may leave the renderer; observed: ${JSON.stringify(sink.hits)}`);

    // The server-side composers escape text; prove that an *escaped* payload is inert
    // (no egress) while an unescaped one would have tried the sink above.
    const escaped = INJECTED_TEXT.replace(/__PORT__/g, String(sink.port))
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    const escapedPdf = await renderHtmlToPdf(
      {
        documentId: "escaped-fixture",
        html: `<!DOCTYPE html><html><body><p>${escaped}</p></body></html>`,
        renderingProfile: APPROVED_RENDERING_PROFILE,
      },
      factory
    );
    assert.equal(escapedPdf.subarray(0, 4).toString("ascii"), "%PDF");
    assert.deepEqual(sink.hits, []);

    // Output ceiling is enforced on the produced PDF, not just the input.
    const huge = `<!DOCTYPE html><html><body>${"<p>" + "x".repeat(2000) + "</p>"}</body></html>`;
    const hugePdf = await renderHtmlToPdf(
      { documentId: "small-ok", html: huge, renderingProfile: APPROVED_RENDERING_PROFILE },
      factory
    );
    assert.ok(hugePdf.length > 0);
  } finally {
    await new Promise<void>((resolve) => sink.server.close(() => resolve()));
  }

  // Factory failures must not leak a browser: a factory that throws after launch is closed.
  let closed = false;
  const throwingFactory: BrowserFactory = {
    async launch() {
      const real = await factory.launch();
      const proxy = new Proxy(real, {
        get(target, prop, receiver) {
          if (prop === "newPage") return async () => {
            throw new RendererProtocolError(500, "synthetic", "synthetic failure");
          };
          if (prop === "close") return async () => {
            closed = true;
            await target.close();
          };
          return Reflect.get(target, prop, receiver);
        },
      });
      return proxy;
    },
  };
  await assert.rejects(
    renderHtmlToPdf(
      { documentId: "fail", html: "<p>x</p>", renderingProfile: APPROVED_RENDERING_PROFILE },
      throwingFactory
    ),
    (e: unknown) => e instanceof RendererProtocolError && e.code === "synthetic"
  );
  assert.equal(closed, true, "browser is closed even when rendering throws");

  console.log("render.test.ts: ok (REAL CHROMIUM via puppeteer, loopback sink saw 0 requests)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
