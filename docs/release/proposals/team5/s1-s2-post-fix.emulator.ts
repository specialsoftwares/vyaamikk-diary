/**
 * Team 5 independent POST-FIX Firestore emulator review of S1 / S2.
 *
 * Named host: tools/goods-evidence-storage/firebase.json
 * project demo-vyaamikk-grin-g2 — Firestore 127.0.0.1:8091, Storage 9200.
 * Do not reuse G1 8088 or T1 8090.
 *
 * Label: EMULATOR. Not LIVE_BACKEND. Not application CI.
 *
 *   firebase emulators:exec --only firestore,storage \
 *     --project demo-vyaamikk-grin-g2 \
 *     --config tools/goods-evidence-storage/firebase.json \
 *     "GRIN_QA_REPO_ROOT=/Users/shivamsaurav/vyd-worktrees/grin-combined \
 *       npx --yes tsx docs/release/proposals/team5/s1-s2-post-fix.emulator.ts"
 *
 * Run from grin-t5-qa with GRIN_QA_REPO_ROOT, or from combined with this
 * file's absolute path. Exit 0 = stated EMULATOR checks held.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const siblingCombined = join(here, "../../../../../grin-combined");
const selfRepo = join(here, "../../../..");
const ROOT =
  process.env.GRIN_QA_REPO_ROOT ??
  (existsSync(join(siblingCombined, "tools/goods-evidence-storage/harness.ts"))
    ? siblingCombined
    : selfRepo);

async function load(rel: string) {
  return import(pathToFileURL(join(ROOT, rel)).href);
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sampleBytes(fill: number, length: number): Uint8Array {
  return Uint8Array.from({ length }, () => fill);
}

const S1_VARIANTS = [
  { name: "undefined", omitRetained: true },
  { name: "string_900", retainedOriginalBytes: "900" as const },
  { name: "float_0.5", retainedOriginalBytes: 0.5 as const },
  { name: "inconsistent_0", retainedOriginalBytes: 0 as const },
];

async function main(): Promise<void> {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? "";
  const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? "";
  console.log("TEAM5_S1_S2_POST_FIX_EMULATOR");
  console.log(`ROOT=${ROOT}`);
  console.log("label=EMULATOR");
  console.log(`FIRESTORE_EMULATOR_HOST=${host}`);
  console.log(`FIREBASE_STORAGE_EMULATOR_HOST=${storageHost}`);
  assert.ok(host, "FIRESTORE_EMULATOR_HOST required");
  assert.ok(storageHost, "FIREBASE_STORAGE_EMULATOR_HOST required");
  assert.match(host, /8091/, "must be G2 Firestore 8091, not G1 8088 / T1 8090");
  assert.doesNotMatch(host, /8088|8090/);
  assert.match(storageHost, /9200/, "must be G2 Storage 9200, not T1 9201");

  const { GoodsEvidenceStorageAdapter } = await load("tools/goods-evidence-storage/adapter.ts");
  const { adminAppReady, fixedClock, seedOwner, wrapAdminBlobStore, wrapAdminFirestore, PROJECT_ID } =
    await load("tools/goods-evidence-storage/harness.ts");
  const { evidenceObjectPath, storageAccountingPath, subscriptionStatusPath } = await load(
    "tools/goods-evidence-storage/paths.ts"
  );
  const { chargedStorageBytes, originalHoldKey, parseStorageAccounting, parseStorageHoldKey } =
    await load("tools/goods-evidence-storage/storageQuota.ts");

  console.log(`PROJECT_ID=${PROJECT_ID}`);
  assert.equal(PROJECT_ID, "demo-vyaamikk-grin-g2");

  const { db, bucket } = adminAppReady();
  const fs = wrapAdminFirestore(db);
  const blobs = wrapAdminBlobStore(bucket);
  const NOW = Date.UTC(2026, 9, 6, 13, 0, 0, 0);

  const OWNER = "owner_t5_pf_emu";
  const OTHER = "mallory_t5_pf_emu";
  const LEDGER_A = "ledger_t5_pf_a";
  const LEDGER_B = "ledger_t5_pf_b";
  const RECEIPT_A = "receipt_t5_pf_a";
  const RECEIPT_B = "receipt_t5_pf_b";

  await seedOwner(db, OWNER, LEDGER_A, RECEIPT_A);
  await seedOwner(db, OWNER, LEDGER_B, RECEIPT_B);
  await seedOwner(db, OTHER, "ledger_other_t5", "receipt_other_t5");
  await db.doc(subscriptionStatusPath(OWNER)).set({
    entitlementActive: true,
    plan: "starter",
    quotaEnforcementEnabled: true,
  });
  await db.doc(subscriptionStatusPath(OTHER)).set({
    entitlementActive: true,
    plan: "starter",
    quotaEnforcementEnabled: true,
  });

  function reserveBody(evidenceId: string, ledgerId: string, receiptId: string, fill: number, size: number) {
    return {
      evidenceId,
      ledgerId,
      receiptId,
      category: "invoice",
      mime: "application/pdf",
      claimedSha256: sha256Bytes(sampleBytes(fill, size)),
      claimedByteSize: size,
    };
  }

  console.log("");
  console.log("=== EMULATOR S1 four corrupt variants ===");
  const capAdapter = new GoodsEvidenceStorageAdapter(fs, blobs, fixedClock(NOW), {
    storageCapOverrideBytes: 1000,
  });
  for (const variant of S1_VARIANTS) {
    const ev = `ev_s1_${variant.name.replace(/[^A-Za-z0-9_]/g, "_")}`;
    const corrupt: Record<string, unknown> = {
      schemaVersion: 1,
      reservedOriginalBytes: 0,
      reservedDerivativeBytes: 0,
      retainedDerivativeBytes: 0,
      holds: {
        [originalHoldKey(LEDGER_A, "ev_old")]: { kind: "original", bytes: 900, phase: "retained" },
      },
      updatedAtUtc: "2026-10-01T00:00:00.000Z",
    };
    if (!variant.omitRetained) corrupt.retainedOriginalBytes = variant.retainedOriginalBytes;
    await db.doc(storageAccountingPath(OWNER)).set(corrupt);
    const before = (await db.doc(storageAccountingPath(OWNER)).get()).data();
    const denied = await capAdapter.reserve(
      { uid: OWNER },
      reserveBody(ev, LEDGER_A, RECEIPT_A, 3, 200)
    );
    const evidenceSnap = await db.doc(evidenceObjectPath(OWNER, LEDGER_A, ev)).get();
    const after = (await db.doc(storageAccountingPath(OWNER)).get()).data();
    console.log(
      JSON.stringify({
        label: "EMULATOR",
        host: host,
        project: PROJECT_ID,
        scenario: "S1",
        variant: variant.name,
        reserve_ok: denied.ok,
        reserve_code: denied.ok ? undefined : denied.code,
        evidence_exists: evidenceSnap.exists,
        retainedOriginalBytes_after: after?.retainedOriginalBytes,
        reservedOriginalBytes_after: after?.reservedOriginalBytes,
        holds_unchanged: JSON.stringify(after?.holds) === JSON.stringify(before?.holds),
      })
    );
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, "quota_state_invalid");
    assert.equal(evidenceSnap.exists, false);
    assert.equal(after?.reservedOriginalBytes, before?.reservedOriginalBytes);
    assert.deepEqual(after?.holds, before?.holds);
    if (!variant.omitRetained) {
      assert.equal(after?.retainedOriginalBytes, variant.retainedOriginalBytes);
    } else {
      assert.equal(after?.retainedOriginalBytes, undefined);
    }
  }

  console.log("");
  console.log("=== EMULATOR S2 two ledgers + replay + isolation + conflict + contention ===");
  await db.doc(storageAccountingPath(OWNER)).delete();
  const s2 = new GoodsEvidenceStorageAdapter(fs, blobs, fixedClock(NOW + 1000), {
    storageCapOverrideBytes: 10_000,
  });
  const shared = "ev_t5_shared";
  const first = await s2.reserve({ uid: OWNER }, reserveBody(shared, LEDGER_A, RECEIPT_A, 4, 200));
  const second = await s2.reserve({ uid: OWNER }, reserveBody(shared, LEDGER_B, RECEIPT_B, 5, 250));
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (first.ok) assert.equal(first.replayed, false);
  if (second.ok) assert.equal(second.replayed, false);
  const docA = await db.doc(evidenceObjectPath(OWNER, LEDGER_A, shared)).get();
  const docB = await db.doc(evidenceObjectPath(OWNER, LEDGER_B, shared)).get();
  assert.equal(docA.exists, true);
  assert.equal(docB.exists, true);
  const parsed = parseStorageAccounting((await db.doc(storageAccountingPath(OWNER)).get()).data());
  assert.ok(parsed && !("malformed" in parsed));
  const holdA = originalHoldKey(LEDGER_A, shared);
  const holdB = originalHoldKey(LEDGER_B, shared);
  assert.ok(parsed.holds[holdA]);
  assert.ok(parsed.holds[holdB]);
  assert.equal(chargedStorageBytes(parsed), 450);
  assert.equal(parseStorageHoldKey(holdA)?.ledgerId, LEDGER_A);
  console.log(
    JSON.stringify({
      label: "EMULATOR",
      scenario: "S2",
      evidence_a: evidenceObjectPath(OWNER, LEDGER_A, shared),
      evidence_b: evidenceObjectPath(OWNER, LEDGER_B, shared),
      hold_identities: Object.keys(parsed.holds),
      charged: chargedStorageBytes(parsed),
    })
  );

  const replay = await s2.reserve({ uid: OWNER }, reserveBody(shared, LEDGER_A, RECEIPT_A, 4, 200));
  assert.equal(replay.ok, true);
  if (replay.ok) assert.equal(replay.replayed, true);
  const afterReplay = parseStorageAccounting((await db.doc(storageAccountingPath(OWNER)).get()).data());
  assert.ok(afterReplay && !("malformed" in afterReplay));
  assert.equal(chargedStorageBytes(afterReplay), 450);

  const otherAdapter = new GoodsEvidenceStorageAdapter(fs, blobs, fixedClock(NOW + 2000), {
    storageCapOverrideBytes: 10_000,
  });
  const other = await otherAdapter.reserve(
    { uid: OTHER },
    reserveBody(shared, "ledger_other_t5", "receipt_other_t5", 6, 50)
  );
  assert.equal(other.ok, true);
  const otherParsed = parseStorageAccounting((await db.doc(storageAccountingPath(OTHER)).get()).data());
  assert.ok(otherParsed && !("malformed" in otherParsed));
  assert.equal(chargedStorageBytes(otherParsed), 50);
  const ownerAgain = parseStorageAccounting((await db.doc(storageAccountingPath(OWNER)).get()).data());
  assert.ok(ownerAgain && !("malformed" in ownerAgain));
  assert.equal(chargedStorageBytes(ownerAgain), 450);

  const beforeConflict = (await db.doc(storageAccountingPath(OWNER)).get()).data();
  await db.doc(evidenceObjectPath(OWNER, LEDGER_A, shared)).delete();
  const conflict = await s2.reserve({ uid: OWNER }, reserveBody(shared, LEDGER_A, RECEIPT_A, 7, 300));
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.code, "quota_state_invalid");
  assert.equal((await db.doc(evidenceObjectPath(OWNER, LEDGER_A, shared)).get()).exists, false);
  const afterConflict = (await db.doc(storageAccountingPath(OWNER)).get()).data();
  assert.equal(afterConflict?.reservedOriginalBytes, beforeConflict?.reservedOriginalBytes);
  assert.deepEqual(afterConflict?.holds, beforeConflict?.holds);
  console.log(
    JSON.stringify({
      label: "EMULATOR",
      scenario: "S2_conflict_size",
      code: conflict.ok ? undefined : conflict.code,
      accounting_untouched: true,
    })
  );

  const concOwner = "owner_t5_pf_conc";
  await seedOwner(db, concOwner, LEDGER_A, RECEIPT_A);
  await db.doc(subscriptionStatusPath(concOwner)).set({
    entitlementActive: true,
    plan: "starter",
    quotaEnforcementEnabled: true,
  });
  const conc = new GoodsEvidenceStorageAdapter(fs, blobs, fixedClock(NOW + 3000), {
    storageCapOverrideBytes: 1000,
  });
  const [left, right] = await Promise.all([
    conc.reserve({ uid: concOwner }, reserveBody("ev_conc_l", LEDGER_A, RECEIPT_A, 8, 600)),
    conc.reserve({ uid: concOwner }, reserveBody("ev_conc_r", LEDGER_A, RECEIPT_A, 9, 600)),
  ]);
  const oks = [left, right].filter((r) => r.ok);
  const denies = [left, right].filter((r) => !r.ok);
  assert.equal(oks.length, 1);
  assert.equal(denies.length, 1);
  if (!denies[0].ok) assert.equal(denies[0].code, "quota_exhausted");
  const concParsed = parseStorageAccounting((await db.doc(storageAccountingPath(concOwner)).get()).data());
  assert.ok(concParsed && !("malformed" in concParsed));
  assert.equal(chargedStorageBytes(concParsed), 600);
  assert.ok(chargedStorageBytes(concParsed) <= 1000);
  console.log(
    JSON.stringify({
      label: "EMULATOR",
      scenario: "S2_contention",
      oks: 1,
      denies: 1,
      charged: 600,
      host,
    })
  );

  console.log("");
  console.log("S1_S2_POST_FIX_EMULATOR=PASS");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
