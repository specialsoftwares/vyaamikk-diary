/**
 * Interop harness isolation: wrap G1, do not invent GRIN numbers, do not
 * import firebase-admin, do not claim NATIVE_DEVICE.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, "../..");
const outboxDir = join(repoRoot, "src/services/grin/outbox");

function walk(current: string, out: string[] = []): string[] {
  for (const name of readdirSync(current)) {
    if (name.startsWith(".")) continue;
    const p = join(current, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const interopFiles = walk(dir).filter((p) => !p.includes(".test."));
assert.ok(interopFiles.some((p) => p.endsWith("injectedG1ServerPort.ts")));
assert.ok(existsSync(join(dir, "cs01-offline-restart-register.sqliteHost.test.ts")));

const interopForbidden = [/firebase-admin/, /formatGrinNumber/, /@google-cloud\/storage/];
for (const file of interopFiles) {
  const rel = relative(repoRoot, file);
  const src = stripComments(readFileSync(file, "utf8"));
  for (const pattern of interopForbidden) {
    assert.doesNotMatch(src, pattern, `${rel} must not match ${pattern}`);
  }
}

const outboxForbidden = [/firebase-admin/, /tools\/goods-evidence-emulator/, /formatGrinNumber/];
for (const file of walk(outboxDir).filter((p) => !p.includes(".test."))) {
  const rel = relative(repoRoot, file);
  const src = stripComments(readFileSync(file, "utf8"));
  for (const pattern of outboxForbidden) {
    assert.doesNotMatch(src, pattern, `${rel} must not match ${pattern}`);
  }
}

const cs01 = readFileSync(join(dir, "cs01-offline-restart-register.sqliteHost.test.ts"), "utf8");
assert.match(cs01, /NATIVE_DEVICE=not_claimed/);
assert.match(cs01, /SQLITE_HOST/);
assert.match(cs01, /INJECTED_PORT/);

console.log("tools/grin-interop/isolation.contract.test.ts: ok");
