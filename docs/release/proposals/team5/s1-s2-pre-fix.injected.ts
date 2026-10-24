/**
 * Team 5 independent PRE-FIX reproduction of S1 / S2.
 *
 * Exercises the REAL G2 adapter (`GoodsEvidenceStorageAdapter.reserve`)
 * against injected persistence — not only `admitStorageReservation`.
 * Helper results are printed and labelled separately; they are not the
 * sole proof.
 *
 * Label: INJECTED (adapter + helper). SOURCE commands live in
 * S1_S2_PRE_FIX.md. EMULATOR is not this file.
 *
 * Not a fix. Not EMULATOR. Not LIVE_BACKEND. Not application CI.
 * Do not import this into production Functions.
 *
 * Run against the combined candidate that still carries application
 * `b845e8a` / PR head `41b05a4` (coordinator `e981587` is docs-only):
 *
 *   GRIN_QA_REPO_ROOT=/Users/shivamsaurav/vyd-worktrees/grin-combined \
 *     npx --yes tsx docs/release/proposals/team5/s1-s2-pre-fix.injected.ts
 *
 * Exit 0 means the pre-fix defects reproduced. Exit 1 means they did not
 * (do not invent a pass).
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
  (existsSync(join(siblingCombined, "tools/goods-evidence-storage/adapter.ts")) &&
  existsSync(join(siblingCombined, "tools/goods-evidence-storage/storageQuota.ts"))
    ? siblingCombined
    : selfRepo);

const APP_SHA = "b845e8a30262b9e8740fa53b55e9a0f237caea0b";
const PR_HEAD = "41b05a49e8e60597b63a35f22825878bc1945dee";

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
  retainedOriginalBytes: unknown;
  omitRetainedField?: boolean;
};

const S1_VARIANTS: S1Variant[] = [
  { name: "undefined", retainedOriginalBytes: undefined, omitRetainedField: true },
  { name: "string_900", retainedOriginalBytes: "900" },
  { name: "float_0.5", retainedOriginalBytes: 0.5 },
  { name: "inconsistent_0", retainedOriginalBytes: 0 },
];

async function main(): Promise<void> {
  console.log("TEAM5_S1_S2_PRE_FIX");
  console.log(`ROOT=${ROOT}`);
  console.log(`label=INJECTED`);
  console.log(`expected_application_sha=${APP_SHA}`);
  console.log(`expected_pr_head=${PR_HEAD}`);

  const head = git(["rev-parse", "HEAD"]);
  const adapterBlob = git(["rev-parse", "HEAD:tools/goods-evidence-storage/adapter.ts"]);
  const quotaBlob = git(["rev-parse", "HEAD:tools/goods-evidence-storage/storageQuota.ts"]);
  const appAdapterBlob = git(["rev-parse", `${APP_SHA}:tools/goods-evidence-storage/adapter.ts`]);
  const appQuotaBlob = git(["rev-parse", `${APP_SHA}:tools/goods-evidence-storage/storageQuota.ts`]);
  console.log(`git_HEAD=${head}`);
  console.log(`adapter_blob_HEAD=${adapterBlob}`);
  console.log(`adapter_blob_b845e8a=${appAdapterBlob}`);
  console.log(`quota_blob_HEAD=${quotaBlob}`);
  console.log(`quota_blob_b845e8a=${appQuotaBlob}`);
  assert.equal(adapterBlob, appAdapterBlob, "adapter must still be the pre-fix b845e8a blob");
  assert.equal(quotaBlob, appQuotaBlob, "storageQuota must still be the pre-fix b845e8a blob");

  const {
    GoodsEvidenceStorageAdapter,
  } = await load("tools/goods-evidence-storage/adapter.ts");
  const { FAKE_createInjectedFirestore, FAKE_seedOwner } = await load(
    "tools/goods-evidence-storage/FAKE_injectedFirestore.ts"
  );
  const { FAKE_MemoryBlobStore } = await load(
    "tools/goods-evidence-storage/FAKE_memoryBlobStore.ts"
  );
  const {
    evidenceObjectPath,
    ledgerPath,
    receiptPath,
    storageAccountingPath,
    subscriptionStatusPath,
  } = await load("tools/goods-evidence-storage/paths.ts");
  const {
    admitStorageReservation,
    chargedStorageBytes,
    originalHoldKey,
    parseStorageAccounting,
  } = await load("tools/goods-evidence-storage/storageQuota.ts");

  function testClock() {
    const clock = {
      seq: 0,
      nowMs: () => Date.UTC(2026, 9, 1, 12, 0, 0, 0),
      objectKey: () => (++clock.seq).toString(16).padStart(32, "0"),
    };
    return clock;
  }

  console.log(`originalHoldKey(ev_demo)=${originalHoldKey("ev_demo")}`);
  assert.equal(originalHoldKey("ev_demo"), "original:ev_demo");
  assert.equal(originalHoldKey("ev_demo").includes("ledger"), false);

  const OWNER = "owner_t5_s1s2";
  const LEDGER = "ledger_t5_s1";
  const RECEIPT = "receipt_t5_s1";
  const RETAINED_EVIDENCE = "ev_s1_retained";
  const NEW_EVIDENCE = "ev_s1_new";
  const CAP = 1000;
  const RETAINED_BYTES = 900;
  const NEW_BYTES = 200;

  console.log("");
  console.log("=== HELPER admitStorageReservation (not sole proof) ===");
  for (const variant of S1_VARIANTS) {
    const raw: Record<string, unknown> = {
      schemaVersion: 1,
      reservedOriginalBytes: 0,
      reservedDerivativeBytes: 0,
      retainedDerivativeBytes: 0,
      holds: {
        [originalHoldKey(RETAINED_EVIDENCE)]: {
          kind: "original",
          bytes: RETAINED_BYTES,
          phase: "retained",
        },
      },
      updatedAtUtc: "2026-10-01T00:00:00.000Z",
    };
    if (!variant.omitRetainedField) raw.retainedOriginalBytes = variant.retainedOriginalBytes;
    const parsed = parseStorageAccounting(raw);
    assert.ok(parsed && !("malformed" in parsed), `helper parse must accept ${variant.name} on pre-fix`);
    const admitted = admitStorageReservation({
      existing: parsed,
      holdKey: originalHoldKey(NEW_EVIDENCE),
      kind: "original",
      bytes: NEW_BYTES,
      capBytes: CAP,
      updatedAtUtc: "2026-10-01T12:00:00.000Z",
    });
    const charged = admitted.ok ? chargedStorageBytes(admitted.next) : null;
    console.log(
      JSON.stringify({
        label: "HELPER",
        variant: variant.name,
        parse_malformed: false,
        admission_ok: admitted.ok,
        charged,
        next_counters: admitted.ok
          ? {
              reservedOriginalBytes: admitted.next.reservedOriginalBytes,
              retainedOriginalBytes: admitted.next.retainedOriginalBytes,
            }
          : null,
      })
    );
    assert.equal(admitted.ok, true, `helper ${variant.name} must admit on pre-fix`);
    assert.equal(charged, 1100);
  }

  console.log("");
  console.log("=== INJECTED real G2 adapter.reserve (S1) ===");
  for (const variant of S1_VARIANTS) {
    const db = FAKE_createInjectedFirestore();
    const blobs = new FAKE_MemoryBlobStore();
    FAKE_seedOwner(db, OWNER, LEDGER, RECEIPT);
    db.snapshot.set(
      subscriptionStatusPath(OWNER),
      persist({
        entitlementActive: true,
        plan: "starter",
        quotaEnforcementEnabled: true,
      })
    );
    const injected: Record<string, unknown> = {
      schemaVersion: 1,
      reservedOriginalBytes: 0,
      reservedDerivativeBytes: 0,
      retainedDerivativeBytes: 0,
      holds: {
        [originalHoldKey(RETAINED_EVIDENCE)]: {
          kind: "original",
          bytes: RETAINED_BYTES,
          phase: "retained",
        },
      },
      updatedAtUtc: "2026-10-01T00:00:00.000Z",
    };
    if (!variant.omitRetainedField) injected.retainedOriginalBytes = variant.retainedOriginalBytes;
    db.snapshot.set(storageAccountingPath(OWNER), persist(injected));
    const writesBefore = db.appliedWrites;
    const accountingBefore = restore(db.snapshot.get(storageAccountingPath(OWNER)));
    const adapter = new GoodsEvidenceStorageAdapter(db, blobs, testClock(), {
      storageCapOverrideBytes: CAP,
    });
    const bytes = sampleBytes(21, NEW_BYTES);
    const reserved = await adapter.reserve(
      { uid: OWNER },
      {
        evidenceId: NEW_EVIDENCE,
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(bytes),
        claimedByteSize: bytes.byteLength,
      }
    );
    const accountingAfter = restore(db.snapshot.get(storageAccountingPath(OWNER)));
    const parsedAfter = parseStorageAccounting(accountingAfter);
    const charged =
      parsedAfter && !("malformed" in parsedAfter) ? chargedStorageBytes(parsedAfter) : null;
    const writesAfter = db.appliedWrites;
    const objectPath = evidenceObjectPath(OWNER, LEDGER, NEW_EVIDENCE);
    const row = {
      label: "INJECTED",
      scenario: "S1",
      variant: variant.name,
      injected_retainedOriginalBytes: variant.omitRetainedField
        ? "(omitted/undefined)"
        : variant.retainedOriginalBytes,
      injected_hold: accountingBefore?.holds,
      reserve_ok: reserved.ok,
      reserve_code: reserved.ok ? undefined : reserved.code,
      replayed: reserved.ok ? reserved.replayed : undefined,
      evidence_object_written: db.snapshot.has(objectPath),
      appliedWrites_delta: writesAfter - writesBefore,
      persisted_accounting: accountingAfter,
      charged,
    };
    console.log(JSON.stringify(row));
    assert.equal(reserved.ok, true, `adapter S1 ${variant.name} must admit on pre-fix`);
    if (reserved.ok) assert.equal(reserved.replayed, false);
    assert.equal(db.snapshot.has(objectPath), true);
    assert.ok(writesAfter > writesBefore, "pre-fix must write; zero-write is the post-fix bar");
    assert.equal(charged, 1100, `adapter S1 ${variant.name} charged must be 1100`);
    assert.equal(accountingAfter?.reservedOriginalBytes, 200);
    assert.equal(accountingAfter?.retainedOriginalBytes, 900);
  }

  console.log("");
  console.log("=== INJECTED real G2 adapter.reserve (S2 cross-ledger) ===");
  const LEDGER_A = "ledger_t5_s2_a";
  const LEDGER_B = "ledger_t5_s2_b";
  const RECEIPT_A = "receipt_t5_s2_a";
  const RECEIPT_B = "receipt_t5_s2_b";
  const SHARED_EVIDENCE = "ev_s2_shared";
  const SIZE_A = 200;
  const SIZE_B = 250;

  const db = FAKE_createInjectedFirestore();
  const blobs = new FAKE_MemoryBlobStore();
  FAKE_seedOwner(db, OWNER, LEDGER_A, RECEIPT_A);
  db.snapshot.set(
    ledgerPath(OWNER, LEDGER_B),
    persist({ ownerUid: OWNER, status: "active" })
  );
  db.snapshot.set(
    receiptPath(OWNER, LEDGER_B, RECEIPT_B),
    persist({ original: { receiptId: RECEIPT_B, ownerUid: OWNER, ledgerId: LEDGER_B } })
  );
  db.snapshot.set(
    subscriptionStatusPath(OWNER),
    persist({
      entitlementActive: true,
      plan: "starter",
      quotaEnforcementEnabled: true,
    })
  );
  const adapter = new GoodsEvidenceStorageAdapter(db, blobs, testClock(), {
    storageCapOverrideBytes: CAP,
  });

  const bytesA = sampleBytes(31, SIZE_A);
  const first = await adapter.reserve(
    { uid: OWNER },
    {
      evidenceId: SHARED_EVIDENCE,
      ledgerId: LEDGER_A,
      receiptId: RECEIPT_A,
      category: "invoice",
      mime: "application/pdf",
      claimedSha256: sha256Bytes(bytesA),
      claimedByteSize: bytesA.byteLength,
    }
  );
  const accountingAfterFirst = restore(db.snapshot.get(storageAccountingPath(OWNER)));
  const writesAfterFirst = db.appliedWrites;

  const bytesB = sampleBytes(32, SIZE_B);
  const second = await adapter.reserve(
    { uid: OWNER },
    {
      evidenceId: SHARED_EVIDENCE,
      ledgerId: LEDGER_B,
      receiptId: RECEIPT_B,
      category: "invoice",
      mime: "application/pdf",
      claimedSha256: sha256Bytes(bytesB),
      claimedByteSize: bytesB.byteLength,
    }
  );
  const accountingAfterSecond = restore(db.snapshot.get(storageAccountingPath(OWNER)));
  const parsedSecond = parseStorageAccounting(accountingAfterSecond);
  const charged =
    parsedSecond && !("malformed" in parsedSecond) ? chargedStorageBytes(parsedSecond) : null;
  const pathA = evidenceObjectPath(OWNER, LEDGER_A, SHARED_EVIDENCE);
  const pathB = evidenceObjectPath(OWNER, LEDGER_B, SHARED_EVIDENCE);
  const docA = restore(db.snapshot.get(pathA));
  const docB = restore(db.snapshot.get(pathB));
  const holdKeys = accountingAfterSecond?.holds
    ? Object.keys(accountingAfterSecond.holds as Record<string, unknown>)
    : [];

  const s2 = {
    label: "INJECTED",
    scenario: "S2",
    owner: OWNER,
    hold_key_fn: originalHoldKey(SHARED_EVIDENCE),
    first: {
      ok: first.ok,
      replayed: first.ok ? first.replayed : undefined,
      objectKey: first.ok ? first.objectKey : undefined,
      ledgerId: LEDGER_A,
      receiptId: RECEIPT_A,
      claimedByteSize: SIZE_A,
    },
    second: {
      ok: second.ok,
      replayed: second.ok ? second.replayed : undefined,
      objectKey: second.ok ? second.objectKey : undefined,
      ledgerId: LEDGER_B,
      receiptId: RECEIPT_B,
      claimedByteSize: SIZE_B,
    },
    evidence_docs: {
      [pathA]: {
        exists: db.snapshot.has(pathA),
        ledgerId: docA?.ledgerId,
        receiptId: docA?.receiptId,
        evidenceId: docA?.evidenceId,
        claimedByteSize: docA?.claimedByteSize,
        objectKey: docA?.objectKey,
        state: docA?.state,
      },
      [pathB]: {
        exists: db.snapshot.has(pathB),
        ledgerId: docB?.ledgerId,
        receiptId: docB?.receiptId,
        evidenceId: docB?.evidenceId,
        claimedByteSize: docB?.claimedByteSize,
        objectKey: docB?.objectKey,
        state: docB?.state,
      },
    },
    hold_identities: holdKeys,
    holds: accountingAfterSecond?.holds ?? null,
    charged_after_first:
      accountingAfterFirst && parseStorageAccounting(accountingAfterFirst)
        ? chargedStorageBytes(parseStorageAccounting(accountingAfterFirst) as never)
        : null,
    charged_after_second: charged,
    appliedWrites_after_first: writesAfterFirst,
    appliedWrites_after_second: db.appliedWrites,
    expected_if_identity_included_ledger: SIZE_A + SIZE_B,
  };
  console.log(JSON.stringify(s2, null, 2));

  assert.equal(first.ok, true, "S2 first reserve must succeed");
  if (first.ok) assert.equal(first.replayed, false);
  assert.equal(second.ok, true, "S2 second reserve must succeed on pre-fix (collision)");
  if (second.ok) assert.equal(second.replayed, false, "second ledger object is new, not object replay");
  assert.equal(db.snapshot.has(pathA), true);
  assert.equal(db.snapshot.has(pathB), true);
  assert.equal(docA?.ledgerId, LEDGER_A);
  assert.equal(docB?.ledgerId, LEDGER_B);
  assert.equal(docA?.evidenceId, SHARED_EVIDENCE);
  assert.equal(docB?.evidenceId, SHARED_EVIDENCE);
  assert.notEqual(docA?.objectKey, docB?.objectKey);
  assert.equal(docA?.receiptId, RECEIPT_A);
  assert.equal(docB?.receiptId, RECEIPT_B);
  assert.deepEqual(holdKeys, [originalHoldKey(SHARED_EVIDENCE)]);
  assert.equal(charged, SIZE_A, "pre-fix charged total is first hold only; second collides");
  assert.notEqual(charged, SIZE_A + SIZE_B);

  console.log("");
  console.log("S1_S2_PRE_FIX_REPRODUCED=true (INJECTED real G2 adapter)");
  console.log("EMULATOR=NOT_RUN");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
