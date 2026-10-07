/**
 * Joined Storage emulator test: production uploadLocalFileViaMediaApi core +
 * actual media-REST request shape through a host transport adapter.
 *
 * - Owner success + downloaded-byte equality
 * - Anonymous / cross-owner denial
 * - No Admin bypass, production endpoints, or production credentials
 * - Native Expo uploadAsync remains device-pending
 *
 * Keep letterheadStorage.emulator.test.ts as the Rules SDK (uploadBytes) suite.
 */

import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { createMockUserToken } from "@firebase/util";
import { getBytes, getMetadata, ref } from "firebase/storage";

import {
  buildMediaUploadUrl,
  uploadLocalFileViaMediaApi,
  type MediaUploadPorts,
} from "./userStorageUploadCore";

const PROJECT_ID = "vyaamikk-diary-storage-rules-test";
const RULES_PATH = resolve(process.cwd(), "storage.rules");

/**
 * Same mock JWT the Firebase JS SDK attaches via `useEmulator({ mockUserToken })`.
 * Never use the special "owner" Admin-bypass token.
 */
function mockUserBearerToken(uid: string): string {
  return createMockUserToken({ sub: uid, user_id: uid }, PROJECT_ID);
}

/**
 * Host transport for the production upload core against the Storage emulator.
 *
 * Production builds `uploadType=media` URLs (asserted). The Storage emulator's
 * media one-shot does not copy HTTP Content-Type onto `request.resource`, so
 * image/* Rules fail even for a valid owner. The adapter therefore posts
 * multipart to the same `/v0/b/.../o` endpoint (metadata includes contentType)
 * with Firebase-scheme mock auth — still no Admin bypass / production host.
 */
