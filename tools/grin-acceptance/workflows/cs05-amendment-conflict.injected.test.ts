/**
 * CS-05 QA: two amendments against version 1 → version_conflict; matching digest replays.
 * INJECTED_PORT durable adapter. Not a G6 pass.
 */
import assert from "node:assert/strict";

import { GoodsEvidenceRegisterAdapter } from "../../goods-evidence-emulator/adapter";
import { createInjectedStore, seedInjectedOwner } from "../../goods-evidence-emulator/injectedStore";
import { logWorkflowExecution } from "../workflowEvidence";
import { g1FixedClock, g1MutationEnvelope, g1RegisterEnvelope } from "./g1InjectedSupport";

const OWNER = "owner_cs05";
const LEDGER = "ledger_cs05";

async function main(): Promise<void> {
  const store = createInjectedStore();
  seedInjectedOwner(store, OWNER, LEDGER);
  const adapter = new GoodsEvidenceRegisterAdapter(store, g1FixedClock());
  const registered = await adapter.register(
    { uid: OWNER },
    g1RegisterEnvelope(OWNER, LEDGER, "command_cs05_0", "receipt_cs05")
  );
  assert.equal(registered.ok, true);
  const firstEnv = g1MutationEnvelope(OWNER, LEDGER, "command_cs05_1", "amendFields", {
    receiptId: "receipt_cs05",
    expectedVersion: 1,
    reason: "first",
    changes: { remarks: { kind: "present", value: "one" } },
    clientObservedAtUtc: "2026-09-28T13:00:00.000Z",
  });
  const first = await adapter.amendFields({ uid: OWNER }, firstEnv);
  assert.equal(first.ok, true);
  const stale = await adapter.amendFields(
    { uid: OWNER },
    g1MutationEnvelope(OWNER, LEDGER, "command_cs05_2", "amendFields", {
      receiptId: "receipt_cs05",
      expectedVersion: 1,
      reason: "stale",
      changes: { remarks: { kind: "present", value: "two" } },
      clientObservedAtUtc: "2026-09-28T13:01:00.000Z",
    })
  );
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.code, "version_conflict");
  const replay = await adapter.amendFields({ uid: OWNER }, firstEnv);
  assert.equal(replay.ok, true);
  if (!replay.ok) throw new Error("replay");
  assert.equal(replay.replayed, true);
  if (first.ok) assert.equal(replay.eventId, first.eventId);
  logWorkflowExecution("CS-05", ["INJECTED_PORT"]);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
