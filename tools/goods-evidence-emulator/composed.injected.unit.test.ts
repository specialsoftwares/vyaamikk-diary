/**
 * INJECTED composition — authenticated callables + GoodsEvidenceRegisterAdapter.
 * Not FIRESTORE_EMULATOR. Not live deploy. Adapter is not wired into the app.
 */
import assert from "node:assert/strict";

import { createComposedGrinCallables } from "../../functions/src/goodsEvidence/composed";
import { freezeCommand } from "../../src/goodsEvidence/command";
import { sampleRegisterBody } from "../../src/goodsEvidence/testFixtures";
import { GoodsEvidenceRegisterAdapter } from "./adapter";
import { fixedClock } from "./harness";
import { createInjectedStore, seedInjectedOwner } from "./injectedStore";
import { eventPath, receiptPath } from "./paths";

const NOW = Date.UTC(2026, 8, 28, 12, 0, 0, 0);
const OWNER = "owner_composed";
const ATTACKER = "attacker_uid";
const LEDGER = "ledger_composed";
const FORGED_DIGEST = "00".repeat(32);
const ENABLED = { GRIN_GOODS_EVIDENCE_FUNCTIONS: "true" } as NodeJS.ProcessEnv;

function registerPayload(commandId: string, receiptId: string, ownerUid = OWNER) {
  const frozen = freezeCommand({
    commandId,
    type: "registerGoodsReceipt",
    ownerUid,
    ledgerId: LEDGER,
    body: sampleRegisterBody({ receiptId }),
  });
  return {
    envelope: {
      commandId: frozen.commandId,
      type: frozen.type,
      ledgerId: frozen.ledgerId,
      body: frozen.body,
      ownerUid: frozen.ownerUid,
    },
    digest: frozen.digest,
    uid: ownerUid,
  };
}

function amendPayload(commandId: string, receiptId: string) {
  const frozen = freezeCommand({
    commandId,
    type: "amendFields",
    ownerUid: OWNER,
    ledgerId: LEDGER,
    body: {
      receiptId,
      expectedVersion: 1,
      reason: "correct remarks",
      changes: { remarks: { kind: "present", value: "composed amend" } },
      clientObservedAtUtc: "2026-09-28T13:00:00.000Z",
    },
  });
  return {
    envelope: {
      commandId: frozen.commandId,
      type: frozen.type,
      ledgerId: frozen.ledgerId,
      body: frozen.body,
    },
    digest: frozen.digest,
    uid: ATTACKER,
  };
}

