/**
 * Static scan: required EXPO_PUBLIC_* must never use dynamic process.env access
 * in client startup/config modules.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_STATIC = [
  "EXPO_PUBLIC_FIREBASE_API_KEY",
  "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "EXPO_PUBLIC_FIREBASE_APP_ID",
  "EXPO_PUBLIC_APP_MODE",
] as const;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const clientDirs = [
  join(root, "config"),
  join(root, "startup"),
  join(root, "services", "auth"),
].filter(Boolean);

const files = clientDirs.flatMap((d) => walk(d));
assert.ok(files.length > 10, "expected client source files");

for (const file of files) {
  const code = stripComments(readFileSync(file, "utf8"));
  assert.doesNotMatch(
    code,
    /process\.env\s*\[/,
    `dynamic process.env access forbidden in ${file}`
  );
  assert.doesNotMatch(
    code,
    /const\s*\{[^}]*EXPO_PUBLIC_[^}]*\}\s*=\s*process\.env/,
    `destructuring process.env EXPO_PUBLIC_* forbidden in ${file}`
  );
}

const envSrc = readFileSync(join(root, "config", "env.ts"), "utf8");
for (const key of REQUIRED_STATIC) {
  assert.match(
    envSrc,
    new RegExp(`process\\.env\\.${key}`),
    `env.ts must statically reference process.env.${key}`
  );
}

const diagSrc = readFileSync(join(root, "startup", "diagnostics.ts"), "utf8");
assert.match(diagSrc, /process\.env\.EXPO_PUBLIC_FIREBASE_API_KEY/);

console.log("startup.envAccess.static.test.ts: ok");
