/**
 * Regression: Expo Metro only inlines static `process.env.EXPO_PUBLIC_*`
 * dot access. Dynamic `process.env[key]` shipped empty in preview APK
 * 8e01d0f5 and tripped assertProductionConfig → "keeps stopping".
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const envSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "env.ts"),
  "utf8"
);

assert.match(
  envSource,
  /process\.env\.EXPO_PUBLIC_FIREBASE_API_KEY/,
  "Firebase API key must use static process.env.EXPO_PUBLIC_FIREBASE_API_KEY"
);
assert.match(
  envSource,
  /process\.env\.EXPO_PUBLIC_APP_MODE/,
  "APP_MODE must use static process.env.EXPO_PUBLIC_APP_MODE"
);
assert.doesNotMatch(
  envSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""),
  /process\.env\s*\[/,
  "env.ts must not use dynamic process.env bracket access (breaks Metro inlining)"
);

console.log("env.staticInline.test.ts: ok");
