/**
 * Team 5 independent POST-FIX review of S1 / S2.
 *
 * Real G2 `GoodsEvidenceStorageAdapter.reserve` + injected persistence.
 * Helper results are not the sole proof.
 *
 * Label: INJECTED. Not EMULATOR. Not LIVE_BACKEND. Not application CI.
 * Not a product pass. Do not import into production Functions.
 *
 *   GRIN_QA_REPO_ROOT=/Users/shivamsaurav/vyd-worktrees/grin-combined \
 *     npx --yes tsx docs/release/proposals/team5/s1-s2-post-fix.injected.ts
 *
 * Exit 0 = stated INJECTED checks held on the imported SHA. Exit 1 = defect.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const siblingCombined = join(here, "../../../../../grin-combined");
const selfRepo = join(here, "../../../..");
const ROOT =
  process.env.GRIN_QA_REPO_ROOT ??
  (existsSync(join(siblingCombined, "tools/goods-evidence-storage/storageQuota.ts"))
    ? siblingCombined
    : selfRepo);

const APP_SHA = "520f9f98bc952fd7f30a907da9e85774629a69c0";
const PRE_FIX = "b845e8a30262b9e8740fa53b55e9a0f237caea0b";

async function load(rel: string) {
  return import(pathToFileURL(join(ROOT, rel)).href);
}

function persist(data: Record<string, unknown>): string {
  return JSON.stringify(data);
}

function restore(raw: string | undefined): Record<string, unknown> | undefined {
  if (raw == null) return undefined;
  return JSON.parse(raw) as Record<string, unknown>;
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sampleBytes(fill: number, length: number): Uint8Array {
  return Uint8Array.from({ length }, () => fill);
}

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

type S1Variant = {
  name: string;
  retainedOriginalBytes?: unknown;
  omitRetainedField?: boolean;
};

const S1_VARIANTS: S1Variant[] = [
  { name: "undefined", omitRetainedField: true },
  { name: "string_900", retainedOriginalBytes: "900" },
  { name: "float_0.5", retainedOriginalBytes: 0.5 },
  { name: "inconsistent_0", retainedOriginalBytes: 0 },
];

async function main(): Promise<void> {
  console.log("TEAM5_S1_S2_POST_FIX");
  console.log(`ROOT=${ROOT}`);
  console.log("label=INJECTED");
  console.log(`expected_application_sha=${APP_SHA}`);
  console.log(`pre_fix_sha=${PRE_FIX}`);

  const head = git(["rev-parse", "HEAD"]);
  const files = [
    "tools/goods-evidence-storage/adapter.ts",
    "tools/goods-evidence-storage/storageQuota.ts",
    "functions/src/goodsEvidence/g2/adapter.ts",
    "functions/src/goodsEvidence/g2/storageQuota.ts",
  ] as const;
  for (const rel of files) {
    const atHead = git(["rev-parse", `HEAD:${rel}`]);
    const atApp = git(["rev-parse", `${APP_SHA}:${rel}`]);
    const atPre = git(["rev-parse", `${PRE_FIX}:${rel}`]);
    console.log(`blob ${rel} HEAD=${atHead} app=${atApp} pre=${atPre}`);
    assert.equal(atHead, atApp, `${rel} must match ${APP_SHA}`);
    assert.notEqual(atApp, atPre, `${rel} must differ from pre-fix`);
  }

  const { GoodsEvidenceStorageAdapter } = await load("tools/goods-evidence-storage/adapter.ts");
  const { FAKE_createInjectedFirestore, FAKE_seedOwner } = await load(
    "tools/goods-evidence-storage/FAKE_injectedFirestore.ts"
  );
  const { FAKE_MemoryBlobStore } = await load(
    "tools/goods-evidence-storage/FAKE_memoryBlobStore.ts"
  );
  const {
    evidenceObjectPath,
    storageAccountingPath,
    subscriptionStatusPath,
  } = await load("tools/goods-evidence-storage/paths.ts");
  const {
    MAX_STORAGE_HOLDS,
    chargedStorageBytes,
    originalHoldKey,
    parseStorageAccounting,
    parseStorageHoldKey,
  } = await load("tools/goods-evidence-storage/storageQuota.ts");

  assert.equal(MAX_STORAGE_HOLDS, 2500);
  console.log(`MAX_STORAGE_HOLDS=${MAX_STORAGE_HOLDS} (not indefinite scale)`);

  function testClock(startSeq = 0) {
    const clock = {
      seq: startSeq,
      nowMs: () => Date.UTC(2026, 9, 6, 12, 0, 0, 0),
      objectKey: () => (++clock.seq).toString(16).padStart(32, "0"),
    };
    return clock;
  }

  const OWNER = "owner_t5_pf";
  const OTHER = "mallory_t5_pf";
  const LEDGER = "ledger_t5_pf_a";
  const LEDGER_B = "ledger_t5_pf_b";
  const RECEIPT = "receipt_t5_pf_a";
  const RECEIPT_B = "receipt_t5_pf_b";
  const RETAINED_EV = "ev_s1_retained";
  const NEW_EV = "ev_s1_new";
  const CAP = 1000;

  const encodedRetained = originalHoldKey(LEDGER, RETAINED_EV);
  const parsedKey = parseStorageHoldKey(encodedRetained);
  assert.ok(parsedKey && parsedKey.kind === "original");
  assert.equal(parsedKey.ledgerId, LEDGER);
  assert.equal(parsedKey.evidenceId, RETAINED_EV);
  assert.equal(encodedRetained.startsWith("1.o."), true);
  assert.equal(encodedRetained.includes("original:"), false);
  console.log(`originalHoldKey(${LEDGER},${RETAINED_EV})=${encodedRetained}`);

  function pair(uid: string, cap: number, ledger = LEDGER, receipt = RECEIPT) {
    const db = FAKE_createInjectedFirestore();
    const blobs = new FAKE_MemoryBlobStore();
    FAKE_seedOwner(db, uid, ledger, receipt);
    db.snapshot.set(
      subscriptionStatusPath(uid),
      persist({ entitlementActive: true, plan: "starter", quotaEnforcementEnabled: true })
    );
    const adapter = new GoodsEvidenceStorageAdapter(db, blobs, testClock(), {
      storageCapOverrideBytes: cap,
    });
    return { db, blobs, adapter };
  }

  function reserveBody(evidenceId: string, ledgerId: string, receiptId: string, bytes: Uint8Array) {
    return {
      evidenceId,
      ledgerId,
      receiptId,
      category: "invoice",
      mime: "application/pdf",
      claimedSha256: sha256Bytes(bytes),
      claimedByteSize: bytes.byteLength,
    };
  }

  console.log("");
  console.log("=== INJECTED S1 real adapter.reserve ===");
  for (const variant of S1_VARIANTS) {
    const { adapter, db } = pair(OWNER, CAP);
    const injected: Record<string, unknown> = {
      schemaVersion: 1,
      reservedOriginalBytes: 0,
      reservedDerivativeBytes: 0,
      retainedDerivativeBytes: 0,
      holds: {
        [encodedRetained]: { kind: "original", bytes: 900, phase: "retained" },
      },
      updatedAtUtc: "2026-10-01T00:00:00.000Z",
    };
    if (!variant.omitRetainedField) injected.retainedOriginalBytes = variant.retainedOriginalBytes;
    const before = persist(injected);
    db.snapshot.set(storageAccountingPath(OWNER), before);
    const writesBefore = db.appliedWrites;
    const reserved = await adapter.reserve(
      { uid: OWNER },
      reserveBody(NEW_EV, LEDGER, RECEIPT, sampleBytes(21, 200))
    );
    const after = db.snapshot.get(storageAccountingPath(OWNER));
    const objectWritten = db.snapshot.has(evidenceObjectPath(OWNER, LEDGER, NEW_EV));
    console.log(
      JSON.stringify({
        label: "INJECTED",
        scenario: "S1",
        variant: variant.name,
        reserve_ok: reserved.ok,
        reserve_code: reserved.ok ? undefined : reserved.code,
        evidence_object_written: objectWritten,
        appliedWrites_delta: db.appliedWrites - writesBefore,
        accounting_untouched: after === before,
      })
    );
    assert.equal(reserved.ok, false, `S1 ${variant.name} must fail closed`);
    if (!reserved.ok) assert.equal(reserved.code, "quota_state_invalid");
    assert.equal(objectWritten, false);
    assert.equal(after, before, `S1 ${variant.name} corrupt doc must be untouched`);
    assert.equal(db.appliedWrites, writesBefore, `S1 ${variant.name} zero writes`);
  }

  console.log("");
  console.log("=== INJECTED S2 cross-ledger + replay + isolation + conflict + contention ===");
  {
    const { adapter, db } = pair(OWNER, 10_000);
    FAKE_seedOwner(db, OWNER, LEDGER_B, RECEIPT_B);
    const shared = "ev_s2_shared";
    const first = await adapter.reserve(
      { uid: OWNER },
      reserveBody(shared, LEDGER, RECEIPT, sampleBytes(31, 200))
    );
    const second = await adapter.reserve(
      { uid: OWNER },
      reserveBody(shared, LEDGER_B, RECEIPT_B, sampleBytes(32, 250))
    );
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (first.ok) assert.equal(first.replayed, false);
    if (second.ok) assert.equal(second.replayed, false);
    const pathA = evidenceObjectPath(OWNER, LEDGER, shared);
    const pathB = evidenceObjectPath(OWNER, LEDGER_B, shared);
    const docA = restore(db.snapshot.get(pathA));
    const docB = restore(db.snapshot.get(pathB));
    const accounting = restore(db.snapshot.get(storageAccountingPath(OWNER)));
    const parsed = parseStorageAccounting(accounting);
    assert.ok(parsed && !("malformed" in parsed));
    const holdA = originalHoldKey(LEDGER, shared);
    const holdB = originalHoldKey(LEDGER_B, shared);
    const charged = chargedStorageBytes(parsed);
    console.log(
      JSON.stringify({
        label: "INJECTED",
        scenario: "S2",
        first_ok: first.ok,
        second_ok: second.ok,
        evidence_a: { path: pathA, ledgerId: docA?.ledgerId, receiptId: docA?.receiptId, bytes: docA?.claimedByteSize },
        evidence_b: { path: pathB, ledgerId: docB?.ledgerId, receiptId: docB?.receiptId, bytes: docB?.claimedByteSize },
        hold_identities: Object.keys((parsed as { holds: Record<string, unknown> }).holds),
        hold_a: holdA,
        hold_b: holdB,
        charged,
      })
    );
    assert.equal(docA?.ledgerId, LEDGER);
    assert.equal(docB?.ledgerId, LEDGER_B);
    assert.ok((parsed as { holds: Record<string, unknown> }).holds[holdA]);
    assert.ok((parsed as { holds: Record<string, unknown> }).holds[holdB]);
    assert.equal(charged, 450);
    assert.equal(parseStorageHoldKey(holdA)?.ledgerId, LEDGER);
    assert.equal(parseStorageHoldKey(holdB)?.ledgerId, LEDGER_B);

    const replay = await adapter.reserve(
      { uid: OWNER },
      reserveBody(shared, LEDGER, RECEIPT, sampleBytes(31, 200))
    );
    assert.equal(replay.ok, true);
    if (replay.ok) assert.equal(replay.replayed, true);
    const afterReplay = parseStorageAccounting(restore(db.snapshot.get(storageAccountingPath(OWNER))));
    assert.ok(afterReplay && !("malformed" in afterReplay));
    assert.equal(chargedStorageBytes(afterReplay), 450);
    console.log(JSON.stringify({ label: "INJECTED", scenario: "S2_replay", charged: 450, replayed: true }));
  }

  {
    const { adapter, db } = pair(OWNER, 10_000);
    FAKE_seedOwner(db, OTHER, LEDGER, RECEIPT);
    db.snapshot.set(
      subscriptionStatusPath(OTHER),
      persist({ entitlementActive: true, plan: "starter", quotaEnforcementEnabled: true })
    );
    const otherAdapter = new GoodsEvidenceStorageAdapter(db, new FAKE_MemoryBlobStore(), testClock(10), {
      storageCapOverrideBytes: 10_000,
    });
    const shared = "ev_s2_iso";
    const a = await adapter.reserve({ uid: OWNER }, reserveBody(shared, LEDGER, RECEIPT, sampleBytes(41, 120)));
    const b = await otherAdapter.reserve({ uid: OTHER }, reserveBody(shared, LEDGER, RECEIPT, sampleBytes(42, 80)));
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    const parsedA = parseStorageAccounting(restore(db.snapshot.get(storageAccountingPath(OWNER))));
    const parsedB = parseStorageAccounting(restore(db.snapshot.get(storageAccountingPath(OTHER))));
    assert.ok(parsedA && !("malformed" in parsedA) && parsedB && !("malformed" in parsedB));
    assert.equal(chargedStorageBytes(parsedA), 120);
    assert.equal(chargedStorageBytes(parsedB), 80);
    console.log(JSON.stringify({ label: "INJECTED", scenario: "S2_cross_owner", owner: 120, other: 80 }));
  }

  {
    const { adapter, db } = pair(OWNER, 10_000);
    const first = await adapter.reserve(
      { uid: OWNER },
      reserveBody("ev_conflict", LEDGER, RECEIPT, sampleBytes(51, 200))
    );
    assert.equal(first.ok, true);
    const before = db.snapshot.get(storageAccountingPath(OWNER));
    const writesBefore = db.appliedWrites;
    db.snapshot.delete(evidenceObjectPath(OWNER, LEDGER, "ev_conflict"));
    const conflict = await adapter.reserve(
      { uid: OWNER },
      reserveBody("ev_conflict", LEDGER, RECEIPT, sampleBytes(52, 300))
    );
    assert.equal(conflict.ok, false);
    if (!conflict.ok) assert.equal(conflict.code, "quota_state_invalid");
    assert.equal(db.snapshot.has(evidenceObjectPath(OWNER, LEDGER, "ev_conflict")), false);
    assert.equal(db.snapshot.get(storageAccountingPath(OWNER)), before);
    assert.equal(db.appliedWrites, writesBefore);
    console.log(
      JSON.stringify({
        label: "INJECTED",
        scenario: "S2_conflict_size",
        code: conflict.ok ? undefined : conflict.code,
        writes: 0,
      })
    );
  }

  {
    const { adapter } = pair(OWNER, 1000);
    const [left, right] = await Promise.all([
      adapter.reserve({ uid: OWNER }, reserveBody("ev_conc_l", LEDGER, RECEIPT, sampleBytes(61, 600))),
      adapter.reserve({ uid: OWNER }, reserveBody("ev_conc_r", LEDGER, RECEIPT, sampleBytes(62, 600))),
    ]);
    const oks = [left, right].filter((r) => r.ok);
    const denies = [left, right].filter((r) => !r.ok);
    assert.equal(oks.length, 1);
    assert.equal(denies.length, 1);
    if (!denies[0].ok) assert.equal(denies[0].code, "quota_exhausted");
    const status = await adapter.storageStatus({ uid: OWNER });
    assert.equal(status.ok, true);
    if (status.ok) {
      assert.ok(status.usedBytes <= 1000);
      assert.equal(status.reservedOriginalBytes, 600);
    }
    console.log(
      JSON.stringify({
        label: "INJECTED",
        scenario: "S2_contention",
        oks: oks.length,
        denies: denies.length,
        used: status.ok ? status.usedBytes : null,
      })
    );
  }

  console.log("");
  console.log("=== INJECTED verify/reject cannot move another hold ===");
  {
    const { adapter, blobs, db } = pair(OWNER, 5000);
    const keep = sampleBytes(71, 150);
    const keepReserve = await adapter.reserve(
      { uid: OWNER },
      reserveBody("ev_keep", LEDGER, RECEIPT, keep)
    );
    assert.equal(keepReserve.ok, true);
    if (!keepReserve.ok) throw new Error("keep reserve");
    const began = await adapter.beginUpload({ uid: OWNER }, { evidenceId: "ev_keep", ledgerId: LEDGER });
    assert.equal(began.ok, true);
    await blobs.putIfAbsent(keepReserve.storagePath, keep, "application/pdf");
    const completed = await adapter.completeUpload(
      { uid: OWNER },
      { evidenceId: "ev_keep", ledgerId: LEDGER, receiptId: RECEIPT }
    );
    assert.equal(completed.ok, true);
    const verified = await adapter.verify(
      { uid: OWNER },
      { evidenceId: "ev_keep", ledgerId: LEDGER, receiptId: RECEIPT }
    );
    assert.equal(verified.ok, true);

    const other = await adapter.reserve(
      { uid: OWNER },
      reserveBody("ev_drop", LEDGER, RECEIPT, sampleBytes(72, 90))
    );
    assert.equal(other.ok, true);
    const rejected = await adapter.releaseAbandonedReservation(
      { uid: OWNER },
      { evidenceId: "ev_drop", ledgerId: LEDGER, receiptId: RECEIPT }
    );
    assert.equal(rejected.ok, true);
    const retried = await adapter.retryInterruptedUpload(
      { uid: OWNER },
      { evidenceId: "ev_keep", ledgerId: LEDGER }
    );
    assert.equal(retried.ok, false);
    const parsed = parseStorageAccounting(restore(db.snapshot.get(storageAccountingPath(OWNER))));
    assert.ok(parsed && !("malformed" in parsed));
    assert.equal(parsed.holds[originalHoldKey(LEDGER, "ev_keep")]?.bytes, 150);
    assert.equal(parsed.holds[originalHoldKey(LEDGER, "ev_keep")]?.phase, "retained");
    assert.equal(parsed.holds[originalHoldKey(LEDGER, "ev_drop")], undefined);
    assert.equal(chargedStorageBytes(parsed), 150);
    console.log(
      JSON.stringify({
        label: "INJECTED",
        scenario: "verify_reject_retry_isolation",
        keep_bytes: 150,
        drop_hold: null,
        charged: 150,
        retry_on_verified_ok: retried.ok,
      })
    );
  }

  console.log("");
  console.log("S1_S2_POST_FIX_INJECTED=PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
