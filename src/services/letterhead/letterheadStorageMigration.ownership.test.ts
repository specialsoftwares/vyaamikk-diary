/**
 * Production letterhead migration must keep the session captured at entry.
 * A same-UID replacement does not publish the storage path or the completion mark.
 */

import assert from "node:assert/strict";

import { syncSessionOwnership } from "@/sync/syncSessionOwnership";

import {
  runLetterheadStorageMigrationForUser,
  type LetterheadMigrationIo,
} from "./letterheadStorageMigration";

const LEGACY = "data:image/png;base64,aaaa";

function harness(upload: LetterheadMigrationIo["upload"]): {
  io: LetterheadMigrationIo;
  writes: Array<{ storagePath: string }>;
  marks: number;
} {
  const writes: Array<{ storagePath: string }> = [];
  let marks = 0;
  const io: LetterheadMigrationIo = {
    backend: "firebase-production",
    firebaseConfigured: true,
    storageAvailable: true,
    readCompleted: async () => false,
    markCompleted: async () => {
      marks += 1;
    },
    readConfig: async () => ({ exists: true, data: { imageDataUri: LEGACY } }),
    writeConfig: async (_userId, uploaded) => {
      writes.push({ storagePath: uploaded.storagePath });
    },
    upload,
  };
  return {
    io,
    get writes() {
      return writes;
    },
    get marks() {
      return marks;
    },
  };
}

async function main(): Promise<void> {
  syncSessionOwnership.resetForTests();
  const absent = harness(async () => {
    throw new Error("upload without a session");
  });
  await runLetterheadStorageMigrationForUser("owner-a", absent.io);
  assert.equal(absent.writes.length, 0);
  assert.equal(absent.marks, 0);

  syncSessionOwnership.resetForTests();
  const original = syncSessionOwnership.beginSession("owner-a");
  let sawGeneration = 0;
  const replacedDuringRead = harness(async () => {
    throw new Error("upload after the session was replaced");
  });
  const readConfig = replacedDuringRead.io.readConfig;
  replacedDuringRead.io.readConfig = async (userId) => {
    syncSessionOwnership.beginSession("owner-a");
    return readConfig(userId);
  };
  await runLetterheadStorageMigrationForUser("owner-a", replacedDuringRead.io);
  assert.equal(replacedDuringRead.writes.length, 0);
  assert.equal(replacedDuringRead.marks, 0);

  syncSessionOwnership.resetForTests();
  const duringUpload = syncSessionOwnership.beginSession("owner-a");
  const replacedDuringUpload = harness(async (_userId, _uri, _fileName, session) => {
    sawGeneration = session?.generation ?? 0;
    syncSessionOwnership.beginSession("owner-a");
    return { storagePath: "users/owner-a/letterhead/migrated.png", downloadUrl: "https://example.invalid/ticket" };
  });
  await runLetterheadStorageMigrationForUser("owner-a", replacedDuringUpload.io);
  assert.equal(sawGeneration, duringUpload.generation);
  assert.equal(replacedDuringUpload.writes.length, 0);
  assert.equal(replacedDuringUpload.marks, 0);

  syncSessionOwnership.resetForTests();
  syncSessionOwnership.beginSession("owner-a");
  const switched = harness(async () => {
    throw new Error("upload after an account switch");
  });
  switched.io.readConfig = async () => {
    syncSessionOwnership.beginSession("owner-b");
    return { exists: true, data: { imageDataUri: LEGACY } };
  };
  await runLetterheadStorageMigrationForUser("owner-a", switched.io);
  assert.equal(switched.writes.length, 0);

  syncSessionOwnership.resetForTests();
  const stable = syncSessionOwnership.beginSession("owner-a");
  let passedGeneration = 0;
  const kept = harness(async (_userId, _uri, _fileName, session) => {
    passedGeneration = session?.generation ?? 0;
    assert.equal(session?.uid, "owner-a");
    return { storagePath: "users/owner-a/letterhead/kept.png" };
  });
  await runLetterheadStorageMigrationForUser("owner-a", kept.io);
  assert.equal(passedGeneration, stable.generation);
  assert.deepEqual(kept.writes, [{ storagePath: "users/owner-a/letterhead/kept.png" }]);
  assert.equal(kept.marks, 1);
  assert.equal(original.uid, "owner-a");

  syncSessionOwnership.resetForTests();
  console.log("letterheadStorageMigration.ownership.test.ts: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
