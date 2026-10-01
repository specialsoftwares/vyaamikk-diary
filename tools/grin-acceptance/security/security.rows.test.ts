import { SECURITY_IDS } from "../matrixIds";
import { assertMatrixIdExists, assertWorkflowNotExecuted } from "../workflowStub";

for (const id of SECURITY_IDS) {
  assertMatrixIdExists(id);
  assertWorkflowNotExecuted(id);
}
