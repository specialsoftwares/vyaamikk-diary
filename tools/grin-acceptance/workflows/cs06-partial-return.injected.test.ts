/**
 * CS-06 QA: dispatchReturn conserves physicalReceived; issued original snapshot unchanged.
 * INJECTED_PORT. Not a G6 pass.
 */
import assert from "node:assert/strict";

import { GoodsEvidenceRegisterAdapter } from "../../goods-evidence-emulator/adapter";
import { createInjectedStore, seedInjectedOwner } from "../../goods-evidence-emulator/injectedStore";
import { receiptPath } from "../../goods-evidence-emulator/paths";
import { logWorkflowExecution } from "../workflowEvidence";
import { g1FixedClock, g1MutationEnvelope, g1RegisterEnvelope } from "./g1InjectedSupport";

const OWNER = "owner_cs06";
const LEDGER = "ledger_cs06";

async function main(): Promise<void> {
  const store = createInjectedStore();
  seedInjectedOwner(store, OWNER, LEDGER);
  const adapter = new GoodsEvidenceRegisterAdapter(store, g1FixedClock());
  const registered = await adapter.register(
    { uid: OWNER },
    g1RegisterEnvelope(OWNER, LEDGER, "command_cs06_0", "receipt_cs06")
  );
  assert.equal(registered.ok, true);
  const before = JSON.parse(store.snapshot.get(receiptPath(OWNER, LEDGER, "receipt_cs06"))!);
  const originalBefore = JSON.parse(JSON.stringify(before.original));
  const dispatched = await adapter.dispatchReturn(
    { uid: OWNER },
    g1MutationEnvelope(OWNER, LEDGER, "command_cs06_1", "dispatchReturn", {
      receiptId: "receipt_cs06",
      expectedVersion: 1,
      reason: "QC fail",
      lineId: "line_1",
      returnQty: { value: "5", unit: "bags", precision: 0 },
      clientObservedAtUtc: "2026-09-28T14:00:00.000Z",
    })
  );
  assert.equal(dispatched.ok, true);
  const after = JSON.parse(store.snapshot.get(receiptPath(OWNER, LEDGER, "receipt_cs06"))!);
  assert.deepEqual(after.original, originalBefore);
  assert.equal(after.lineLedgers.line_1.physicalReceived.value, "40");
  assert.equal(after.lineLedgers.line_1.dispatchedReturn.value, "5");
  logWorkflowExecution("CS-06", ["INJECTED_PORT"]);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
