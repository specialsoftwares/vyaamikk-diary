/**
 * Viewport captures of the isolated billing UX harness.
 * Isolated component preview — not full-app or native validation.
 *
 * Usage: node scripts/capture-isolated.mjs
 * Requires Playwright Core (resolved from /tmp/vyd-pw) + system Chrome.
 * Does not start application bootstrap.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const requireFromTmp = createRequire("/tmp/vyd-pw/package.json");
const { chromium } = requireFromTmp("playwright-core");

const here = path.dirname(fileURLToPath(import.meta.url));
const harnessRoot = path.resolve(here, "..");
const workspaceRoot = path.resolve(harnessRoot, "../..");
const outDir = path.join(harnessRoot, "captures");
const url = process.env.HARNESS_URL ?? "http://127.0.0.1:8092";

const PHONE = { width: 390, height: 844, deviceScaleFactor: 2 };
const NARROW = { width: 320, height: 720, deviceScaleFactor: 2 };

const LABEL = "Isolated component preview — not full-app or native validation.";

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function gitHead() {
  return execSync("git rev-parse HEAD", { cwd: workspaceRoot, encoding: "utf8" }).trim();
}

async function waitReady(page) {
  await page.waitForFunction(
    () =>
      Boolean(
        [...document.querySelectorAll("*")].find((n) =>
          (n.textContent || "").includes("Billing UX preview")
        )
      ),
    { timeout: 45000 }
  );
}

async function clickName(page, name) {
  const loc = page.getByRole("button", { name, exact: true }).first();
  await loc.waitFor({ state: "visible", timeout: 15000 });
  await loc.click();
  await page.waitForTimeout(350);
}

async function revealName(page, name) {
  const loc = page.getByRole("button", { name, exact: true }).first();
  await loc.waitFor({ state: "visible", timeout: 15000 });
  await loc.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
}

async function closeSheet(page) {
  for (const name of ["Close upgrade options", "अपग्रेड विकल्प बंद करें"]) {
    const close = page.getByRole("button", { name, exact: true });
    if (await close.count()) {
      try {
        await close.first().click({ timeout: 4000 });
        await page.waitForTimeout(300);
        return;
      } catch {
        /* try next label */
      }
    }
  }
}

async function backToHub(page) {
  for (const name of ["Go back", "वापस जाएँ", "Back", "वापस"]) {
    const back = page.getByRole("button", { name, exact: true });
    if (await back.count()) {
      try {
        await back.first().click({ timeout: 4000 });
        await page.waitForTimeout(300);
        break;
      } catch {
        /* try next label */
      }
    }
  }
  await closeSheet(page);
}

async function setViewport(page, metrics) {
  await page.setViewportSize({ width: metrics.width, height: metrics.height });
}

async function capture(page, file, extra = {}) {
  const buf = await page.screenshot({ type: "png", fullPage: false, animations: "disabled" });
  const dest = path.join(outDir, file);
  fs.writeFileSync(dest, buf);
  const vp = page.viewportSize();
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  const zoom = await page.evaluate(() => document.documentElement.style.zoom || "1");
  const scroll = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
    scrollY: window.scrollY,
  }));
  return {
    file,
    path: path.relative(workspaceRoot, dest),
    sha256: sha256(buf),
    bytes: buf.length,
    viewport: { width: vp?.width ?? 0, height: vp?.height ?? 0 },
    devicePixelRatio: dpr,
    language: extra.language ?? "en",
    selectedState: extra.selectedState,
    cssZoom: zoom,
    scroll,
    label: LABEL,
  };
}

async function scrollCtaIntoView(page) {
  await page.evaluate(() => {
    const match = [...document.querySelectorAll("*")].find((n) =>
      /Restore purchases|Restoring purchases|Waiting to restore|Continue|Start 14-day|Trial cannot|खरीदारी/.test(
        n.textContent || ""
      )
    );
    match?.scrollIntoView({ block: "end" });
  });
  await page.waitForTimeout(200);
}

async function applyCssZoom(page, zoom) {
  await page.evaluate((z) => {
    document.documentElement.style.zoom = z;
  }, zoom);
}

async function clearCssZoom(page) {
  await page.evaluate(() => {
    document.documentElement.style.zoom = "";
  });
}

const chromeCandidates = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
].filter(Boolean);

