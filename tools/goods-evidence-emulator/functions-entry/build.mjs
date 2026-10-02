/**
 * Bundle the isolated Functions-emulator entry (not functions/src/index.ts).
 */
import { mkdirSync, existsSync, symlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../../..");
mkdirSync(join(here, "lib"), { recursive: true });

const entryNm = join(here, "node_modules");
const functionsNm = join(repo, "functions/node_modules");
if (!existsSync(entryNm) && existsSync(functionsNm)) {
  symlinkSync(functionsNm, entryNm, "dir");
}

const result = spawnSync(
  "npx",
  [
    "--yes",
    "esbuild",
    join(here, "handlers.ts"),
    "--bundle",
    "--platform=node",
    "--format=cjs",
    "--packages=external",
    `--outfile=${join(here, "lib/index.js")}`,
    `--alias:@/utils/sha256Hex=${join(repo, "src/utils/sha256Hex.ts")}`,
  ],
  { stdio: "inherit", cwd: repo }
);

process.exit(result.status ?? 1);
