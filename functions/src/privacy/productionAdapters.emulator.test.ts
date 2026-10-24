/**
 * Isolated Firestore. These tests call the production adapters, not a memory store.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

import { initializeApp, deleteApp, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { migrateContentKeyBatch, sealContent, sealContentV2 } from "./contentEncryption";
import {
  createFirestoreMigrationCheckpointStore,
  persistMigratedSeal,
  readMigrationPage,
  runDurableMigration,
} from "./firestoreContentKeyMigration";
import { releaseRestoreHolds } from "../deletion/restoreControlPlane";
import {
  createFirestoreInventory,
  createFirestoreInventoryLog,
  createFirestoreRestoreHoldStore,
  enforceClientFenceFromHold,
} from "../deletion/firestoreRestoreAdapters";
import { runHeldResolutionWorkflow } from "../deletion/deletionInventory";
import { reviewUnknownPurgeHold } from "../deletion/firestorePurge";
import { classifyPublishedAuthority, readPublishedAuthorityDocument } from "../deletion/restoreAuthority";
import { privilegedWorkerHold, readDurableWorkerHold } from "../deletion/privilegedWorkerGuard";
import { restoreTrafficDecisionForUid } from "../deletion/restoreGate";
import type { DeletionJobDoc } from "../deletion/deletionJob";

const PROJECT = "demo-vyaamikk-privacy-adapters";
const HOLD_DB = "restore-holds";

async function resumeCheckpoint(): Promise<void> {
  const app = initializeApp({ projectId: PROJECT }, "resume-process");
  const db = getFirestore(app);
  const store = createFirestoreMigrationCheckpointStore(db, { scopeId: "diary", toKeyId: "named-key" });
  const lease = await store.read();
  console.log(`RESUME ${lease?.cursor ?? "none"}`);
  await deleteApp(app);
}

function resumeInNewProcess(): string {
  const child = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1), "--resume"], {
    env: process.env,
    encoding: "utf8",
  });
  if (child.status !== 0) throw new Error(child.stderr || child.stdout || "resume process failed");
  const line = child.stdout.split("\n").map((row) => row.trim()).find((row) => row.startsWith("RESUME "));
  if (!line) throw new Error(child.stdout || "resume process did not print a cursor");
  return line.slice("RESUME ".length);
}

async function main(): Promise<void> {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/);
  const app = initializeApp({ projectId: PROJECT }, "privacy-adapters");
  initializeApp({ projectId: PROJECT });
  const primary = getFirestore(app);
  const outside = getFirestore(app, HOLD_DB);
  const key = randomBytes(32);
  const named = randomBytes(32);
  const resolveKey = (id: string) => (id === "named-key" ? named : id === "legacy" ? key : null);
  const previousMigration = process.env.CONTENT_KEY_MIGRATION_ENABLED;
  const previousProtection = process.env.RESTORE_PROTECTION_ACTIVE;
  const previousHoldDb = process.env.RESTORE_HOLD_DATABASE_ID;
  process.env.CONTENT_KEY_MIGRATION_ENABLED = "true";
  try {
    await assert.rejects(
      () => migrateContentKeyBatch({ rows: [], toKeyId: "named-key", resolveKey, dryRun: false }),
      /migration_writer_required/
    );
    const seal = sealContent({
      key,
      uid: "owner-a",
      collection: "sealedEntries",
      recordId: "a",
      revision: 4,
      purpose: "diary",
      plaintext: Buffer.from("warehouse"),
    });
    const other = sealContent({
      key,
      uid: "owner-b",
      collection: "sealedEntries",
      recordId: "b",
      revision: 4,
      purpose: "diary",
      plaintext: Buffer.from("ledger"),
    });
    await primary.doc("users/owner-a").set({ status: "active" });
    await primary.doc("users/owner-b").set({ status: "active" });
    await primary.doc("users/owner-a/sealedEntries/a").set({ updatedAt: 4, contentSeal: seal });
    await primary.doc("users/owner-b/sealedEntries/b").set({ updatedAt: 4, contentSeal: other });
    await primary.doc("users/owner-b/sealedEntries/quarantine").set({
      updatedAt: 4,
      contentSeal: seal,
    });
    const firstPage = await readMigrationPage(primary, { collections: ["sealedEntries"], cursor: null, limit: 1 });
    assert.equal(firstPage.rows.length, 1);
    assert.ok(firstPage.nextCursor);
    assert.notEqual(firstPage.nextCursor, firstPage.rows[0]?.id);
    const secondPage = await readMigrationPage(primary, {
      collections: ["sealedEntries"],
      cursor: firstPage.nextCursor,
      limit: 10,
    });
    assert.equal(secondPage.rows[0]?.id, firstPage.nextCursor);
    assert.ok(secondPage.rows.some((row) => row.id.includes("owner-b")));

    const disabled = await runDurableMigration({
      db: primary,
      scopeId: "diary",
      toKeyId: "named-key",
      collections: ["sealedEntries"],
      runId: "disabled",
      now: 1_000,
      leaseMs: 10_000,
      limit: 10,
      resolveKey,
      env: {},
    });
    assert.equal(disabled.status, "disabled");
    assert.equal((await primary.doc("users/owner-a/sealedEntries/a").get()).get("contentSeal").v, 1);

    const store = createFirestoreMigrationCheckpointStore(primary, { scopeId: "diary", toKeyId: "named-key" });
    await store.compareAndSet(null, {
      runId: "run-a",
      revision: 1,
      cursor: "users/owner-a/sealedEntries/a",
      toKeyId: "named-key",
      leaseUntil: 5_000,
      conflicts: [],
      fence: 1,
      scopeId: "diary",
      quarantined: [],
      unresolved: [],
    });
    assert.equal(resumeInNewProcess(), "users/owner-a/sealedEntries/a");
    const otherScope = createFirestoreMigrationCheckpointStore(primary, { scopeId: "other", toKeyId: "named-key" });
    const otherKey = createFirestoreMigrationCheckpointStore(primary, { scopeId: "diary", toKeyId: "other-key" });
    assert.equal(await otherScope.read(), null);
    assert.equal(await otherKey.read(), null);

    const renewed = await store.renew({ runId: "run-a", fence: 1 }, 4_500, 10_000);
    assert.equal(renewed, "renewed");
    const renewedLease = await store.read();
    assert.ok(renewedLease && renewedLease.leaseUntil >= 14_000);
    const takeover = createFirestoreMigrationCheckpointStore(getFirestore(getApp("privacy-adapters")), {
      scopeId: "diary",
      toKeyId: "named-key",
    });
    await takeover.compareAndSet(renewedLease!.revision, {
      ...renewedLease!,
      runId: "run-b",
      revision: renewedLease!.revision + 1,
      fence: renewedLease!.fence + 1,
      leaseUntil: 30_000,
    });
    const fenced = await persistMigratedSeal(
      primary,
      store,
      { runId: "run-a", fence: 1, now: 20_000 },
      { id: "users/owner-a/sealedEntries/a", path: "users/owner-a/sealedEntries/a", updatedAt: 4, contentSeal: seal },
      seal
    );
    assert.equal(fenced, "rejected");
    assert.equal((await primary.doc("users/owner-a/sealedEntries/a").get()).get("contentSeal").v, 1);

    await primary.doc("users/owner-a/sealedEntries/a").update({ updatedAt: 9 });
    const current = await takeover.read();
    const conflicted = await persistMigratedSeal(
      primary,
      takeover,
      { runId: "run-b", fence: current!.fence, now: 21_000 },
      { id: "users/owner-a/sealedEntries/a", path: "users/owner-a/sealedEntries/a", updatedAt: 4, contentSeal: seal },
      seal
    );
    assert.equal(conflicted, "conflict");
    assert.equal((await primary.doc("users/owner-a/sealedEntries/a").get()).get("updatedAt"), 9);
    await primary.doc("users/owner-a/sealedEntries/a").update({ updatedAt: 4 });

    const lost = await persistMigratedSeal(
      primary,
      takeover,
      { runId: "run-b", fence: current!.fence, now: 21_000 },
      { id: "users/owner-a/sealedEntries/a", path: "users/owner-a/sealedEntries/a", updatedAt: 4, contentSeal: seal },
      sealContentV2({
        key: named,
        keyId: "named-key",
        uid: "owner-a",
        collection: "sealedEntries",
        recordId: "a",
        revision: 4,
        purpose: "diary",
        plaintext: Buffer.from("warehouse"),
      }),
      async () => {
        throw new Error("ack dropped");
      }
    );
    assert.equal(lost, "unknown");
    assert.equal((await primary.doc("users/owner-a/sealedEntries/a").get()).get("contentSeal").v, 2);

    const migrated = await runDurableMigration({
      db: primary,
      scopeId: "diary",
      toKeyId: "named-key",
      collections: ["sealedEntries"],
      runId: "run-b",
      now: 22_000,
      leaseMs: 10_000,
      limit: 10,
      resolveKey,
    });
    assert.equal(migrated.status, "stored");
    if (migrated.status === "stored") {
      assert.equal(migrated.complete, false);
      assert.ok(migrated.quarantined.some((id) => id.includes("quarantine")));
    }

    const holds = createFirestoreRestoreHoldStore(primary, outside);
    assert.equal((await holds.readHolds()).traffic, "closed");
    assert.equal((await releaseRestoreHolds(holds, 2)).reason, "restored_primary_missing_restore_control");
    assert.equal((await holds.readHolds()).traffic, "closed");
    assert.equal(await enforceClientFenceFromHold(primary, await holds.readHolds()), "closed");
    assert.equal((await primary.doc("restoreControl/current").get()).get("closed"), true);
    const missingAuthority = await readPublishedAuthorityDocument(outside, {
      protectionActive: true,
      configured: true,
      fenceClosed: false,
    });
    assert.equal(missingAuthority.state, "unavailable");
    assert.equal("erasedUids" in missingAuthority, false);
    await outside.doc("authority/restore").set({ watermark: "bad", erasedUids: [], withdrawnPurposes: {} });
    const malformed = await readPublishedAuthorityDocument(outside, {
      protectionActive: true,
      configured: true,
      fenceClosed: false,
    });
    assert.equal(malformed.state, "unavailable");
    if (malformed.state === "unavailable") assert.equal(malformed.reason, "malformed");
    assert.equal(classifyPublishedAuthority({
      protectionActive: false,
      configured: false,
      exists: false,
      raw: null,
      fenceClosed: false,
    }).state, "unconfigured");
    await outside.doc("authority/restore").set({ watermark: 2, erasedUids: [], withdrawnPurposes: {} });
    const published = await readPublishedAuthorityDocument(outside, {
      protectionActive: true,
      configured: true,
      fenceClosed: false,
    });
    assert.deepEqual(published, { state: "current", watermark: 2 });
    await primary.doc("restoreControl/mode").set({ required: false });
    await primary.doc("restoreControl/current").set({ closed: false, reconciled: true, watermark: 2 });
    const resumedHolds = createFirestoreRestoreHoldStore(getFirestore(getApp("privacy-adapters")), getFirestore(getApp("privacy-adapters"), HOLD_DB));
    const workers = await releaseRestoreHolds(resumedHolds, 2);
    assert.equal(workers.reason, "workers_released");
    assert.equal((await resumedHolds.readHolds()).traffic, "closed");
    await primary.doc("restoreControl/current").set({ closed: true, reconciled: true, watermark: 2 });
    assert.equal((await releaseRestoreHolds(resumedHolds, 2)).reason, "fence_not_reconciled");
    assert.equal((await resumedHolds.readHolds()).workers, "stopped");
    await primary.doc("restoreControl/current").set({ closed: false, reconciled: true, watermark: 2 });
    assert.equal((await releaseRestoreHolds(resumedHolds, 2)).reason, "workers_released");
    const held = await resumedHolds.readHolds();
    assert.equal(
      await resumedHolds.writeHolds({ ...held, traffic: "open", workers: "running", phase: "traffic_released", revision: held.revision + 1 }, held.revision - 1),
      "conflict"
    );
    assert.equal((await resumedHolds.readHolds()).traffic, "closed");
    const opened = await releaseRestoreHolds(resumedHolds, 2);
    assert.equal(opened.released, true);
    assert.equal((await resumedHolds.readHolds()).phase, "traffic_released");

    process.env.RESTORE_PROTECTION_ACTIVE = "true";
    process.env.RESTORE_HOLD_DATABASE_ID = HOLD_DB;
    assert.equal(await privilegedWorkerHold(process.env, () => readDurableWorkerHold(process.env)), "running");
    await resumedHolds.writeHolds(
      { traffic: "closed", workers: "stopped", phase: "closed", revision: (await resumedHolds.readHolds()).revision + 1 },
      (await resumedHolds.readHolds()).revision
    );
    assert.equal(await privilegedWorkerHold(process.env, () => readDurableWorkerHold(process.env)), "stopped");
    await primary.doc("restoreControl/current").set({ closed: false, reconciled: true, watermark: 2 });
    assert.equal(await restoreTrafficDecisionForUid("owner-a"), "deny");

    await primary.doc("users/inventory-owner").set({ status: "active" });
    await primary.doc("users/inventory-owner/entries/item").set({ title: "row" });
    await primary.doc("users/inventory-owner/entries/second").set({ title: "next" });
    await primary.doc("users/inventory-owner/entries/ghost/notes/orphan").set({ note: "missing parent" });
    await primary.doc("users/inventory-owner/entries/item/notes/n1/more/deep/extra/too-deep").set({ deep: true });
    await primary.doc("users/inventory-owner/customDeep/x").set({ unknown: true });
    const inventory = createFirestoreInventory(primary, 1);
    const first = await inventory.listPage("users/inventory-owner", "entries");
    assert.equal(first.ids.length, 1);
    assert.ok(first.nextPageToken);
    const next = await inventory.listPage("users/inventory-owner", "entries", first.nextPageToken ?? undefined);
    assert.ok(next.ids.length >= 1);
    assert.notEqual(next.ids[0], first.ids[0]);
    const log = createFirestoreInventoryLog(primary, { jobId: "inventory-owner:1", uid: "inventory-owner" });
    const otherLog = createFirestoreInventoryLog(primary, { jobId: "inventory-owner:2", uid: "inventory-owner" });
    await assert.rejects(
      () => log.commit({
        revision: 9,
        scope: "users/other",
        observedAt: 1,
        remainingPaths: [],
        status: "complete",
        clockSource: "server",
        jobId: "other:1",
        uid: "other",
      }),
      /inventory_wrong_account/
    );
    const job = {
      uid: "inventory-owner",
      generation: 1,
      status: "leased",
      leaseOwner: "worker-a",
      leaseUntil: 50_000,
    } as DeletionJobDoc;
    const partial = await runHeldResolutionWorkflow({
      uid: "inventory-owner",
      job,
      worker: "worker-a",
      now: 1,
      inventory,
      log,
      knownCollections: ["entries", "notes", "more", "extra"],
      maxDepth: 3,
      maxPages: 0,
      providerEvidence: null,
      backupEvidence: null,
      revision: 1,
    });
    assert.equal(partial.status, "continue");
    const storedPartial = await log.read(1);
    assert.equal(storedPartial?.status, "partial");
    assert.notEqual(storedPartial?.observedAt, 1);
    assert.equal(await otherLog.read(1), null);
    assert.equal((await reviewUnknownPurgeHold({
      hold: "unknown_collection",
      path: "users/inventory-owner/customDeep",
      walkerDeleted: 0,
      log,
      claimedRevision: 1,
      claimedRemaining: 0,
      expectedScope: "users/inventory-owner",
      now: Date.now() + 1_000,
      maxAgeMs: 60_000,
      providerEvidence: null,
      backupEvidence: null,
    })).reason, "inventory_scan_incomplete");
    const full = await runHeldResolutionWorkflow({
      uid: "inventory-owner",
      job,
      worker: "worker-a",
      now: 1,
      inventory: createFirestoreInventory(primary, 20),
      log,
      knownCollections: ["entries", "notes", "more", "extra"],
      maxDepth: 3,
      providerEvidence: "backup-export",
      backupEvidence: null,
      revision: 2,
    });
    assert.equal(full.status, "blocked");
    if (full.status === "blocked") assert.equal(full.reason, "provider_or_backup_evidence_is_not_a_purge_result");
    const record = await log.read(2);
    assert.equal(record?.status, "complete");
    assert.equal(record?.clockSource, "server");
    assert.ok(record?.remainingPaths.some((path) => path.endsWith("/ghost")));
    assert.ok(record?.remainingPaths.some((path) => path.includes("customDeep") || path.includes("/extra")));
    console.log("production adapters: firestore migration, restore holds and inventory passed");
  } finally {
    if (previousMigration === undefined) delete process.env.CONTENT_KEY_MIGRATION_ENABLED;
    else process.env.CONTENT_KEY_MIGRATION_ENABLED = previousMigration;
    if (previousProtection === undefined) delete process.env.RESTORE_PROTECTION_ACTIVE;
    else process.env.RESTORE_PROTECTION_ACTIVE = previousProtection;
    if (previousHoldDb === undefined) delete process.env.RESTORE_HOLD_DATABASE_ID;
    else process.env.RESTORE_HOLD_DATABASE_ID = previousHoldDb;
    await deleteApp(getApp()).catch(() => undefined);
    await deleteApp(app);
  }
}

if (process.argv.includes("--resume")) {
  resumeCheckpoint().catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