function chromePath() {
  for (const candidate of chromeCandidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("Chrome not found");
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const candidateSha = process.env.CANDIDATE_SHA || gitHead();
  const browser = await chromium.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--disable-dev-shm-usage", "--hide-scrollbars"],
  });
  const context = await browser.newContext({
    viewport: { width: PHONE.width, height: PHONE.height },
    deviceScaleFactor: PHONE.deviceScaleFactor,
    locale: "en-IN",
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitReady(page);

  const records = [];
  const note = (selectedState, language = "en") => ({ selectedState, language });

  await setViewport(page, PHONE);
  records.push(await capture(page, "isolated-hub-en.png", note("hub-en-phone-390x844")));
  await revealName(page, "Use reduced-motion fixture");
  records.push(await capture(page, "isolated-hub-en-scrolled.png", note("hub-en-scrolled-end")));

  await setViewport(page, NARROW);
  records.push(await capture(page, "isolated-hub-en-narrow.png", note("hub-en-narrow-320x720")));
  await setViewport(page, PHONE);

  await clickName(page, "Open benefit education");
  records.push(await capture(page, "isolated-education-en.png", note("education-en")));
  await applyCssZoom(page, "1.75");
  await revealName(page, "See plans");
  records.push(
    await capture(page, "isolated-education-en-enlarged.png", note("education-en-css-zoom-1.75"))
  );
  await clearCssZoom(page);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(200);
  await revealName(page, "See plans");
  records.push(
    await capture(page, "isolated-education-en-scrolled.png", note("education-en-scrolled-end"))
  );
  await backToHub(page);

  const triggers = [
    ["Upgrade sheet — record limit", "isolated-sheet-record-limit-en.png", "trigger-recordLimitReached"],
    ["Upgrade sheet — feature locked", "isolated-sheet-feature-locked-en.png", "trigger-featureLocked"],
    ["Upgrade sheet — trial ending", "isolated-sheet-trial-ending-en.png", "trigger-trialExpiring"],
    ["Upgrade sheet — manual", "isolated-sheet-manual-en.png", "trigger-manualUpgrade"],
  ];
  for (const [label, file, state] of triggers) {
    await clickName(page, label);
    await scrollCtaIntoView(page);
    records.push(await capture(page, file, note(state)));
    await closeSheet(page);
  }

  await clickName(page, "Upgrade sheet — manual");
  await clickName(page, "Quarterly");
  records.push(await capture(page, "isolated-sheet-period-quarterly-en.png", note("period-quarterly")));
  await clickName(page, "Yearly");
  records.push(await capture(page, "isolated-sheet-period-yearly-en.png", note("period-yearly")));
  await clickName(page, "Monthly");
  await closeSheet(page);

  await clickName(page, "Use trial-eligible fixture");
  await clickName(page, "Upgrade sheet — manual");
  const professional = page.getByRole("button", { name: /Professional\./ }).first();
  await professional.click();
  await page.waitForTimeout(300);
  records.push(
    await capture(
      page,
      "isolated-sheet-trial-eligible-unavailable-en.png",
      note("trial-eligible-professional-action-unavailable")
    )
  );
  await closeSheet(page);
  await clickName(page, "Use trial-action-available fixture");
  await clickName(page, "Upgrade sheet — manual");
  await professional.click();
  await page.waitForTimeout(300);
  records.push(
    await capture(
      page,
      "isolated-sheet-trial-eligible-en.png",
      note("trial-eligible-professional-action-available")
    )
  );
  await closeSheet(page);
  await clickName(page, "Use trial-not-eligible fixture");
  await clickName(page, "Use trial-action-unavailable fixture");
  await clickName(page, "Upgrade sheet — manual");
  await professional.click();
  await page.waitForTimeout(300);
  records.push(
    await capture(
      page,
      "isolated-sheet-trial-ineligible-en.png",
      note("trial-ineligible-professional-paid-purchase")
    )
  );
  await closeSheet(page);

  await clickName(page, "Catalog loading fixture");
  records.push(await capture(page, "isolated-sheet-loading-en.png", note("catalog-loading")));
  await closeSheet(page);

  await clickName(page, "Catalog unavailable fixture");
  records.push(await capture(page, "isolated-sheet-unavailable-en.png", note("catalog-unavailable")));
  await closeSheet(page);

  await clickName(page, "Purchase pending fixture");
  records.push(await capture(page, "isolated-sheet-purchase-pending-en.png", note("purchase-pending")));
  await closeSheet(page);

  await clickName(page, "Controlled error fixture");
  const alert = page.getByRole("alert").first();
  if (await alert.count()) await alert.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  records.push(await capture(page, "isolated-sheet-error-en.png", note("purchase-error")));
  await closeSheet(page);

  await clickName(page, "Restore in-progress fixture");
  records.push(await capture(page, "isolated-sheet-restore-pending-en.png", note("restore-pending")));
  await closeSheet(page);

  await setViewport(page, NARROW);
  await clickName(page, "Upgrade sheet — record limit");
  await scrollCtaIntoView(page);
  records.push(
    await capture(
      page,
      "isolated-sheet-record-limit-en-narrow.png",
      note("trigger-recordLimitReached-narrow-cta-dock")
    )
  );
  await applyCssZoom(page, "1.75");
  records.push(
    await capture(page, "isolated-sheet-en-narrow-enlarged.png", note("narrow-paywall-css-zoom-1.75-top"))
  );
  await clearCssZoom(page);
  await closeSheet(page);
  await setViewport(page, PHONE);

  await clickName(page, "हिंदी");
  await page.waitForTimeout(400);
  records.push(await capture(page, "isolated-hub-hi.png", note("hub-hi", "hi")));
  await clickName(page, "ट्रायल-पात्र फिक्स्चर");
  await page.waitForTimeout(250);
  records.push(
    await capture(page, "isolated-hub-hi-trial-off.png", note("hub-hi-trial-ineligible-toggle", "hi"))
  );

  await clickName(page, "लाभ शिक्षा खोलें");
  await page.waitForTimeout(400);
  records.push(await capture(page, "isolated-education-hi.png", note("education-hi", "hi")));
  await applyCssZoom(page, "1.75");
  await revealName(page, "योजनाएँ देखें");
  records.push(
    await capture(page, "isolated-education-hi-enlarged.png", note("education-hi-css-zoom-1.75", "hi"))
  );
  await clearCssZoom(page);
  await backToHub(page);

  await clickName(page, "अपग्रेड शीट — रिकॉर्ड सीमा");
  records.push(
    await capture(page, "isolated-sheet-record-limit-hi.png", note("trigger-recordLimitReached-hi", "hi"))
  );
  await closeSheet(page);

  const hubEn = records.find((r) => r.file === "isolated-hub-en.png");
  const hubNarrow = records.find((r) => r.file === "isolated-hub-en-narrow.png");
  const duplicateHub = Boolean(hubEn && hubNarrow && hubEn.sha256 === hubNarrow.sha256);

  const manifest = {
    label: LABEL,
    capturedAt: new Date().toISOString(),
    candidateSha,
    harnessUrl: url,
    captureMethod: "playwright-core Chrome page.screenshot viewport (not editor-panel crop)",
    cssZoomNote:
      "CSS zoom is browser evidence, not native Dynamic Type or Android/iOS accessibility validation. A full-viewport curtain scaled with document zoom can clip the CTA dock; unzoomed narrow captures show the dock, and enlarged education (scrollable) keeps See plans reachable.",
    hubRegularVsNarrowIdentical: duplicateHub,
    captures: records,
  };

  const contactHtml = path.join(outDir, "isolated-contact-sheet.html");
  const tiles = records
    .filter((r) => r.file.endsWith(".png"))
    .map(
      (r) =>
        `<figure><img src="${r.file}" alt="${r.selectedState}" /><figcaption>${r.file}<br/>${r.selectedState}<br/>${r.viewport.width}×${r.viewport.height} dpr=${r.devicePixelRatio} lang=${r.language}</figcaption></figure>`
    )
    .join("\n");
  fs.writeFileSync(
    contactHtml,
    `<!doctype html><meta charset="utf-8"><title>Isolated billing UX contact sheet</title>
<style>
body{margin:0;background:#0B0D18;color:#E0E7FF;font:12px/1.4 -apple-system,sans-serif}
h1{font-size:16px;padding:16px}
.grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;padding:12px}
figure{margin:0;background:#111;padding:8px}
img{width:100%;height:auto;display:block;border:1px solid #334}
figcaption{margin-top:6px;word-break:break-word}
.banner{padding:12px 16px;background:#1E1B4B}
</style>
<p class="banner">${LABEL}</p>
<h1>VYD-37 isolated captures · ${candidateSha.slice(0, 12)}</h1>
<div class="grid">${tiles}</div>`
  );

  const contactPage = await context.newPage();
  await contactPage.goto(`file://${contactHtml}`, { waitUntil: "domcontentloaded" });
  const contactHeight = await contactPage.evaluate(() => document.documentElement.scrollHeight);
  await contactPage.setViewportSize({ width: 1600, height: Math.min(contactHeight + 24, 8000) });
  const contactBuf = await contactPage.screenshot({
    type: "png",
    fullPage: true,
    animations: "disabled",
  });
  const contactPng = path.join(outDir, "isolated-contact-sheet.png");
  fs.writeFileSync(contactPng, contactBuf);
  records.push({
    file: "isolated-contact-sheet.png",
    path: path.relative(workspaceRoot, contactPng),
    sha256: sha256(contactBuf),
    bytes: contactBuf.length,
    viewport: { width: 1600, height: Math.min(contactHeight + 24, 8000) },
    devicePixelRatio: 1,
    language: "n/a",
    selectedState: "contact-sheet",
    cssZoom: "1",
    scroll: { scrollHeight: 0, clientHeight: 0, scrollY: 0 },
    label: LABEL,
  });
  await contactPage.close();
  await browser.close();

  manifest.captures = records;
  fs.writeFileSync(path.join(outDir, "capture-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  if (duplicateHub) {
    throw new Error("hub-en and hub-en-narrow are byte-identical; narrow viewport did not change the capture");
  }
  console.log(`captured ${records.length} viewports; candidateSha=${candidateSha}`);
  console.log(`manifest ${path.join(outDir, "capture-manifest.json")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
