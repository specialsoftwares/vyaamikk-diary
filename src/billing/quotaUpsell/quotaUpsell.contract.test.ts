/**
 * Integration wiring and isolation: host stays presentation-only, UpgradeSheet
 * stays controller-free, ordinary callers notify, letterhead / background do not.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".") || name === "coverage") continue;
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

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

const runtime = stripComments(read("src/billing/quotaUpsell/quotaUpsellHostRuntime.ts"));
assert.match(runtime, /createQuotaUpsellController/);
assert.match(runtime, /registerQuotaUpsellPresenter/);
assert.doesNotMatch(runtime, /grantProfessionalTrial/);
assert.doesNotMatch(runtime, /\bsetDoc\b/);

const host = stripComments(read("src/billing/quotaUpsell/QuotaUpsellHost.tsx"));
assert.match(host, /useIap\(\)/);
assert.match(host, /useSubscription\(\)/);
assert.match(host, /iap\.purchase|purchase,/);
assert.match(host, /restorePurchases/);
assert.match(host, /trialActionAvailable=\{model\.trialActionAvailable\}/);
assert.match(host, /createQuotaUpsellHostRuntime/);
assert.match(host, /runtime\.reconcile/);
assert.match(host, /errorRetryEnabled=\{model\.errorRetryEnabled\}/);
assert.match(host, /\.catch\(/);
assert.doesNotMatch(host, /grantProfessionalTrial/);
assert.doesNotMatch(host, /\bsetDoc\b/);
assert.doesNotMatch(host, /subscription\/status/);
assert.doesNotMatch(host, /from ["']expo-iap["']/);
assert.doesNotMatch(host, /₹99|₹249|fixtureReadyOffers/);

const gate = stripComments(read("src/billing/quotaUpsell/quotaUpsellGate.ts"));
assert.match(gate, /process\.env\.EXPO_PUBLIC_QUOTA_UPSELL_ENABLED === ["']1["']/);
assert.doesNotMatch(gate, /process\.env\s*\[/);

const sheet = stripComments(read("src/components/billing/UpgradeSheet.tsx"));
assert.doesNotMatch(sheet, /useIap\b/);
assert.doesNotMatch(sheet, /notifyOrdinaryQuotaUpsell/);
assert.match(sheet, /errorRetryEnabled/);

const layout = read("app/_layout.tsx");
assert.match(layout, /QuotaUpsellHost/);
assert.match(layout, /<IapProvider>/);
assert.ok(layout.indexOf("<QuotaUpsellHost>") > layout.indexOf("<IapProvider>"));
assert.ok(layout.indexOf("<QuotaUpsellHost>") < layout.indexOf("<SyncProvider>"));

const wired = [
  "app/(app)/composer/[type].tsx",
  "app/(app)/purchase-order/form.tsx",
  "app/(app)/customer-credit/form.tsx",
  "app/(app)/professional-pack/form.tsx",
];
for (const rel of wired) {
  const src = read(rel);
  assert.match(src, /notifyOrdinaryQuotaUpsell/, `${rel} must notify ordinary quota upsell`);
  assert.match(src, /captureAdmissionToken/, `${rel} must capture the save session`);
  assert.match(src, /origin:\s*["']user_save["']/, `${rel} must mark user_save`);
}

const letterhead = read("app/(app)/letterhead/create.tsx");
assert.doesNotMatch(letterhead, /notifyOrdinaryQuotaUpsell/);
assert.doesNotMatch(letterhead, /QuotaUpsellHost/);

const payment = read("app/(app)/customer-credit/payment.tsx");
const close = read("app/(app)/customer-credit/close.tsx");
assert.doesNotMatch(payment, /notifyOrdinaryQuotaUpsell/);
assert.doesNotMatch(close, /notifyOrdinaryQuotaUpsell/);

const syncFiles = walk(join(repoRoot, "src/sync")).filter((f) => !f.includes(".test."));
for (const file of syncFiles) {
  const src = readFileSync(file, "utf8");
  assert.doesNotMatch(
    src,
    /notifyOrdinaryQuotaUpsell/,
    `${relative(repoRoot, file)} must not open quota upsell from background sync`
  );
}

const preview = stripComments(read("src/components/billing/BillingUxPreviewLab.tsx"));
assert.doesNotMatch(preview, /notifyOrdinaryQuotaUpsell/);
assert.doesNotMatch(preview, /useIap\b/);

console.log("quotaUpsell.contract.test.ts: ok");
