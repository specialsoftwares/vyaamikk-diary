/**
 * Team 5 independent INJECTED check: mutate / QC / return / evidence link /
 * reconcile must not increment usageCurrent after a first register.
 *
 * Not a string scan. Exercises the packaged-equivalent G1 adapter (tools
 * source; functions/ copy differs only by GENERATED header + import remap).
 *
 * Label: INJECTED. Not EMULATOR. Not LIVE_BACKEND. Not application CI.
 *
 * Run against the combined candidate:
 *   GRIN_QA_REPO_ROOT=/Users/shivamsaurav/vyd-worktrees/grin-combined \
 *     npx --yes tsx docs/release/proposals/team5/issuance-non-register-no-consume.injected.ts
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const siblingCombined = join(here, "../../../../../grin-combined");
const selfRepo = join(here, "../../../..");
const ROOT =
  process.env.GRIN_QA_REPO_ROOT ??
  (existsSync(join(siblingCombined, "tools/goods-evidence-emulator/adapter.ts"))
    ? siblingCombined
    : selfRepo);

async function load(rel: string) {
  return import(pathToFileURL(join(ROOT, rel)).href);
}

const NOW = Date.UTC(2026, 8, 28, 12, 0, 0, 0);
const OWNER = "owner_t5_p3";
const LEDGER = "ledger_t5_p3";

function persist(data: Record<string, unknown>): string {
  return JSON.stringify(data);
}

async function main(): Promise<void> {
  const { freezeCommand } = await load("src/goodsEvidence/command.ts");
  const { sampleRegisterBody } = await load("src/goodsEvidence/testFixtures.ts");
  const { GoodsEvidenceRegisterAdapter } = await load(
    "tools/goods-evidence-emulator/adapter.ts"
  );
  const { createInjectedStore, seedInjectedOwner } = await load(
    "tools/goods-evidence-emulator/injectedStore.ts"
  );
  function fixedClock(utcMs: number) {
    const clock = {
      seq: 0,
      nowMs: () => utcMs,
      uuid: () => `id_${++clock.seq}`,
    };
    return clock;
  }
  const { receiptPath, subscriptionStatusPath, usageCurrentPath } = await load(
    "tools/goods-evidence-emulator/paths.ts"
  );

  function envelope(
    commandId: string,
    type: string,
    body: unknown
  ): Record<string, unknown> {
    const frozen = freezeCommand({
      commandId,
      type,
      ownerUid: OWNER,
      ledgerId: LEDGER,
      body,
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

  function usageCount(store: { snapshot: Map<string, string> }): number {
    const raw = store.snapshot.get(usageCurrentPath(OWNER));
    assert.ok(raw, "usageCurrent must exist after first register");
    return JSON.parse(raw).recordsThisMonth;
  }

  const store = createInjectedStore();
  seedInjectedOwner(store, OWNER, LEDGER);
  store.snapshot.set(
    subscriptionStatusPath(OWNER),
    persist({
      entitlementActive: true,
      plan: "free",
      quotaEnforcementEnabled: true,
    })
  );
  const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));

  const registered = await adapter.register(
    { uid: OWNER },
    envelope("command_t5_reg", "registerGoodsReceipt", sampleRegisterBody({ receiptId: "receipt_t5" }))
  );
  assert.equal(registered.ok, true);
  assert.equal(usageCount(store), 1);
  const usageAfterRegister = store.snapshot.get(usageCurrentPath(OWNER));

  const replay = await adapter.register(
    { uid: OWNER },
    envelope("command_t5_reg", "registerGoodsReceipt", sampleRegisterBody({ receiptId: "receipt_t5" }))
  );
  assert.equal(replay.ok, true);
  if (replay.ok) assert.equal(replay.replayed, true);
  assert.equal(usageCount(store), 1, "register replay must not increment");
  assert.equal(store.snapshot.get(usageCurrentPath(OWNER)), usageAfterRegister);

  const amended = await adapter.amendFields(
    { uid: OWNER },
    envelope("command_t5_amd", "amendFields", {
      receiptId: "receipt_t5",
      expectedVersion: 1,
      reason: "correct remarks",
      changes: { remarks: { kind: "present", value: "updated" } },
      clientObservedAtUtc: "2026-09-28T13:00:00.000Z",
    })
  );
  assert.equal(amended.ok, true, "amendFields must succeed without consuming quota");
  assert.equal(usageCount(store), 1);

  const qc = await adapter.recordQc(
    { uid: OWNER },
    envelope("command_t5_qc", "recordQc", {
      receiptId: "receipt_t5",
      expectedVersion: 2,
      reason: "hold at bay",
      qcStatus: "hold",
      clientObservedAtUtc: "2026-09-28T13:10:00.000Z",
    })
  );
  assert.equal(qc.ok, true);
  assert.equal(usageCount(store), 1);

  const returned = await adapter.dispatchReturn(
    { uid: OWNER },
    envelope("command_t5_rt", "dispatchReturn", {
      receiptId: "receipt_t5",
      expectedVersion: 3,
      reason: "QC fail",
      lineId: "line_1",
      returnQty: { value: "5", unit: "bags", precision: 0 },
      clientObservedAtUtc: "2026-09-28T14:00:00.000Z",
    })
  );
  assert.equal(returned.ok, true);
  assert.equal(usageCount(store), 1);

  const linked = await adapter.linkVerifiedEvidence(
    { uid: OWNER },
    envelope("command_t5_ln", "linkVerifiedEvidence", {
      receiptId: "receipt_t5",
      expectedVersion: 4,
      reason: "link verified original",
      clientObservedAtUtc: "2026-09-28T17:01:00.000Z",
      verified: {
        evidenceId: "evidence_t5",
        ownerUid: OWNER,
        ledgerId: LEDGER,
        receiptId: "receipt_t5",
        category: "invoice",
        mime: "image/jpeg",
        byteSize: 24,
        rawSha256: "ab".repeat(32),
        storagePath: "users/owner_t5_p3/objects/randomkey",
        generation: "1",
        verifiedAtUtc: "2026-09-28T16:59:00.000Z",
      },
    })
  );
  assert.equal(linked.ok, true);
  assert.equal(usageCount(store), 1);

  const reconciled = await adapter.reconcile(
    { uid: OWNER },
    { commandId: "command_t5_reg", ledgerId: LEDGER }
  );
  assert.equal(reconciled.ok, true);
  assert.equal(usageCount(store), 1);
  assert.equal(store.snapshot.get(usageCurrentPath(OWNER)), usageAfterRegister);
  assert.equal(store.snapshot.has(receiptPath(OWNER, LEDGER, "receipt_t5")), true);

  console.log("issuance-non-register-no-consume.injected.ts: ok (INJECTED)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
