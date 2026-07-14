/**
 * Verifies shell-provided EXPO_PUBLIC_* values override `.env` for Metro.
 * Uses the same @expo/env loader Metro invokes. Never logs secret values.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

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

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("env:"))
    .at(-1) ?? "";
}

function main() {
  const fromDotenv = readAppModeAfterExpoEnvLoad();
  assert.equal(fromDotenv, "development", "expected development from local .env");

  const fromShell = readAppModeAfterExpoEnvLoad("production");
  assert.equal(fromShell, "production", "shell EXPO_PUBLIC_APP_MODE must override .env");

  console.log("test-env-shell-precedence.ts: ok (shell overrides .env)");
}

main();
