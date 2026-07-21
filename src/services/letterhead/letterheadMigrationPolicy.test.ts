import assert from "node:assert/strict";

import {
  isLetterheadMigrationSuccessError,
  letterheadMigrationStorageKey,
  shouldRunLetterheadStorageMigration,
} from "./letterheadMigrationPolicy";

assert.equal(
  shouldRunLetterheadStorageMigration({
    userId: "u1",
    backend: "local-mock",
    firebaseConfigured: true,
    storageAvailable: true,
    alreadyCompletedForVersion: false,
  }),
  false,
  "local-mock must never touch Firebase for letterhead migration"
);

assert.equal(
  shouldRunLetterheadStorageMigration({
    userId: "u1",
    backend: "firebase-shared-dev",
    firebaseConfigured: true,
    storageAvailable: true,
    alreadyCompletedForVersion: false,
  }),
  true
);

assert.equal(
  shouldRunLetterheadStorageMigration({
    userId: "u1",
    backend: "firebase-production",
    firebaseConfigured: true,
    storageAvailable: true,
    alreadyCompletedForVersion: true,
  }),
  false,
  "completed version must not re-run"
);

assert.equal(
  shouldRunLetterheadStorageMigration({
    userId: "",
    backend: "firebase-shared-dev",
    firebaseConfigured: true,
    storageAvailable: true,
    alreadyCompletedForVersion: false,
  }),
  false
);

assert.equal(
  shouldRunLetterheadStorageMigration({
    userId: "u1",
    backend: "firebase-shared-dev",
    firebaseConfigured: false,
    storageAvailable: true,
    alreadyCompletedForVersion: false,
  }),
  false
);

assert.equal(isLetterheadMigrationSuccessError({ code: "permission-denied" }), false);
assert.equal(letterheadMigrationStorageKey("abc"), "letterhead.storageMigration.v1:abc");

console.log("letterheadMigrationPolicy.test.ts: ok");
