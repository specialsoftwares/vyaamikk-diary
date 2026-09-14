/**
 * Static security audits for VYD-35 native IAP.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const iapDir = join(repoRoot, "src/billing/iap");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function posix(rel: string): string {
  return rel.split("\\").join("/");
}

const iapFiles = walk(iapDir).filter((f) => !f.includes(".test."));
const iapSrc = iapFiles.map((f) => ({
  rel: posix(relative(repoRoot, f)),
  src: stripComments(readFileSync(f, "utf8")),
}));

{
  for (const { rel, src } of iapSrc) {
    assert.doesNotMatch(src, /firebase-admin/, `${rel} must not import Firebase Admin`);
    assert.doesNotMatch(
      src,
      /users\/\$\{.*\}\/subscription\/status/,
      `${rel} must not write subscription/status paths`
    );
    assert.doesNotMatch(src, /\bsetDoc\b/, `${rel} must not setDoc`);
    assert.doesNotMatch(src, /\bupdateDoc\b/, `${rel} must not updateDoc`);
  }
}

{
  const pending = readFileSync(join(iapDir, "iapPendingPurchase.ts"), "utf8");
  assert.match(pending, /vyd_pending_purchase_v1/);
  assert.match(pending, /purchaseToken/);
  assert.match(pending, /appAccountToken/);
  assert.match(pending, /obfuscatedAccountId/);
  const pendingCode = stripComments(pending);
  assert.match(pendingCode, /pendingEnvelopeContainsSecrets/);
}

{
  const processor = stripComments(readFileSync(join(iapDir, "iapPurchaseProcessor.ts"), "utf8"));
  assert.match(processor, /void purchase\.currentPlanId/);
  assert.doesNotMatch(
    processor,
    /canonicalSku.*=.*currentPlanId|currentPlanId.*canonicalSku/
  );
  assert.doesNotMatch(processor, /finishTransaction\(/);
  assert.match(processor, /finishTransactionIOS/);
  assert.match(processor, /validateAndActivateAndroid/);
  assert.match(processor, /validateAndActivateIOS/);
}

{
  const session = stripComments(readFileSync(join(iapDir, "iapSession.ts"), "utf8"));
  assert.match(session, /prepareAndroidBillingAccount/);
  assert.match(session, /prepareIOSBillingAccount/);
  assert.match(session, /writePendingPurchase/);
  assert.match(session, /requestPurchase/);
  const pendingIdx = session.indexOf("writePendingPurchase");
  const reqIdx = session.lastIndexOf("requestPurchase");
  assert.ok(pendingIdx >= 0 && reqIdx > pendingIdx);
  assert.doesNotMatch(session, /withOffer|winBackOffer|promotionalOfferJWS|compactJWS/);
  assert.doesNotMatch(session, /billingPlanType:\s*["']MONTHLY["']/);
  assert.doesNotMatch(session, /offers\s*\[\s*0\s*\]/);
  assert.doesNotMatch(session, /expectedPriceInPaise|₹99|₹249/);
}

{
  const nativeRaw = readFileSync(join(iapDir, "iapNative.ts"), "utf8");
  const native = stripComments(nativeRaw);
  assert.match(native, /from "expo-iap"/);
  assert.match(native, /finishTransactionIOS/);
  assert.doesNotMatch(native, /acknowledgePurchaseAndroid/);
  assert.match(nativeRaw, /Do not add an Android finish/);
}

{
  const provider = stripComments(readFileSync(join(iapDir, "IapProvider.tsx"), "utf8"));
  assert.match(provider, /createIapSession/);
  assert.doesNotMatch(provider, /\buseIAP\b/);
  assert.match(provider, /expo_go|native_build_required/);
}

{
  const offers = stripComments(readFileSync(join(iapDir, "iapOffers.ts"), "utf8"));
  assert.doesNotMatch(offers, /offers\s*\[\s*0\s*\]/);
  assert.match(offers, /id === offer.basePlanIdAndroid/);
}

{
  const appJson = readFileSync(join(repoRoot, "app.json"), "utf8");
  assert.match(appJson, /"expo-iap"/);
  assert.doesNotMatch(appJson, /iapkitApiKey/);
  assert.doesNotMatch(appJson, /"onside"|horizonAppId|alternativeBilling/);
  const buildProps = appJson.indexOf("expo-build-properties");
  const iapPlugin = appJson.indexOf('"expo-iap"');
  assert.ok(buildProps >= 0 && iapPlugin > buildProps);
  assert.match(appJson, /"useFrameworks": "static"/);
}

{
  const srcAndApp = [join(repoRoot, "src"), join(repoRoot, "app")].flatMap((d) => walk(d));
  const entitlementWrites: string[] = [];
  const iapImports: string[] = [];
  for (const file of srcAndApp) {
    const rel = posix(relative(repoRoot, file));
    if (rel.includes(".test.")) continue;
    const src = stripComments(readFileSync(file, "utf8"));
    if (/setDoc\(/.test(src) && /subscription\/status/.test(src)) {
      entitlementWrites.push(rel);
    }
    if (rel.startsWith("src/billing/iap/")) continue;
    if (rel === "app/_layout.tsx" || rel === "src/billing/iap/index.ts") continue;
    if (rel === "src/services/accountDeletion/purgeLocal.ts") continue;
    if (/\bfrom ["']expo-iap["']/.test(src) || /\buseIAP\b/.test(src)) {
      iapImports.push(rel);
    }
  }
  assert.deepEqual(entitlementWrites, [], "client must not write subscription/status");
  assert.deepEqual(
    iapImports,
    [],
    `expo-iap must stay inside IAP domain + root provider: ${iapImports.join(", ")}`
  );
}

{
  const layout = readFileSync(join(repoRoot, "app/_layout.tsx"), "utf8");
  const iapCount = layout.split("<IapProvider>").length - 1;
  assert.equal(iapCount, 1);
}

console.log("iap.static.test.ts: ok");
