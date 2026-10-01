/**
 * Transport isolation: mobile-safe httpsCallable port.
 * Must not import emulator tools, firebase-admin, HostSqlite, or node:fs.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, "../../../..");

function walk(current: string, out: string[] = []): string[] {
  for (const name of readdirSync(current)) {
    if (name.startsWith(".")) continue;
    const p = join(current, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.includes(".test.")) out.push(p);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const forbidden = [
  /firebase-admin/,
  /tools\/goods-evidence-emulator/,
  /tools\/goods-evidence-storage/,
  /better-sqlite3/,
  /node:fs/,
  /from ["']fs["']/,
  /HostSqlite/,
  /hostSqlite/,
];

const files = walk(dir);
assert.ok(files.length > 0);
for (const file of files) {
  const rel = relative(repoRoot, file);
  const src = stripComments(readFileSync(file, "utf8"));
  for (const pattern of forbidden) {
    assert.doesNotMatch(src, pattern, `${rel} must not match ${pattern}`);
  }
}

const transport = readFileSync(join(dir, "firebaseTransport.ts"), "utf8");
assert.match(transport, /httpsCallable/);
assert.match(transport, /currentAuth/);
assert.doesNotMatch(transport, /createInjectedGrinServerPort/);

console.log("src/services/grin/transport/isolation.contract.test.ts: ok");
