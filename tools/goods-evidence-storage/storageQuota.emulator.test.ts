/**
 * FIRESTORE_EMULATOR — S1 fail-closed accounting + S2 hold identity.
 * Does not prove production IAM. Application under test after storageQuota/adapter change.
 */
import assert from "node:assert/strict";

import { GoodsEvidenceStorageAdapter } from "./adapter";
import {
  adminAppReady,
  fixedClock,
  seedOwner,
  wrapAdminBlobStore,
  wrapAdminFirestore,
} from "./harness";
import { evidenceObjectPath, storageAccountingPath, subscriptionStatusPath } from "./paths";
import {
  chargedStorageBytes,
  originalHoldKey,
  parseStorageAccounting,
} from "./storageQuota";
import { evidenceLabel, sampleBytes, sha256Bytes } from "./testSupport";

const OWNER = "owner_s1s2_emu";
const OTHER = "mallory_s1s2_emu";
const LEDGER_A = "ledger_s1s2_a";
const LEDGER_B = "ledger_s1s2_b";
const RECEIPT_A = "receipt_s1s2_a";
const RECEIPT_B = "receipt_s1s2_b";
const NOW = Date.UTC(2026, 9, 6, 12, 0, 0, 0);

async function main(): Promise<void> {
  const { db, bucket } = adminAppReady();
  const fs = wrapAdminFirestore(db);
  const blobs = wrapAdminBlobStore(bucket);
  await seedOwner(db, OWNER, LEDGER_A, RECEIPT_A);
  await seedOwner(db, OWNER, LEDGER_B, RECEIPT_B);
  await seedOwner(db, OTHER, "ledger_other_s1s2", "receipt_other_s1s2");
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

  evidenceLabel("FIRESTORE_EMULATOR", "S1 corrupt accounting fails closed with zero writes");
  const capAdapter = new GoodsEvidenceStorageAdapter(fs, blobs, fixedClock(NOW), {
    storageCapOverrideBytes: 1000,
  });
  const corrupt = {
    schemaVersion: 1,
    reservedOriginalBytes: 0,
    retainedOriginalBytes: 0,
    reservedDerivativeBytes: 0,
    retainedDerivativeBytes: 0,
    holds: {
      [originalHoldKey(LEDGER_A, "ev_old")]: { kind: "original", bytes: 900, phase: "retained" },
    },
    updatedAtUtc: "2026-10-01T00:00:00.000Z",
  };
  await db.doc(storageAccountingPath(OWNER)).set(corrupt);
  const denied = await capAdapter.reserve(
    { uid: OWNER },
    {
      evidenceId: "ev_new_s1",
      ledgerId: LEDGER_A,
      receiptId: RECEIPT_A,
      category: "invoice",
      mime: "application/pdf",
      claimedSha256: sha256Bytes(sampleBytes(3, 200)),
      claimedByteSize: 200,
    }
  );
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.code, "quota_state_invalid");
  const evidenceSnap = await db.doc(evidenceObjectPath(OWNER, LEDGER_A, "ev_new_s1")).get();
  assert.equal(evidenceSnap.exists, false);
  const afterCorrupt = await db.doc(storageAccountingPath(OWNER)).get();
  assert.equal(afterCorrupt.data()?.retainedOriginalBytes, 0);
  assert.equal(afterCorrupt.data()?.reservedOriginalBytes, 0);
  assert.deepEqual(afterCorrupt.data()?.holds, corrupt.holds);

  evidenceLabel("FIRESTORE_EMULATOR", "S2 same evidenceId on two owned ledgers charged separately");
  await db.doc(storageAccountingPath(OWNER)).delete();
  const s2Adapter = new GoodsEvidenceStorageAdapter(fs, blobs, fixedClock(NOW + 1000), {
    storageCapOverrideBytes: 10_000,
  });
  const shared = "ev_shared_s2";
  const first = await s2Adapter.reserve(
    { uid: OWNER },
    {
      evidenceId: shared,
      ledgerId: LEDGER_A,
      receiptId: RECEIPT_A,
      category: "invoice",
      mime: "application/pdf",
      claimedSha256: sha256Bytes(sampleBytes(4, 300)),
      claimedByteSize: 300,
    }
  );
  const second = await s2Adapter.reserve(
    { uid: OWNER },
    {
      evidenceId: shared,
      ledgerId: LEDGER_B,
      receiptId: RECEIPT_B,
      category: "invoice",
      mime: "application/pdf",
      claimedSha256: sha256Bytes(sampleBytes(5, 400)),
      claimedByteSize: 400,
    }
  );
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (first.ok) assert.equal(first.replayed, false);
  if (second.ok) assert.equal(second.replayed, false);
  const docA = await db.doc(evidenceObjectPath(OWNER, LEDGER_A, shared)).get();
  const docB = await db.doc(evidenceObjectPath(OWNER, LEDGER_B, shared)).get();
  assert.equal(docA.exists, true);
  assert.equal(docB.exists, true);
  const accountingSnap = await db.doc(storageAccountingPath(OWNER)).get();
  const parsed = parseStorageAccounting(accountingSnap.data());
  assert.ok(parsed && !("malformed" in parsed));
  if (parsed && !("malformed" in parsed)) {
    assert.equal(Object.keys(parsed.holds).length, 2);
    assert.ok(parsed.holds[originalHoldKey(LEDGER_A, shared)]);
    assert.ok(parsed.holds[originalHoldKey(LEDGER_B, shared)]);
    assert.equal(chargedStorageBytes(parsed), 700);
  }

  evidenceLabel("FIRESTORE_EMULATOR", "identical replay charges once; cross-owner isolated");
  const replay = await s2Adapter.reserve(
    { uid: OWNER },
    {
      evidenceId: shared,
      ledgerId: LEDGER_A,
      receiptId: RECEIPT_A,
      category: "invoice",
      mime: "application/pdf",
      claimedSha256: sha256Bytes(sampleBytes(4, 300)),
      claimedByteSize: 300,
    }
  );
  assert.equal(replay.ok, true);
  if (replay.ok) assert.equal(replay.replayed, true);
  const afterReplay = parseStorageAccounting((await db.doc(storageAccountingPath(OWNER)).get()).data());
  assert.ok(afterReplay && !("malformed" in afterReplay));
  if (afterReplay && !("malformed" in afterReplay)) {
    assert.equal(chargedStorageBytes(afterReplay), 700);
  }
  const otherAdapter = new GoodsEvidenceStorageAdapter(fs, blobs, fixedClock(NOW + 2000), {
    storageCapOverrideBytes: 10_000,
  });
  const otherReserve = await otherAdapter.reserve(
    { uid: OTHER },
    {
      evidenceId: shared,
      ledgerId: "ledger_other_s1s2",
      receiptId: "receipt_other_s1s2",
      category: "invoice",
      mime: "application/pdf",
      claimedSha256: sha256Bytes(sampleBytes(6, 50)),
      claimedByteSize: 50,
    }
  );
  assert.equal(otherReserve.ok, true);
  const otherParsed = parseStorageAccounting(
    (await db.doc(storageAccountingPath(OTHER)).get()).data()
  );
  assert.ok(otherParsed && !("malformed" in otherParsed));
  if (otherParsed && !("malformed" in otherParsed)) {
    assert.equal(chargedStorageBytes(otherParsed), 50);
  }
  const ownerAgain = parseStorageAccounting((await db.doc(storageAccountingPath(OWNER)).get()).data());
  if (ownerAgain && !("malformed" in ownerAgain)) {
    assert.equal(chargedStorageBytes(ownerAgain), 700);
  }

  evidenceLabel("FIRESTORE_EMULATOR", "concurrent reservations near cap cannot both exceed");
  const concOwner = "owner_s1s2_conc";
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
    conc.reserve(
      { uid: concOwner },
      {
        evidenceId: "ev_conc_left",
        ledgerId: LEDGER_A,
        receiptId: RECEIPT_A,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(sampleBytes(8, 600)),
        claimedByteSize: 600,
      }
    ),
    conc.reserve(
      { uid: concOwner },
      {
        evidenceId: "ev_conc_right",
        ledgerId: LEDGER_A,
        receiptId: RECEIPT_A,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256Bytes(sampleBytes(9, 600)),
        claimedByteSize: 600,
      }
    ),
  ]);
  const oks = [left, right].filter((r) => r.ok);
  const denies = [left, right].filter((r) => !r.ok);
  assert.equal(oks.length, 1);
  assert.equal(denies.length, 1);
  if (!denies[0].ok) assert.equal(denies[0].code, "quota_exhausted");
  const concParsed = parseStorageAccounting(
    (await db.doc(storageAccountingPath(concOwner)).get()).data()
  );
  assert.ok(concParsed && !("malformed" in concParsed));
  if (concParsed && !("malformed" in concParsed)) {
    assert.equal(chargedStorageBytes(concParsed), 600);
    assert.ok(chargedStorageBytes(concParsed) <= 1000);
  }

  console.log("tools/goods-evidence-storage/storageQuota.emulator.test.ts: ok");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