async function main(): Promise<void> {
  const store = createInjectedStore();
  seedInjectedOwner(store, OWNER, LEDGER);
  const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
  const callables = createComposedGrinCallables({ adapter, env: ENABLED });

  assert.equal(callables.compositionKind, "UNDEPLOYED_COMPOSED");
  assert.match(callables.compositionLabel, /INJECTED/);
  assert.match(callables.compositionLabel, /not live deploy/);

  const closed = createComposedGrinCallables({
    adapter,
    env: { GRIN_GOODS_EVIDENCE_FUNCTIONS: "1" },
  });
  const envDenied = await closed.register({
    auth: { uid: OWNER },
    data: registerPayload("command_off", "receipt_off"),
  });
  assert.equal(envDenied.ok, false);
  if (envDenied.ok) throw new Error("expected env deny");
  assert.equal(envDenied.code, "policy_denied");

  const unauth = await callables.register({
    auth: null,
    data: registerPayload("command_unauth", "receipt_unauth"),
  });
  assert.equal(unauth.ok, false);
  if (unauth.ok) throw new Error("expected unauth");
  assert.equal(unauth.code, "unauthenticated");

  const emptyAuth = await callables.register({
    auth: { uid: "" },
    data: registerPayload("command_empty", "receipt_empty"),
  });
  assert.equal(emptyAuth.ok, false);
  if (emptyAuth.ok) throw new Error("expected empty auth deny");
  assert.equal(emptyAuth.code, "unauthenticated");

  const clientUidPayload = registerPayload("command_c01", "receipt_c01", ATTACKER);
  clientUidPayload.digest = FORGED_DIGEST;
  const registered = await callables.register({
    auth: { uid: OWNER },
    data: clientUidPayload,
  });
  assert.equal(registered.ok, true, "authenticated uid must win over client uid/digest");
  if (!registered.ok) throw new Error("expected register");
  assert.equal(registered.replayed, false);
  assert.equal(registered.receiptId, "receipt_c01");
  assert.equal(registered.issuedNumber, "GRIN/MAIN/FY2026-27/000001");
  assert.equal(registered.serial, 1);
  assert.equal(store.snapshot.has(receiptPath(OWNER, LEDGER, "receipt_c01")), true);
  assert.equal(store.snapshot.has(receiptPath(ATTACKER, LEDGER, "receipt_c01")), false);

  assert.equal("confirmed" in registered, true, "register SUCCESS may attach confirmed");
  if (!("confirmed" in registered) || !registered.ok) throw new Error("expected register confirmed");
  const registeredConfirmed = registered.confirmed;
  assert.equal(registeredConfirmed.receiptId, "receipt_c01");
  assert.equal(registeredConfirmed.eventVersion, registered.eventVersion);
  assert.equal(registeredConfirmed.headHash, registered.headHash);
  assert.equal(registeredConfirmed.events.length, 1);
  assert.equal(registeredConfirmed.events[0]?.type, "receipt_registered");
  assert.deepEqual(registeredConfirmed.original.remarks, { kind: "not_supplied" });
  assert.equal(registeredConfirmed.effective.remarks.kind, "not_supplied");
  assert.equal(registeredConfirmed.original.originalSnapshotHash, registeredConfirmed.effective.originalSnapshotHash);

  const afterRegisterRead = await callables.readReceipt({
    auth: { uid: OWNER },
    data: { ledgerId: LEDGER, receiptId: "receipt_c01", uid: ATTACKER },
  });
  assert.equal(afterRegisterRead.ok, true);
  if (!afterRegisterRead.ok) throw new Error("expected read after register");
  assert.equal(afterRegisterRead.confirmed.eventVersion, 1);
  assert.equal(afterRegisterRead.confirmed.headHash, registered.headHash);
  assert.equal(afterRegisterRead.confirmed.events.length, 1);
  assert.deepEqual(afterRegisterRead.confirmed.original.remarks, { kind: "not_supplied" });
  assert.equal(afterRegisterRead.confirmed.effective.remarks.kind, "not_supplied");

  const replayed = await callables.register({
    auth: { uid: OWNER },
    data: registerPayload("command_c01", "receipt_c01"),
  });
  assert.equal(replayed.ok, true);
  if (!replayed.ok) throw new Error("expected replay");
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.issuedNumber, registered.issuedNumber);

  const conflict = await callables.register({
    auth: { uid: OWNER },
    data: registerPayload("command_c01", "receipt_c01_changed"),
  });
  assert.equal(conflict.ok, false);
  if (conflict.ok) throw new Error("expected digest_conflict");
  assert.equal(conflict.code, "digest_conflict");

  const registerReconcile = await callables.reconcile({
    auth: { uid: OWNER },
    data: { ledgerId: LEDGER, commandId: "command_c01", uid: ATTACKER },
  });
  assert.equal(registerReconcile.ok, true);
  if (!registerReconcile.ok) throw new Error("expected register reconcile");
  assert.equal(registerReconcile.commandType, "registerGoodsReceipt");
  assert.equal(registerReconcile.issuedNumber, registered.issuedNumber);

  const mutated = await callables.mutate({
    auth: { uid: OWNER },
    data: amendPayload("command_c02", "receipt_c01"),
  });
  assert.equal(mutated.ok, true, "INJECTED composed mutate must use the adapter");
  if (!mutated.ok) throw new Error("expected mutate");
  assert.equal(mutated.replayed, false);
  assert.equal(mutated.receiptId, "receipt_c01");
  assert.equal(store.snapshot.has(eventPath(OWNER, LEDGER, "receipt_c01", mutated.eventId)), true);

  const after = JSON.parse(store.snapshot.get(receiptPath(OWNER, LEDGER, "receipt_c01"))!) as {
    original: { remarks: { kind: string } };
    effective: { remarks: { value: string } };
  };
  assert.deepEqual(after.original.remarks, { kind: "not_supplied" });
  assert.equal(after.effective.remarks.value, "composed amend");

  const mutateReconcile = await callables.reconcile({
    auth: { uid: OWNER },
    data: { ledgerId: LEDGER, commandId: "command_c02" },
  });
  assert.equal(mutateReconcile.ok, true);
  if (!mutateReconcile.ok) throw new Error("expected mutation reconcile");
  assert.equal(mutateReconcile.commandType, "amendFields");
  if (mutateReconcile.commandType === "amendFields") {
    assert.equal(mutateReconcile.eventId, mutated.eventId);
    assert.equal("issuedNumber" in mutateReconcile, false);
  }

  assert.equal("confirmed" in mutated, true, "mutate SUCCESS may attach confirmed");
  if (!("confirmed" in mutated) || !mutated.ok) throw new Error("expected mutate confirmed");
  assert.equal(mutated.confirmed.eventVersion, mutated.eventVersion);
  assert.equal(mutated.confirmed.headHash, mutated.headHash);
  assert.equal(mutated.confirmed.events.length, 2);
  assert.equal(mutated.confirmed.events[1]?.type, "field_amended");
  assert.deepEqual(mutated.confirmed.original.remarks, { kind: "not_supplied" });
  assert.equal(mutated.confirmed.effective.remarks.kind, "present");
  if (mutated.confirmed.effective.remarks.kind === "present") {
    assert.equal(mutated.confirmed.effective.remarks.value, "composed amend");
  }
  assert.equal(
    mutated.confirmed.original.originalSnapshotHash,
    afterRegisterRead.confirmed.original.originalSnapshotHash,
    "original snapshot/hash must not change on amend"
  );

  const afterAmendRead = await callables.readReceipt({
    auth: { uid: OWNER },
    data: { ledgerId: LEDGER, receiptId: "receipt_c01" },
  });
  assert.equal(afterAmendRead.ok, true);
  if (!afterAmendRead.ok) throw new Error("expected read after amend");
  assert.equal(afterAmendRead.confirmed.eventVersion, 2);
  assert.equal(afterAmendRead.confirmed.headHash, mutated.headHash);
  assert.equal(afterAmendRead.confirmed.events.length, 2);
  assert.deepEqual(afterAmendRead.confirmed.original.remarks, { kind: "not_supplied" });
  assert.equal(afterAmendRead.confirmed.effective.remarks.kind, "present");
  if (afterAmendRead.confirmed.effective.remarks.kind === "present") {
    assert.equal(afterAmendRead.confirmed.effective.remarks.value, "composed amend");
  }

  const foreignRead = await callables.readReceipt({
    auth: { uid: ATTACKER },
    data: { ledgerId: LEDGER, receiptId: "receipt_c01" },
  });
  assert.equal(foreignRead.ok, false);
  if (foreignRead.ok) throw new Error("expected foreign read deny");
  assert.equal(foreignRead.code, "forbidden");

  const missingRead = await callables.readReceipt({
    auth: { uid: OWNER },
    data: { ledgerId: LEDGER, receiptId: "receipt_missing" },
  });
  assert.equal(missingRead.ok, false);
  if (missingRead.ok) throw new Error("expected missing read not_found");
  assert.equal(missingRead.code, "not_found");

  const unbound = createComposedGrinCallables({
    adapter: null,
    env: ENABLED,
  });
  const unboundDenied = await unbound.readReceipt({
    auth: { uid: OWNER },
    data: { ledgerId: LEDGER, receiptId: "receipt_c01" },
  });
  assert.equal(unboundDenied.ok, false);
  if (unboundDenied.ok) throw new Error("expected unbound adapter deny");
  assert.equal(unboundDenied.code, "policy_denied");

  const zeroVersion = freezeCommand({
    commandId: "command_c03",
    type: "amendFields",
    ownerUid: OWNER,
    ledgerId: LEDGER,
    body: {
      receiptId: "receipt_c01",
      expectedVersion: 0,
      reason: "must not coerce zero",
      changes: { remarks: { kind: "present", value: "coerced" } },
      clientObservedAtUtc: "2026-09-28T14:00:00.000Z",
    },
  });
  const coerced = await callables.mutate({
    auth: { uid: OWNER },
    data: {
      envelope: {
        commandId: zeroVersion.commandId,
        type: zeroVersion.type,
        ledgerId: zeroVersion.ledgerId,
        body: zeroVersion.body,
      },
      digest: zeroVersion.digest,
    },
  });
  assert.equal(coerced.ok, false, "expectedVersion 0 must not be coerced to 1");
  if (coerced.ok) throw new Error("expected version 0 deny");
  assert.equal(coerced.code, "invalid");

  console.log("tools/goods-evidence-emulator/composed.injected.unit.test.ts: ok (INJECTED / not live deploy)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
