import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import en from "./locales/en.json";
import hi from "./locales/hi.json";
import ta from "./locales/ta.json";
import te from "./locales/te.json";
import gu from "./locales/gu.json";

type JsonTree = Record<string, unknown>;

function flattenKeys(node: unknown, prefix = "", out: string[] = []): string[] {
  if (typeof node === "string") {
    if (prefix) out.push(prefix);
    return out;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      flattenKeys(v, prefix ? `${prefix}.${k}` : k, out);
    }
  }
  return out;
}

function flattenEmpty(node: unknown, prefix = "", out: string[] = []): string[] {
  if (typeof node === "string") {
    if (prefix && node.trim() === "") out.push(prefix);
    return out;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      flattenEmpty(v, prefix ? `${prefix}.${k}` : k, out);
    }
  }
  return out;
}

const SKIP_PARTS = ["node_modules", "/locales/", ".test.", "tools/", "functions/"];

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(process.cwd(), full);
    if (SKIP_PARTS.some((p) => rel.includes(p))) continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const enKeys = new Set(flattenKeys(en));
const emptyCanonical = flattenEmpty(en);
const used = new Map<string, string[]>();
const dynamic: { file: string; snippet: string }[] = [];

const staticKeyRe = /\bt\(\s*(["'`])([^"'`$]+)\1/g;
const dynamicTRe = /\bt\(\s*`([^`]*\$\{[^`]*)`/g;

for (const dir of ["app", "src"]) {
  for (const file of walk(path.join(process.cwd(), dir))) {
    const src = fs.readFileSync(file, "utf8");
    const rel = path.relative(process.cwd(), file);
    let m: RegExpExecArray | null;
    const re = new RegExp(staticKeyRe.source, "g");
    while ((m = re.exec(src))) {
      const key = m[2]!;
      if (!used.has(key)) used.set(key, []);
      used.get(key)!.push(rel);
    }
    const dyn = new RegExp(dynamicTRe.source, "g");
    while ((m = dyn.exec(src))) {
      dynamic.push({ file: rel, snippet: m[0].slice(0, 160) });
    }
  }
}

const missing = [...used.keys()].filter((k) => !enKeys.has(k)).sort();
const usedEmpty = [...used.keys()].filter((k) => emptyCanonical.includes(k)).sort();

assert.deepEqual(
  missing,
  [],
  `canonical English missing keys that would render raw:\n${missing
    .map((k) => `  ${k} <- ${used.get(k)!.slice(0, 3).join(", ")}`)
    .join("\n")}`
);

assert.deepEqual(
  usedEmpty,
  [],
  `used keys with empty canonical English values:\n${usedEmpty.join("\n")}`
);

const unusedEmpty = emptyCanonical.filter((k) => !used.has(k));
assert.deepEqual(
  unusedEmpty,
  ["settings.appearanceHint"],
  `unexpected unused empty canonical keys: ${unusedEmpty.join(", ")}`
);

assert.equal(enKeys.has("settings.deleteAccountAndData"), true);
assert.equal(enKeys.has("settings.deleteAccountSubtitle"), true);
assert.ok(
  (en as { settings: { deleteAccountAndData: string } }).settings.deleteAccountAndData.length > 0
);
assert.ok(
  (en as { settings: { deleteAccountSubtitle: string } }).settings.deleteAccountSubtitle.length > 0
);

const hiKeys = new Set(flattenKeys(hi));
assert.equal(hiKeys.has("settings.deleteAccountAndData"), true);
assert.equal(hiKeys.has("settings.deleteAccountSubtitle"), true);

for (const [label, tree] of [
  ["ta", ta],
  ["te", te],
  ["gu", gu],
] as const) {
  const keys = new Set(flattenKeys(tree as JsonTree));
  assert.equal(
    keys.has("settings.deleteAccountAndData"),
    false,
    `${label} must keep English fallback (do not paste English copies)`
  );
}

console.log(`i18nKeyConsistency: ${used.size} static keys, ${dynamic.length} dynamic t() templates`);
console.log(
  "dynamic (not statically validated):",
  [...new Set(dynamic.map((d) => d.snippet))].slice(0, 12).join(" | ")
);
console.log("i18nKeyConsistency.test.ts: ok");
