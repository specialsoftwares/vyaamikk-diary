/**
 * Restricted-pilot smoke — INJECTED (synthetic).
 * Label: INJECTED. Not EMULATOR. Not LIVE_BACKEND. Not a live deploy.
 * Synthetic owner/other/denied ids only. Do not invent production UIDs.
 * OTHER is INJECTED-only. Live cross_owner_denial requires a second
 * authenticated account (T1/T2 unnamed — LIVE HOLD).
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { createComposedGrinCallables } from "../../../../functions/src/goodsEvidence/composed";
import { assembleEvidencePackInputs } from "../../../../src/goodsEvidence/evidencePackInputs";
import { freezeCommand } from "../../../../src/goodsEvidence/command";
import { sampleRegisterBody } from "../../../../src/goodsEvidence/testFixtures";
import { GoodsEvidenceRegisterAdapter } from "../../../../tools/goods-evidence-emulator/adapter";
import { fixedClock } from "../../../../tools/goods-evidence-emulator/harness";
import {
  createInjectedStore,
  seedInjectedOwner,
} from "../../../../tools/goods-evidence-emulator/injectedStore";
import { GoodsEvidenceStorageAdapter } from "../../../../tools/goods-evidence-storage/adapter";
import {
  FAKE_createInjectedFirestore,
  FAKE_seedOwner,
} from "../../../../tools/goods-evidence-storage/FAKE_injectedFirestore";
import { FAKE_MemoryBlobStore } from "../../../../tools/goods-evidence-storage/FAKE_memoryBlobStore";
import { testClock as g2Clock } from "../../../../tools/goods-evidence-storage/testSupport";

const LABEL = "INJECTED";
const NOW = Date.UTC(2026, 9, 6, 8, 0, 0, 0);
const OWNER = "owner_pilot_inj";
const OTHER = "other_pilot_inj";
const DENIED = "denied_pilot_inj";
const LEDGER = "ledger_pilot";
const OTHER_LEDGER = "ledger_other";
const RECEIPT = "receiptp01";
const ENABLED = { GRIN_GOODS_EVIDENCE_FUNCTIONS: "true" } as NodeJS.ProcessEnv;

function asRecord(value: unknown): Record<string, unknown> {
  assert.equal(value != null && typeof value === "object", true);
  return value as Record<string, unknown>;
}

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

async function main(): Promise<void> {
  process.stdout.write(`grin-pilot-smoke.injected label=${LABEL} live=false synthetic=true\n`);

  const store = createInjectedStore();
  seedInjectedOwner(store, OWNER, LEDGER);
  seedInjectedOwner(store, OTHER, OTHER_LEDGER);
  seedInjectedOwner(store, DENIED, LEDGER, { newCommands: "deny", reconciliation: "deny" });
  const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
  const g2db = FAKE_createInjectedFirestore();
  const blobs = new FAKE_MemoryBlobStore();
  FAKE_seedOwner(g2db, OWNER, LEDGER, RECEIPT);
  FAKE_seedOwner(g2db, OTHER, OTHER_LEDGER, RECEIPT);
  FAKE_seedOwner(g2db, DENIED, LEDGER, RECEIPT, {
    policy: { newCommands: "deny", reconciliation: "deny" },
  });
  const evidence = new GoodsEvidenceStorageAdapter(g2db, blobs, g2Clock());
  const callables = createComposedGrinCallables({ adapter, evidence, env: ENABLED });
  assert.match(callables.compositionLabel, /INJECTED/);

  const unauth = asRecord(
    await callables.register({ auth: null, data: registerPayload("commandu1", "receiptu1") }),
  );
  assert.equal(unauth.ok, false);
  assert.equal(unauth.code, "unauthenticated");

  const denied = asRecord(
    await callables.register({
      auth: { uid: DENIED },
      data: registerPayload("commandd1", "receiptd1", DENIED),
    }),
  );
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "policy_denied");

  const registered = asRecord(
    await callables.register({ auth: { uid: OWNER }, data: registerPayload("commandp01", RECEIPT) }),
  );
  assert.equal(registered.ok, true);
  assert.equal(registered.replayed, false);
  assert.equal("confirmed" in registered, true);

  const replayed = asRecord(
    await callables.register({ auth: { uid: OWNER }, data: registerPayload("commandp01", RECEIPT) }),
  );
  assert.equal(replayed.ok, true);
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.issuedNumber, registered.issuedNumber);

  const crossRead = asRecord(
    await callables.readReceipt({
      auth: { uid: OTHER },
      data: { ledgerId: LEDGER, receiptId: RECEIPT },
    }),
  );
  assert.equal(crossRead.ok, false);
  assert.ok(
    crossRead.code === "forbidden" || crossRead.code === "policy_denied" || crossRead.code === "not_found",
  );
  const crossRegister = asRecord(
    await callables.register({
      auth: { uid: OTHER },
      data: registerPayload("commandx01", "receiptx01", OTHER),
    }),
  );
  assert.equal(crossRegister.ok, false);
  assert.equal(crossRegister.code, "forbidden");

  const pdf = new Uint8Array(32);
  pdf.set([0x25, 0x50, 0x44, 0x46]);
  pdf.fill(0x41, 4);
  const sha = createHash("sha256").update(pdf).digest("hex");
  const reserved = asRecord(
    await callables.reserveEvidence({
      auth: { uid: OWNER },
      data: {
        evidenceId: "evidencep01",
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha,
        claimedByteSize: pdf.byteLength,
      },
    }),
  );
  assert.equal(reserved.ok, true);
  const began = asRecord(
    await callables.beginEvidenceUpload({
      auth: { uid: OWNER },
      data: { evidenceId: "evidencep01", ledgerId: LEDGER, receiptId: RECEIPT },
    }),
  );
  assert.equal(began.ok, true);
  await blobs.putIfAbsent(String(reserved.storagePath), pdf, "application/pdf");
  const uploaded = asRecord(
    await callables.uploadEvidence({
      auth: { uid: OWNER },
      data: { evidenceId: "evidencep01", ledgerId: LEDGER, receiptId: RECEIPT },
    }),
  );
  assert.equal(uploaded.ok, true);
  assert.equal(uploaded.originalDurable, true);
  assert.equal(uploaded.actualSha256, sha);
  assert.notEqual(uploaded.generation, "verified");

  const read = await callables.readReceipt({
    auth: { uid: OWNER },
    data: { ledgerId: LEDGER, receiptId: RECEIPT },
  });
  assert.equal(read.ok, true);
  if (!read.ok) throw new Error("expected owner read");
  assert.equal(read.confirmed.receiptId, RECEIPT);
  assert.equal(read.confirmed.events.length >= 1, true);

  const pack = assembleEvidencePackInputs({
    ownerUid: OWNER,
    ledgerId: LEDGER,
    purchaseCaseId: "case_pilot_inj",
    confirmedCuts: [
      {
        receiptId: read.confirmed.receiptId,
        events: read.confirmed.events,
        originalSnapshot: read.confirmed.original,
        eventVersion: read.confirmed.eventVersion,
        headHash: read.confirmed.headHash,
      },
    ],
    originals: [
      {
        evidenceId: "evidencep01",
        ownerUid: OWNER,
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        byteSize: pdf.byteLength,
        rawSha256: sha,
        generation: String(uploaded.generation),
        originalFileName: "pilot.pdf",
        state: "verified",
      },
    ],
  });
  assert.equal(pack.originalBytesBundled, false);
  assert.equal(pack.packPayloadKind, "manifest_and_hashes");
  assert.equal(blobs.objects.has(String(reserved.storagePath)), true, "original remains in blob store; pack does not bundle bytes");

  process.stdout.write(
    `grin-pilot-smoke.injected PASS scenarios=authenticated_success,unauthenticated_denial,non_admitted_denial,cross_owner_denial,register_replay,upload_verification,confirmation,read_export label=${LABEL} live=false e_live_executable=false cross_owner_live_requires_second_account=true\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack || err.message : String(err)}\n`);
  process.exit(1);
});
