/**
 * Deterministic aggregate test runner for CI (`npm run test:all`).
 *
 * Runs every `test:*` script from package.json sequentially in alphabetical
 * order, EXCEPT suites that need the Firestore emulator (invoked separately
 * by `ci:verify`) and aggregate entries. Exits non-zero if any suite fails.
 *
 * Zero dependencies. Never contacts production services: every included
 * suite is a plain in-process tsx script (see repo test conventions).
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));

const EXCLUDE = new Set([
  "test:all", // self
  "test:firestore-rules", // emulator suite — separate ci:verify stage
  "test:storage-rules", // storage emulator suite — separate ci:verify stage
  "test:resolve-or-create-phone-emulator", // emulator suite — separate ci:verify stage
  "test:billing-transaction-emulator", // emulator suite — separate ci:verify stage
  "test:invoice-renderer", // requires services/subscription-invoice-renderer node_modules
  "test:invoice-renderer-build", // npm ci + tsc; run by ci:verify
  "test:invoice-renderer-docker", // docker build; run by ci:verify
]);

const suites = Object.keys(pkg.scripts)
  .filter((name) => name.startsWith("test:") && !EXCLUDE.has(name))
  .sort();

const failures = [];
const startedAt = Date.now();

for (const name of suites) {
  const t0 = Date.now();
  try {
    execSync(`npm run -s ${name}`, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 300_000,
      encoding: "utf8",
    });
    console.log(`PASS ${String(Date.now() - t0).padStart(6)}ms  ${name}`);
  } catch (e) {
    failures.push(name);
    const tail = ((e.stdout || "") + "\n" + (e.stderr || ""))
      .trim()
      .split("\n")
      .slice(-15)
      .join("\n");
    console.error(`FAIL ${String(Date.now() - t0).padStart(6)}ms  ${name}\n${tail}\n`);
  }
}

const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(
  `\ntest:all — ${suites.length - failures.length}/${suites.length} passed in ${seconds}s`
);
if (failures.length > 0) {
  console.error(`FAILING SUITES: ${failures.join(", ")}`);
  process.exit(1);
}
