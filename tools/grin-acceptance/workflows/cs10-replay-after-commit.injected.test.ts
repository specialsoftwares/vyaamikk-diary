/**
 * CS-10 QA: register commits, reconcile/replay returns the same issued number with replayed true.
 * INJECTED_PORT. Functions remain unexported.
 */
import assert from "node:assert/strict";

import { GoodsEvidenceRegisterAdapter } from "../../goods-evidence-emulator/adapter";
import { createInjectedStore, seedInjectedOwner } from "../../goods-evidence-emulator/injectedStore";
import { serialPath } from "../../goods-evidence-emulator/paths";
import { logWorkflowExecution } from "../workflowEvidence";
import { g1FixedClock, g1RegisterEnvelope } from "./g1InjectedSupport";

const OWNER = "owner_cs10";
const LEDGER = "ledger_cs10";

async function main(): Promise<void> {
  const store = createInjectedStore();
  seedInjectedOwner(store, OWNER, LEDGER);
  const adapter = new GoodsEvidenceRegisterAdapter(store, g1FixedClock());
  const env = g1RegisterEnvelope(OWNER, LEDGER, "command_cs10", "receipt_cs10");
  const first = await adapter.register({ uid: OWNER }, env);
  assert.equal(first.ok, true);
  if (!first.ok) throw new Error("register");
  assert.equal(first.replayed, false);
  const serialAfter = JSON.parse(store.snapshot.get(serialPath(OWNER, LEDGER, "FY2026-27"))!);
  const replay = await adapter.register({ uid: OWNER }, env);
  assert.equal(replay.ok, true);
  if (!replay.ok) throw new Error("replay register");
  assert.equal(replay.replayed, true);
  assert.equal(replay.issuedNumber, first.issuedNumber);
  const rec = await adapter.reconcile(
    { uid: OWNER },
    { ledgerId: LEDGER, commandId: "command_cs10" }
  );
  assert.equal(rec.ok, true);
  if (!rec.ok) throw new Error("reconcile");
  assert.equal(rec.replayed, true);
  if ("issuedNumber" in rec) {
    assert.equal(rec.issuedNumber, first.issuedNumber);
  }
  const serialReplay = JSON.parse(store.snapshot.get(serialPath(OWNER, LEDGER, "FY2026-27"))!);
  assert.equal(serialReplay.lastIssuedSerial, serialAfter.lastIssuedSerial);
  logWorkflowExecution("CS-10", ["INJECTED_PORT"]);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
