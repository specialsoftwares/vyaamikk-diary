/**
 * Static audit: raw plan comparisons stay inside the subscription domain.
 * Also proves no IAP, no client writes to subscription/status, and root wiring.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".") || name === "coverage") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function posix(rel: string): string {
  return rel.split("\\").join("/");
}

const ALLOW_PLAN_COMPARE = [
  /^src\/subscription\//,
  /^functions\/src\/billing\//,
];

function isAllowlisted(rel: string): boolean {
  const p = posix(rel);
  if (p.includes(".test.")) return true;
  return ALLOW_PLAN_COMPARE.some((re) => re.test(p));
}

  const PLAN_COMPARE = [
  /\bplan\s*[=!]==?\s*['"](?:free|starter|professional|business)['"]/,
  /['"](?:free|starter|professional|business)['"]\s*[=!]==?\s*\bplan\b/,
  /\b(?:status|subscription)\.plan\s*[=!]==?\s*['"](?:free|starter|professional|business)['"]/,
  /\bswitch\s*\(\s*plan\s*\)/,
];

const scanRoots = [join(repoRoot, "src"), join(repoRoot, "app")];
const files = scanRoots.flatMap((d) => walk(d));
assert.ok(files.length > 50, "expected client source files");

const violations: string[] = [];
for (const file of files) {
  const rel = relative(repoRoot, file);
  if (isAllowlisted(rel)) continue;
  if (posix(rel).includes("/locales/")) continue;
  const code = stripComments(readFileSync(file, "utf8"));
  for (const re of PLAN_COMPARE) {
    re.lastIndex = 0;
    if (re.test(code)) {
      violations.push(`${posix(rel)} matches ${re}`);
    }
  }
}

assert.deepEqual(violations, [], `raw plan comparisons outside allowlist:\n${violations.join("\n")}`);

{
  const layout = readFileSync(join(repoRoot, "app/_layout.tsx"), "utf8");
  assert.match(layout, /SubscriptionProvider/);
  const authIdx = layout.indexOf("<AuthProvider>");
  const subIdx = layout.indexOf("<SubscriptionProvider>");
  const syncIdx = layout.indexOf("<SyncProvider>");
  assert.ok(authIdx >= 0 && subIdx > authIdx && syncIdx > subIdx);
}

{
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  assert.equal(deps["expo-iap"], undefined);
  assert.equal(deps["react-native-iap"], undefined);
  assert.match(pkg.scripts?.["lint:eslint"] ?? "", /src\/subscription\/\*\*\/\*\.\{ts,tsx\}/);
  assert.match(pkg.scripts?.["lint:eslint"] ?? "", /app\/_layout\.tsx/);
}

{
  const subDir = join(repoRoot, "src/subscription");
  const subFiles = walk(subDir).filter((f) => !f.endsWith(".test.ts"));
  const writeApis = /\b(setDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\b/;
  const iap = /expo-iap|react-native-iap|BillingClient|StoreKit|restorePurchases|vyd_pending_purchase_v1/;
  const paywall = /UpgradeSheet|SubscriptionManagementScreen|paywall/;
  for (const file of subFiles) {
    const src = stripComments(readFileSync(file, "utf8"));
    const rel = posix(relative(repoRoot, file));
    assert.doesNotMatch(src, writeApis, `${rel} must not write Firestore`);
    assert.doesNotMatch(src, iap, `${rel} must not add IAP`);
    assert.doesNotMatch(src, paywall, `${rel} must not add billing UI`);
  }
}

{
  const firestore = stripComments(
    readFileSync(join(repoRoot, "src/subscription/subscriptionFirestore.ts"), "utf8")
  );
  assert.match(firestore, /onSnapshot/);
  assert.match(firestore, /includeMetadataChanges:\s*true/);
  assert.match(firestore, /fromCache/);
  assert.match(firestore, /getDocFromServer/);
  assert.doesNotMatch(firestore, /\bsetDoc\b/);
}

{
  const features = readFileSync(
    join(repoRoot, "src/subscription/subscriptionFeatures.ts"),
    "utf8"
  );
  assert.match(features, /UX gating only/);
  assert.doesNotMatch(features, /multiBusinessProfiles|canUseAdvancedExports|csvExport/);
}

{
  const uiDirs = [join(repoRoot, "app"), join(repoRoot, "src/components")];
  const lifecycle = /billingStatus\s*===|trialEndsAt|gracePeriodEndsAt/;
  for (const file of uiDirs.flatMap((d) => walk(d))) {
    const rel = posix(relative(repoRoot, file));
    if (rel.includes(".test.")) continue;
    const src = stripComments(readFileSync(file, "utf8"));
    assert.doesNotMatch(
      src,
      lifecycle,
      `${rel} must not implement subscription lifecycle rules`
    );
  }
}

console.log("subscriptionPlan.static.test.ts: ok");
