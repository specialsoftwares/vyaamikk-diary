/**
 * CS-11 QA slice: goodsEvidence isolation still forbids diary/billing/PDF/localDb.
 * Does not re-run REG-* product suites. Diary-row preservation is ER-4 SQLITE_HOST.
 */
import "../../../src/goodsEvidence/isolation.contract.test.ts";

import { logWorkflowExecution } from "../workflowEvidence";

logWorkflowExecution("CS-11", ["PURE_DOMAIN"]);
