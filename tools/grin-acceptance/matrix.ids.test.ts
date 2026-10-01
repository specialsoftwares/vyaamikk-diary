import assert from "node:assert/strict";

import {
  COMBINED_SCENARIO_IDS,
  DEVICE_PENDING_IDS,
  EVIDENCE_LABELS,
  MATRIX_IDS,
  PLAY_PENDING_IDS,
  SECURITY_IDS,
} from "./matrixIds";
import { parseMatrix } from "./parseMatrix";

const rows = parseMatrix();
const ids = rows.map((row) => row.id).sort();
const expected = [...MATRIX_IDS].sort();

assert.deepEqual(ids, expected, "matrix table IDs must match MATRIX_IDS");

assert.equal(rows.length, MATRIX_IDS.length);
assert.equal(new Set(ids).size, MATRIX_IDS.length);

for (const id of COMBINED_SCENARIO_IDS) {
  assert.ok(rows.some((row) => row.id === id), `${id} missing`);
}
for (const id of SECURITY_IDS) {
  assert.ok(rows.some((row) => row.id === id), `${id} missing`);
}

for (const row of rows) {
  assert.doesNotMatch(row.status, /^(complete|accepted|pass|done|approved)$/, row.id);
  for (const label of row.evidenceLabels) {
    assert.ok((EVIDENCE_LABELS as readonly string[]).includes(label), `${row.id} ${label}`);
  }
  if (row.evidenceLabels.includes("NATIVE_DEVICE")) {
    assert.equal(row.status, "device_pending", `${row.id} NATIVE_DEVICE must be device_pending`);
    assert.deepEqual(row.evidenceLabels, ["NATIVE_DEVICE"], `${row.id} NATIVE_DEVICE must be a pending-only row`);
  }
  if (row.evidenceLabels.includes("PLAY_INSTALLED")) {
    assert.equal(row.status, "play_pending", `${row.id} PLAY_INSTALLED must be play_pending`);
    assert.deepEqual(row.evidenceLabels, ["PLAY_INSTALLED"], `${row.id} PLAY_INSTALLED must be a pending-only row`);
  }
}

for (const id of DEVICE_PENDING_IDS) {
  const row = rows.find((item) => item.id === id);
  assert.ok(row, id);
  assert.equal(row.status, "device_pending");
  assert.deepEqual(row.evidenceLabels, ["NATIVE_DEVICE"]);
}
for (const id of PLAY_PENDING_IDS) {
  const row = rows.find((item) => item.id === id);
  assert.ok(row, id);
  assert.equal(row.status, "play_pending");
  assert.deepEqual(row.evidenceLabels, ["PLAY_INSTALLED"]);
}

const g6 = rows.filter((row) => row.id.startsWith("G6-R"));
const forbiddenG6 = ["complete", "accepted", "pass", "done", "approved"];
assert.ok(g6.every((row) => !forbiddenG6.includes(row.status)));

console.log(`grin-acceptance/matrix.ids.test.ts: ${rows.length} ids present; combined workflows not executed`);
