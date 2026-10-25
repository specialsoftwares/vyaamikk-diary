import assert from "node:assert/strict";

import {
  allocateOpaqueUserStoragePath,
  allUserOwnedStoragePrefixes,
  describeUserStorageInventory,
  isObjectOwnedByUser,
  isOpaqueStorageObjectName,
  objectNameEmbedsPrivateContent,
  userStorageRootPrefix,
} from "./userOwnedStoragePaths";

function testPrefixes() {
  const uid = "userABC";
  assert.equal(userStorageRootPrefix(uid), "users/userABC/");
  const prefixes = allUserOwnedStoragePrefixes(uid);
  assert.deepEqual(prefixes, [
    "users/userABC/letterhead/",
    "users/userABC/attachments/",
    "users/userABC/pdfs/",
  ]);
  assert.equal(describeUserStorageInventory(uid).length, 3);
}

function testOwnership() {
  const uid = "u1";
  assert.equal(isObjectOwnedByUser(uid, "users/u1/letterhead/a.png"), true);
  assert.equal(isObjectOwnedByUser(uid, "users/u1/attachments/rec/x.jpg"), true);
  assert.equal(isObjectOwnedByUser(uid, "users/u1/pdfs/rec/d.pdf"), true);
  assert.equal(isObjectOwnedByUser(uid, "users/u1/"), false);
  assert.equal(isObjectOwnedByUser(uid, "users/u2/letterhead/a.png"), false);
  assert.equal(isObjectOwnedByUser(uid, "users/u1/../u2/x"), false);
  assert.equal(isObjectOwnedByUser(uid, "other/u1/letterhead/a.png"), false);
}

function testPrivateNames() {
  assert.equal(objectNameEmbedsPrivateContent("a.png"), false);
  assert.equal(objectNameEmbedsPrivateContent("rec-1"), false);
  assert.equal(objectNameEmbedsPrivateContent("priya@example.com.pdf"), true);
  assert.equal(objectNameEmbedsPrivateContent("scan-+919876543210.jpg"), true);
}

function testOpaqueNames() {
  let n = 0;
  const allocated = allocateOpaqueUserStoragePath({
    userId: "userABC",
    category: "attachments",
    recordId: "rec-1",
    displayName: "priya@example.com.pdf",
    extension: "pdf",
    random: () => {
      n += 1;
      return (n % 36) / 36;
    },
  });
  assert.equal(allocated.displayName, "priya@example.com.pdf");
  assert.equal(allocated.storagePath.includes("priya"), false);
  assert.equal(allocated.storagePath.includes("@"), false);
  assert.equal(isOpaqueStorageObjectName(allocated.objectName), true);
  assert.equal(isObjectOwnedByUser("userABC", allocated.storagePath), true);
  assert.equal(isObjectOwnedByUser("userABC", "users/userABC/attachments/rec-1/photo.jpg"), true);
}

function main() {
  testPrefixes();
  testOwnership();
  testPrivateNames();
  testOpaqueNames();
  console.log("userOwnedStoragePaths.test.ts: ok");
}

main();
