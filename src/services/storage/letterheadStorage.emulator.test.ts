/**
 * Rules SDK suite (labelled accurately): owner allow / anon+cross-owner deny
 * for letterhead and attachment paths via Firebase JS `uploadBytes` against the
 * Storage emulator. Not Admin bypass. Not the production media-REST upload path
 * (see letterheadMediaRest.emulator.test.ts for that joined suite).
 *
 * Verifies downloaded bytes. Does not call production endpoints.
 *
 * Run via: firebase emulators:exec --only storage (see package.json script).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { getBytes, ref, uploadBytes } from "firebase/storage";

import { buildMediaUploadUrl } from "./userStorageUploadCore";

const PROJECT_ID = "vyaamikk-diary-storage-rules-test";
const RULES_PATH = resolve(process.cwd(), "storage.rules");

async function main() {
  // Guard: helper must not emit production host when emulator env is set.
  process.env.FIREBASE_STORAGE_EMULATOR_HOST =
    process.env.FIREBASE_STORAGE_EMULATOR_HOST || "127.0.0.1:9199";
  const mediaUrl = buildMediaUploadUrl("users/alice/letterhead/sample.jpg", {
    bucket: `${PROJECT_ID}.appspot.com`,
  });
  assert.match(mediaUrl, /^http:\/\//);
  assert.doesNotMatch(mediaUrl, /firebasestorage\.googleapis\.com/);

  const rules = readFileSync(RULES_PATH, "utf8");
  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: { rules },
  });

  const fixture = Buffer.from("letterhead-fixture-bytes-v1");
  const attachFixture = Buffer.from("attachment-fixture-bytes-v1");

  try {
    const alice = testEnv.authenticatedContext("alice").storage();
    const mallory = testEnv.authenticatedContext("mallory").storage();
    const anon = testEnv.unauthenticatedContext().storage();

    await assertSucceeds(
      uploadBytes(ref(alice, "users/alice/letterhead/sample.jpg"), fixture, {
        contentType: "image/jpeg",
      })
    );
    const downloaded = Buffer.from(
      await getBytes(ref(alice, "users/alice/letterhead/sample.jpg"))
    );
    assert.deepEqual(downloaded, fixture);

    await assertFails(
      uploadBytes(ref(mallory, "users/alice/letterhead/hack.jpg"), Buffer.from("x"), {
        contentType: "image/jpeg",
      })
    );
    await assertFails(getBytes(ref(mallory, "users/alice/letterhead/sample.jpg")));
    await assertFails(getBytes(ref(anon, "users/alice/letterhead/sample.jpg")));
    await assertFails(
      uploadBytes(ref(anon, "users/alice/letterhead/anon.jpg"), Buffer.from("x"))
    );

    await assertSucceeds(
      uploadBytes(
        ref(alice, "users/alice/attachments/rec1/photo.jpg"),
        attachFixture,
        { contentType: "image/jpeg" }
      )
    );
    const attachDown = Buffer.from(
      await getBytes(ref(alice, "users/alice/attachments/rec1/photo.jpg"))
    );
    assert.deepEqual(attachDown, attachFixture);
    await assertFails(
      getBytes(ref(mallory, "users/alice/attachments/rec1/photo.jpg"))
    );

    console.log("letterheadStorage.emulator.test.ts: ok");
  } finally {
    await testEnv.cleanup();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
