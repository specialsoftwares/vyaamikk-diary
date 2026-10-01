import assert from "node:assert/strict";

import { EVIDENCE_LABELS, type EvidenceLabel } from "./matrixIds";
import { parseMatrix } from "./parseMatrix";

const byId = new Map(parseMatrix().map((row) => [row.id, row]));

/** Honest workflow log. Never a matrix status of complete/accepted/pass/done/approved. */
export function logWorkflowExecution(id: string, labels: EvidenceLabel[]): void {
  const row = byId.get(id);
  assert.ok(row, `${id} missing from GRIN_ACCEPTANCE_MATRIX.md`);
  assert.doesNotMatch(row.status, /^(complete|accepted|pass|done|approved)$/, `${id} forbidden status`);
  for (const label of labels) {
    assert.ok((EVIDENCE_LABELS as readonly string[]).includes(label), `${id} ${label}`);
  }
  console.log(
    `grin-acceptance workflow ${id}: EXECUTED labels=${labels.join("+")}; matrix status remains ${row.status} (not a pass)`
  );
}

export function logWorkflowNotExecuted(id: string, reason: string): void {
  const row = byId.get(id);
  assert.ok(row, `${id} missing from GRIN_ACCEPTANCE_MATRIX.md`);
  assert.doesNotMatch(row.status, /^(complete|accepted|pass|done|approved)$/, `${id} forbidden status`);
  console.log(`grin-acceptance workflow ${id}: NOT EXECUTED (${reason}); status=${row.status}`);
}
