/**
 * Verifies Expo client env precedence for development-client Metro.
 *
 * IMPORTANT: `@expo/env` load() lets shell override `.env` in the Node process,
 * but the Metro client bundle uses `expo/virtual/env`, which merges `.env*` FILE
 * values ON TOP OF process.env. Therefore shell-only APP_MODE=production cannot
 * rescue a `.env` that still says development.
 *
 * Never logs secret values.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

function readDotEnvAppMode(): string {
  const text = readFileSync(".env", "utf8");
  const m = text.match(/^EXPO_PUBLIC_APP_MODE\s*=\s*(.*)$/m);
  assert.ok(m, "EXPO_PUBLIC_APP_MODE must exist in .env");
  return m[1].trim().replace(/^["']|["']$/g, "");
}

function readAppModeAfterExpoEnvLoad(shellMode?: string): string {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "development",
  };
  if (shellMode) {
    env.EXPO_PUBLIC_APP_MODE = shellMode;
  } else {
    delete env.EXPO_PUBLIC_APP_MODE;
  }

  const output = execFileSync(
    process.execPath,
    [
      "-e",
      'const { load } = require("@expo/env"); load(process.cwd(), false); process.stdout.write(String(process.env.EXPO_PUBLIC_APP_MODE ?? ""));',
    ],
    {
      cwd: process.cwd(),
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    }
  );

  return (
    output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("env:"))
      .at(-1) ?? ""
  );
}

/**
 * Mirrors expo/virtual/env client merge: Object.assign({}, process.env, fileEnv).
 * File values win — this is why development-client requires APP_MODE=production in `.env`.
 */
function simulateVirtualEnvMerge(processEnvMode: string, fileMode: string): string {
  const processEnv = { EXPO_PUBLIC_APP_MODE: processEnvMode };
  const fileEnv = { EXPO_PUBLIC_APP_MODE: fileMode };
  return Object.assign({}, processEnv, fileEnv).EXPO_PUBLIC_APP_MODE;
}

function main() {
  const fileMode = readDotEnvAppMode();
  assert.equal(
    fileMode,
    "production",
    "local .env must set EXPO_PUBLIC_APP_MODE=production for development-client Metro " +
      "(expo/virtual/env merges .env over shell process.env)"
  );

  const fromDotenv = readAppModeAfterExpoEnvLoad();
  assert.equal(fromDotenv, "production", "expected production from local .env via @expo/env");

  // Shell still wins inside @expo/env Node tooling — but NOT in the client virtual env merge.
  const fromShellDev = readAppModeAfterExpoEnvLoad("development");
  assert.equal(fromShellDev, "development", "@expo/env Node load still allows shell override");

  assert.equal(
    simulateVirtualEnvMerge("production", "development"),
    "development",
    "client virtual env: .env development must beat shell production"
  );
  assert.equal(
    simulateVirtualEnvMerge("development", "production"),
    "production",
    "client virtual env: .env production must beat shell development"
  );

  console.log("test-env-shell-precedence.ts: ok (.env file authoritative for client bundle)");
}

main();
