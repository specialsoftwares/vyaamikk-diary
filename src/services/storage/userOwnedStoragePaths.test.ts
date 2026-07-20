import assert from "node:assert/strict";

import {
  allUserOwnedStoragePrefixes,
  describeUserStorageInventory,
  isObjectOwnedByUser,
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

function main() {
  testPrefixes();
  testOwnership();
  console.log("userOwnedStoragePaths.test.ts: ok");
}

main();