function hostMediaRestPorts(uid: string | null): MediaUploadPorts {
  const emulatorHost =
    process.env.FIREBASE_STORAGE_EMULATOR_HOST?.trim() || "127.0.0.1:9199";
  return {
    async getLocalBytes(localUri) {
      const filePath = localUri.replace(/^file:\/\//, "");
      return readFileSync(filePath).byteLength;
    },
    async getAuthHeaders(contentType) {
      if (!uid) {
        throw new Error("Not signed in for Storage upload.");
      }
      // Emulator mock tokens use the Firebase scheme (JS SDK). Production Expo
      // path sends Bearer Google ID tokens to firebasestorage.googleapis.com.
      return {
        Authorization: `Firebase ${mockUserBearerToken(uid)}`,
        "Content-Type": contentType,
      };
    },
    buildUploadUrl(storagePath) {
      // Production helper always emits uploadType=media.
      const mediaUrl = buildMediaUploadUrl(storagePath, {
        bucket: PROJECT_ID,
        emulatorHost,
      });
      assert.match(mediaUrl, /uploadType=media/);
      assert.doesNotMatch(mediaUrl, /firebasestorage\.googleapis\.com/);
      // Emulator selects multipart via X-Goog-Upload-Protocol (JS SDK); keep name=.
      return mediaUrl.replace("uploadType=media", "uploadType=multipart");
    },
    async uploadBinary({ url, localUri, headers }) {
      assert.doesNotMatch(url, /firebasestorage\.googleapis\.com/);
      assert.match(url, /\/v0\/b\/.+\/o\?/);
      const filePath = localUri.replace(/^file:\/\//, "");
      const bytes = readFileSync(filePath);
      const contentType = headers["Content-Type"] || "application/octet-stream";
      const boundary = `vydboundary${Date.now()}`;
      const meta = JSON.stringify({ contentType });
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${meta}\r\n` +
            `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`
        ),
        bytes,
        Buffer.from(`\r\n--${boundary}--`),
      ]);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: headers.Authorization,
          "X-Goog-Upload-Protocol": "multipart",
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      });
      return { status: res.status, body: await res.text() };
    },
    async getRemoteSize() {
      return -1;
    },
    async getDownloadUrl() {
      return undefined;
    },
  };
}

async function main() {
  process.env.FIREBASE_STORAGE_EMULATOR_HOST =
    process.env.FIREBASE_STORAGE_EMULATOR_HOST || "127.0.0.1:9199";

  const probeUrl = buildMediaUploadUrl("users/alice/letterhead/probe.jpg", {
    bucket: PROJECT_ID,
  });
  assert.match(probeUrl, /^http:\/\//);
  assert.doesNotMatch(probeUrl, /firebasestorage\.googleapis\.com/);
  assert.match(probeUrl, /uploadType=media/);

  const rules = readFileSync(RULES_PATH, "utf8");
  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: { rules },
  });

  const dir = mkdtempSync(join(tmpdir(), "lh-media-rest-"));
  const fixturePath = join(dir, "letterhead.jpg");
  const fixture = Buffer.from("letterhead-media-rest-fixture-v1-bytes");
  writeFileSync(fixturePath, fixture);
  const localUri = `file://${fixturePath}`;

  try {
    const aliceStorage = testEnv.authenticatedContext("alice").storage();
    const malloryStorage = testEnv.authenticatedContext("mallory").storage();
    const anonStorage = testEnv.unauthenticatedContext().storage();

    const alicePorts: MediaUploadPorts = {
      ...hostMediaRestPorts("alice"),
      async getRemoteSize(storagePath) {
        const meta = await getMetadata(ref(aliceStorage, storagePath));
        return typeof meta.size === "number" ? meta.size : -1;
      },
      async getDownloadUrl() {
        return undefined;
      },
    };

    const storagePath = "users/alice/letterhead/media-rest-sample.jpg";
    const verified = await uploadLocalFileViaMediaApi({
      storagePath,
      localUri,
      contentType: "image/jpeg",
      userId: "alice",
      ports: alicePorts,
    });
    assert.equal(verified.localBytes, fixture.byteLength);
    assert.equal(verified.remoteBytes, fixture.byteLength);

    const downloaded = Buffer.from(await getBytes(ref(aliceStorage, storagePath)));
    assert.deepEqual(downloaded, fixture);

    // Cross-owner denial via media REST (same production helper).
    const malloryPorts = hostMediaRestPorts("mallory");
    await assert.rejects(
      () =>
        uploadLocalFileViaMediaApi({
          storagePath: "users/alice/letterhead/hack-from-mallory.jpg",
          localUri,
          contentType: "image/jpeg",
          userId: "mallory",
          ports: malloryPorts,
        }),
      /HTTP (403|401)/
    );
    await assertFails(getBytes(ref(malloryStorage, storagePath)));

    // Anonymous denial — auth header failure before upload, and direct read fail.
    await assert.rejects(
      () =>
        uploadLocalFileViaMediaApi({
          storagePath: "users/alice/letterhead/anon.jpg",
          localUri,
          contentType: "image/jpeg",
          ports: hostMediaRestPorts(null),
        }),
      /Not signed in/
    );
    await assertFails(getBytes(ref(anonStorage, storagePath)));

    // Attachment path through the same media-REST helper.
    const attachPath = "users/alice/attachments/rec1/photo.jpg";
    const attachPorts: MediaUploadPorts = {
      ...hostMediaRestPorts("alice"),
      async getRemoteSize(storagePathInner) {
        const meta = await getMetadata(ref(aliceStorage, storagePathInner));
        return typeof meta.size === "number" ? meta.size : -1;
      },
    };
    const attach = await uploadLocalFileViaMediaApi({
      storagePath: attachPath,
      localUri,
      contentType: "image/jpeg",
      userId: "alice",
      ports: attachPorts,
    });
    assert.equal(attach.remoteBytes, fixture.byteLength);
    assert.deepEqual(
      Buffer.from(await getBytes(ref(aliceStorage, attachPath))),
      fixture
    );
    await assertFails(getBytes(ref(malloryStorage, attachPath)));

    console.log("letterheadMediaRest.emulator.test.ts: ok");
  } finally {
    await testEnv.cleanup();
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
