import assert from "node:assert/strict";

import {
  allUserOwnedStoragePrefixes,
  describeUserStorageInventory,
  isObjectOwnedByUser,
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

function main() {
  testPrefixes();
  testOwnership();
  testPrivateNames();
  console.log("userOwnedStoragePaths.test.ts: ok");
}

main();
