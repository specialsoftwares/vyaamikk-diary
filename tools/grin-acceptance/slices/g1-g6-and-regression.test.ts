import { MATRIX_IDS } from "../matrixIds";
import { assertMatrixIdExists, assertWorkflowNotExecuted } from "../workflowStub";

const sliceIds = MATRIX_IDS.filter((id) => /^G[1-6]-R\d{2}$/.test(id) || /^REG-\d{2}$/.test(id));
for (const id of sliceIds) {
  assertMatrixIdExists(id);
  assertWorkflowNotExecuted(id);
}
