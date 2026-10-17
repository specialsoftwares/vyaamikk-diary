/**
 * ER-5 CS-01: run Team 3's existing interop. Do not duplicate CS-01.
 * Host reopen is not NATIVE_DEVICE. runIds.ts stubs remain ID-presence only.
 */
import { spawnSync } from "node:child_process";

import { logWorkflowExecution } from "../workflowEvidence";

const result = spawnSync("npm", ["run", "test:grin-interop"], {
  stdio: "inherit",
  env: process.env,
});
if (result.status !== 0) process.exit(result.status ?? 1);
logWorkflowExecution("CS-01", ["SQLITE_HOST", "INJECTED_PORT"]);
