/**
 * INJECTED_PORT — register then mutate through GrinServerCommandPort wrapping
 * the real GoodsEvidenceRegisterAdapter. Not FAKE. Not FIRESTORE_EMULATOR.
 */
import assert from "node:assert/strict";

import { freezeCommand } from "../../src/goodsEvidence/command";
import { sampleRegisterBody } from "../../src/goodsEvidence/testFixtures";
import { GoodsEvidenceRegisterAdapter } from "./adapter";
import { fixedClock } from "./harness";
import { createInjectedStore, seedInjectedOwner } from "./injectedStore";
import { eventPath, receiptPath } from "./paths";
import { createInjectedGrinServerPort } from "./serverPort";

const NOW = Date.UTC(2026, 8, 28, 12, 0, 0, 0);
const OWNER = "owner_port";
const LEDGER = "ledger_port";
const FORGED_DIGEST = "00".repeat(32);

function registerEnvelope(commandId: string, receiptId: string) {
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
    ledgerId: frozen.ledgerId,
    body: frozen.body,
    digest: frozen.digest,
  };
}

function amendEnvelope(commandId: string, receiptId: string) {
  const frozen = freezeCommand({
    commandId,
    type: "amendFields",
    ownerUid: OWNER,
    ledgerId: LEDGER,
    body: {
      receiptId,
      expectedVersion: 1,
      reason: "correct remarks",
      changes: { remarks: { kind: "present", value: "via injected port" } },
      clientObservedAtUtc: "2026-09-28T13:00:00.000Z",
    },
  });
  return {
    commandId: frozen.commandId,
    type: frozen.type,
    ledgerId: frozen.ledgerId,
    body: frozen.body,
    digest: frozen.digest,
  };
}

async function main(): Promise<void> {
  const store = createInjectedStore();
  seedInjectedOwner(store, OWNER, LEDGER);
  const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
  const port = createInjectedGrinServerPort(adapter);

  assert.equal(port.portKind, "INJECTED");
  assert.equal(typeof port.mutate, "function");

  const registeredEnv = registerEnvelope("command_p01", "receipt_p01");
  assert.notEqual(registeredEnv.digest, FORGED_DIGEST);
  const registered = await port.register({
    uid: OWNER,
    envelope: {
      commandId: registeredEnv.commandId,
      type: "registerGoodsReceipt",
      ledgerId: registeredEnv.ledgerId,
      body: registeredEnv.body,
    },
    digest: FORGED_DIGEST,
  });
  assert.equal(registered.ok, true, "INJECTED_PORT register must use the real adapter");
  if (!registered.ok) throw new Error("expected register");
  assert.equal(registered.replayed, false);
  assert.equal(registered.receiptId, "receipt_p01");
  assert.equal(registered.issuedNumber, "GRIN/MAIN/FY2026-27/000001");
  assert.equal(store.snapshot.has(receiptPath(OWNER, LEDGER, "receipt_p01")), true);

  const registerReconcile = await port.reconcile({
    uid: OWNER,
    ledgerId: LEDGER,
    commandId: "command_p01",
  });
  assert.equal(registerReconcile.ok, true);
  if (!registerReconcile.ok) throw new Error("expected register reconcile");
  assert.equal(registerReconcile.commandType, "registerGoodsReceipt");
  assert.equal(registerReconcile.issuedNumber, registered.issuedNumber);

  const amendedEnv = amendEnvelope("command_p02", "receipt_p01");
  assert.notEqual(amendedEnv.digest, FORGED_DIGEST);
  const mutated = await port.mutate({
    uid: OWNER,
    envelope: {
      commandId: amendedEnv.commandId,
      type: "amendFields",
      ledgerId: amendedEnv.ledgerId,
      body: amendedEnv.body,
    },
    digest: FORGED_DIGEST,
  });
  assert.equal(mutated.ok, true, "INJECTED_PORT mutate must use the real adapter");
  if (!mutated.ok) throw new Error("expected mutate");
  assert.equal(mutated.replayed, false);
  assert.equal(mutated.receiptId, "receipt_p01");
  assert.equal(mutated.eventId, "id_2");
  assert.equal(store.snapshot.has(eventPath(OWNER, LEDGER, "receipt_p01", mutated.eventId)), true);

  const after = JSON.parse(store.snapshot.get(receiptPath(OWNER, LEDGER, "receipt_p01"))!) as {
    original: { remarks: { kind: string } };
    effective: { remarks: { value: string } };
  };
  assert.deepEqual(after.original.remarks, { kind: "not_supplied" });
  assert.equal(after.effective.remarks.value, "via injected port");

  const mutateReconcile = await port.reconcile({
    uid: OWNER,
    ledgerId: LEDGER,
    commandId: "command_p02",
  });
  assert.equal(mutateReconcile.ok, true);
  if (!mutateReconcile.ok) throw new Error("expected mutation reconcile");
  assert.equal(mutateReconcile.commandType, "amendFields");
  if (mutateReconcile.commandType === "amendFields") {
    assert.equal(mutateReconcile.eventId, mutated.eventId);
    assert.equal("issuedNumber" in mutateReconcile, false);
  }

  const readAfterAmend = await port.readReceipt({
    uid: OWNER,
    ledgerId: LEDGER,
    receiptId: "receipt_p01",
  });
  assert.equal(readAfterAmend.ok, true);
  if (!readAfterAmend.ok) throw new Error("expected injected port read");
  assert.equal(readAfterAmend.confirmed.eventVersion, 2);
  assert.equal(readAfterAmend.confirmed.headHash, mutated.headHash);
  assert.equal(readAfterAmend.confirmed.events.length, 2);
  assert.deepEqual(readAfterAmend.confirmed.original.remarks, { kind: "not_supplied" });
  assert.equal(readAfterAmend.confirmed.effective.remarks.kind, "present");
  if (readAfterAmend.confirmed.effective.remarks.kind === "present") {
    assert.equal(readAfterAmend.confirmed.effective.remarks.value, "via injected port");
  }

  console.log("tools/goods-evidence-emulator/serverPort.injected.unit.test.ts: ok (INJECTED_PORT)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
