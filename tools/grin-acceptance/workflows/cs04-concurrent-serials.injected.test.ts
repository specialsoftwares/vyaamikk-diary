/**
 * CS-04 QA on INJECTED_PORT: distinct receipts get unique serials; identical
 * commandId collapses to one issue + replay. True concurrent barriers need
 * FIRESTORE_EMULATOR (see cs04-concurrent-serials.emulator.test.ts).
 */
import assert from "node:assert/strict";

import { freezeCommand } from "@/goodsEvidence/command";
import { sampleRegisterBody } from "@/goodsEvidence/testFixtures";

import { GoodsEvidenceRegisterAdapter } from "../../goods-evidence-emulator/adapter";
import { createInjectedStore, seedInjectedOwner } from "../../goods-evidence-emulator/injectedStore";
import { serialPath } from "../../goods-evidence-emulator/paths";
import { logWorkflowExecution } from "../workflowEvidence";

const NOW = Date.UTC(2026, 8, 28, 12, 0, 0, 0);

function fixedClock(utcMs: number) {
  const clock = { seq: 0, nowMs: () => utcMs, uuid: () => `id_${++clock.seq}` };
  return clock;
}
const OWNER = "owner_cs04";
const LEDGER = "ledger_cs04";

function envelope(commandId: string, receiptId: string) {
  const frozen = freezeCommand({
    commandId,
    type: "registerGoodsReceipt",
    ownerUid: OWNER,
    ledgerId: LEDGER,
    body: sampleRegisterBody({ receiptId }),
  });
  return {
    commandId: frozen.commandId,
    type: frozen.type,
    ownerUid: frozen.ownerUid,
    ledgerId: frozen.ledgerId,
    body: frozen.body,
    digest: frozen.digest,
  };
}

async function main(): Promise<void> {
  const store = createInjectedStore();
  seedInjectedOwner(store, OWNER, LEDGER);
  const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
  const a = await adapter.register({ uid: OWNER }, envelope("command_cs04a", "receipt_cs04a"));
  const b = await adapter.register({ uid: OWNER }, envelope("command_cs04b", "receipt_cs04b"));
  assert.equal(a.ok && b.ok, true);
  if (!a.ok || !b.ok) throw new Error("expected two serials");
  const issued = [a.issuedNumber, b.issuedNumber].sort();
  assert.deepEqual(issued, ["GRIN/MAIN/FY2026-27/000001", "GRIN/MAIN/FY2026-27/000002"]);
  assert.equal(a.replayed || b.replayed, false);
  const replay = await adapter.register({ uid: OWNER }, envelope("command_cs04a", "receipt_cs04a"));
  assert.equal(replay.ok, true);
  if (!replay.ok) throw new Error("replay");
  assert.equal(replay.replayed, true);
  assert.equal(replay.issuedNumber, a.ok ? a.issuedNumber : null);
  const serial = JSON.parse(store.snapshot.get(serialPath(OWNER, LEDGER, "FY2026-27"))!);
  assert.equal(serial.lastIssuedSerial, 2);
  logWorkflowExecution("CS-04", ["INJECTED_PORT"]);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
