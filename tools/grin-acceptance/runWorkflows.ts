/**
 * Team 5 Wave 2 ER-4 / ER-5 workflow runner.
 * Not `runIds.ts` (ID-presence only). Greens here are not G6 / not matrix "pass".
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

const files = [
  "startup/v9-v10-grin-off.sqliteHost.test.ts",
  "workflows/cs01-run-team3-interop.ts",
  "workflows/cs02-upload-link.injected.test.ts",
  "workflows/cs03-account-change.sqliteHost.test.ts",
  "workflows/cs04-concurrent-serials.injected.test.ts",
  "workflows/cs05-amendment-conflict.injected.test.ts",
  "workflows/cs06-partial-return.injected.test.ts",
  "workflows/cs07-tampered-evidence-pack.test.ts",
  "workflows/cs08-ewb-cancellation.test.ts",
  "workflows/cs09-missing-2b-supplier.test.ts",
  "workflows/cs10-replay-after-commit.injected.test.ts",
  "workflows/cs11-existing-product.test.ts",
];

if (process.env.FIRESTORE_EMULATOR_HOST) {
  files.push("workflows/cs04-concurrent-serials.emulator.test.ts");
} else {
  console.log("CS-04 FIRESTORE_EMULATOR not run (FIRESTORE_EMULATOR_HOST unset)");
}

for (const rel of files) {
  const r = spawnSync("npx", ["--yes", "tsx", join(root, rel)], {
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log(
  "grin-acceptance runWorkflows: ER-4 + CS slices above; not G6; not NATIVE_DEVICE; runIds.ts remains ID-presence only"
);
