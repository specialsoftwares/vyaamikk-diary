import assert from "node:assert/strict";

import { MATRIX_IDS, isMatrixId } from "./matrixIds";
import { parseMatrix } from "./parseMatrix";

const parsed = parseMatrix();
const byId = new Map(parsed.map((row) => [row.id, row]));

/**
 * Wave 1: prove the matrix ID exists. Does not execute the combined workflow.
 */
export function assertMatrixIdExists(id: string): void {
  assert.equal(isMatrixId(id), true, `${id} missing from MATRIX_IDS`);
  assert.equal(MATRIX_IDS.includes(id), true);
  const row = byId.get(id);
  assert.ok(row, `${id} missing from GRIN_ACCEPTANCE_MATRIX.md`);
  assert.equal(row.id, id);
}

export function assertWorkflowNotExecuted(id: string): void {
  const row = byId.get(id);
  assert.ok(row, `${id} missing from matrix`);
  assert.doesNotMatch(row.status, /^(complete|accepted|pass|done|approved)$/);
  assert.doesNotMatch(row.requirement, /\b(PASS|ACCEPTED|COMPLETE)\b/);
  console.log(`grin-acceptance stub ${id}: matrix id present; combined workflow not executed (${row.status})`);
}

export function assertNativeOrPlayPending(id: string, expected: "device_pending" | "play_pending"): void {
  const row = byId.get(id);
  assert.ok(row, `${id} missing from matrix`);
  assert.equal(row.status, expected);
  if (expected === "device_pending") {
    assert.ok(row.evidenceLabels.includes("NATIVE_DEVICE"));
  } else {
    assert.ok(row.evidenceLabels.includes("PLAY_INSTALLED"));
  }
  console.log(`grin-acceptance stub ${id}: ${expected}; native/Play evidence not collected`);
}
