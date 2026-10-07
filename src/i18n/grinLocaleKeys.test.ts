import assert from "node:assert/strict";

import { OFFLINE_PENDING_BANNER, GRIN_DOCUMENT_FOOTER } from "@/goodsEvidence/constants";
import en from "./locales/en.json";
import hi from "./locales/hi.json";
import ta from "./locales/ta.json";
import te from "./locales/te.json";
import gu from "./locales/gu.json";

function flatten(node: unknown, prefix = "", out: string[] = []): string[] {
  if (typeof node === "string") {
    if (prefix) out.push(prefix);
    return out;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  }
  return out;
}

function empties(node: unknown, prefix = "", out: string[] = []): string[] {
  if (typeof node === "string") {
    if (prefix && node.trim() === "") out.push(prefix);
    return out;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      empties(v, prefix ? `${prefix}.${k}` : k, out);
    }
  }
  return out;
}

const catalogs = { en, hi, ta, te, gu } as const;
const enKeys = flatten((en as { grin: unknown }).grin).sort();
assert.ok(enKeys.length > 40);
assert.equal((en as { grin: { offlinePendingBanner: string } }).grin.offlinePendingBanner, OFFLINE_PENDING_BANNER);
assert.ok(enKeys.includes("pdf.title"));

for (const [lang, tree] of Object.entries(catalogs)) {
  const grin = (tree as { grin?: unknown }).grin;
  assert.ok(grin, `${lang} missing grin catalog`);
  const keys = flatten(grin).sort();
  assert.deepEqual(keys, enKeys, `${lang} grin keys differ from English`);
  assert.deepEqual(empties(grin), [], `${lang} has empty grin strings`);
}

assert.match(GRIN_DOCUMENT_FOOTER, /not a GST Receipt Voucher/);

console.log(`grinLocaleKeys.test.ts: ${enKeys.length} grin keys × 5 locales ok`);
