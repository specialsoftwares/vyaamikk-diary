import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEVICE_PENDING_IDS, PLAY_PENDING_IDS } from "../matrixIds";
import { assertMatrixIdExists, assertNativeOrPlayPending } from "../workflowStub";
import { WAVE1_PENDING_ENVELOPE } from "./expectedEvidence";

for (const id of DEVICE_PENDING_IDS) {
  assertMatrixIdExists(id);
  assertNativeOrPlayPending(id, "device_pending");
}
for (const id of PLAY_PENDING_IDS) {
  assertMatrixIdExists(id);
  assertNativeOrPlayPending(id, "play_pending");
}

assert.equal(WAVE1_PENDING_ENVELOPE.executed, false);
assert.equal(WAVE1_PENDING_ENVELOPE.status, "device_pending");
assert.equal(WAVE1_PENDING_ENVELOPE.contractRevision, "2026-10-01.wave1");

const envelope = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "wave1-pending-envelope.json"), "utf8")
) as { executed: boolean; status: string };
assert.equal(envelope.executed, false);
assert.equal(envelope.status, "device_pending");
