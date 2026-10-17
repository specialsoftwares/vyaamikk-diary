/**
 * Executable upload-boundary tests via injected ports (no production network).
 */

import assert from "node:assert/strict";
import test from "node:test";

import { syncSessionOwnership } from "@/sync/syncSessionOwnership";

import {
  buildMediaUploadUrl,
  StorageUploadOwnershipError,
  uploadLocalFileViaMediaApi,
  type MediaUploadPorts,
} from "./userStorageUploadCore";

function makePorts(overrides: Partial<MediaUploadPorts> = {}): MediaUploadPorts & {
  calls: string[];
} {
  const calls: string[] = [];
  const ports: MediaUploadPorts & { calls: string[] } = {
    calls,
    async getLocalBytes() {
      calls.push("getLocalBytes");
      return 1024;
    },
    async getAuthHeaders() {
      calls.push("getAuthHeaders");
      return { Authorization: "Bearer test", "Content-Type": "image/jpeg" };
    },
    buildUploadUrl(path) {
      calls.push("buildUploadUrl");
      return buildMediaUploadUrl(path, {
        bucket: "demo.appspot.com",
        emulatorHost: "127.0.0.1:9199",
      });
    },
    async uploadBinary() {
      calls.push("uploadBinary");
      return { status: 200 };
    },
    async getRemoteSize() {
      calls.push("getRemoteSize");
      return 1024;
    },
    async getDownloadUrl() {
      calls.push("getDownloadUrl");
      return "https://example.test/o";
    },
    ...overrides,
  };
  return ports;
}

test("successful upload verifies metadata size and download URL", async () => {
  syncSessionOwnership.resetForTests();
  const session = syncSessionOwnership.beginSession("alice");
  const ports = makePorts();
  const result = await uploadLocalFileViaMediaApi({
    storagePath: "users/alice/letterhead/a.jpg",
    localUri: "file:///tmp/a.jpg",
    contentType: "image/jpeg",
    userId: "alice",
    session,
    ports,
  });
  assert.equal(result.localBytes, 1024);
  assert.equal(result.remoteBytes, 1024);
  assert.equal(result.downloadUrl, "https://example.test/o");
  assert.deepEqual(ports.calls, [
    "getLocalBytes",
    "getAuthHeaders",
    "buildUploadUrl",
    "uploadBinary",
    "getRemoteSize",
    "getDownloadUrl",
  ]);
});

test("HTTP denial fails before metadata", async () => {
  const ports = makePorts({
    async uploadBinary() {
      return { status: 403 };
    },
  });
  await assert.rejects(
    () =>
      uploadLocalFileViaMediaApi({
        storagePath: "users/alice/letterhead/a.jpg",
        localUri: "file:///tmp/a.jpg",
        contentType: "image/jpeg",
        ports,
      }),
    /HTTP 403/
  );
  assert.ok(!ports.calls.includes("getRemoteSize"));
});

test("size mismatch fails after upload", async () => {
  const ports = makePorts({
    async getRemoteSize() {
      return 12;
    },
  });
  await assert.rejects(
    () =>
      uploadLocalFileViaMediaApi({
        storagePath: "users/alice/letterhead/a.jpg",
        localUri: "file:///tmp/a.jpg",
        contentType: "image/jpeg",
        ports,
      }),
    /size mismatch/
  );
});

test("token failure surfaces before uploadBinary", async () => {
  const ports = makePorts({
    async getAuthHeaders() {
      throw new Error("Not signed in for Storage upload.");
    },
  });
  await assert.rejects(
    () =>
      uploadLocalFileViaMediaApi({
        storagePath: "users/alice/letterhead/a.jpg",
        localUri: "file:///tmp/a.jpg",
        contentType: "image/jpeg",
        ports,
      }),
    /Not signed in/
  );
  assert.ok(!ports.calls.includes("uploadBinary"));
});

test("owner retirement after prep suppresses uploadBinary", async () => {
  syncSessionOwnership.resetForTests();
  const sessionA = syncSessionOwnership.beginSession("alice");
  syncSessionOwnership.beginSession("bob"); // retire A
  const ports = makePorts();
  await assert.rejects(
    () =>
      uploadLocalFileViaMediaApi({
        storagePath: "users/alice/letterhead/a.jpg",
        localUri: "file:///tmp/a.jpg",
        contentType: "image/jpeg",
        userId: "alice",
        session: sessionA,
        ports,
      }),
    (e: unknown) => e instanceof StorageUploadOwnershipError
  );
  assert.ok(!ports.calls.includes("uploadBinary"));
});

test("A→B mid-await after getLocalBytes suppresses upload (does not cancel issued writes)", async () => {
  syncSessionOwnership.resetForTests();
  const sessionA = syncSessionOwnership.beginSession("alice");
  const ports = makePorts();
  ports.getLocalBytes = async () => {
    ports.calls.push("getLocalBytes");
    syncSessionOwnership.beginSession("bob"); // retire A during prep
    return 1024;
  };
  await assert.rejects(
    () =>
      uploadLocalFileViaMediaApi({
        storagePath: "users/alice/letterhead/a.jpg",
        localUri: "file:///tmp/a.jpg",
        contentType: "image/jpeg",
        userId: "alice",
        session: sessionA,
        ports,
      }),
    (e: unknown) => e instanceof StorageUploadOwnershipError
  );
  assert.ok(ports.calls.includes("getLocalBytes"));
  assert.ok(!ports.calls.includes("uploadBinary"));
});

test("A→logout→A mid-await after auth headers suppresses upload", async () => {
  syncSessionOwnership.resetForTests();
  const sessionA1 = syncSessionOwnership.beginSession("alice");
  const ports = makePorts();
  ports.getAuthHeaders = async () => {
    ports.calls.push("getAuthHeaders");
    syncSessionOwnership.endSession();
    syncSessionOwnership.beginSession("alice"); // new generation
    return { Authorization: "Bearer x", "Content-Type": "image/jpeg" };
  };
  await assert.rejects(
    () =>
      uploadLocalFileViaMediaApi({
        storagePath: "users/alice/letterhead/a.jpg",
        localUri: "file:///tmp/a.jpg",
        contentType: "image/jpeg",
        userId: "alice",
        session: sessionA1,
        ports,
      }),
    (e: unknown) => e instanceof StorageUploadOwnershipError
  );
  assert.ok(!ports.calls.includes("uploadBinary"));
});

test("emulator host never builds production URL", () => {
  const prev = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199";
  try {
    const url = buildMediaUploadUrl("users/alice/letterhead/x.jpg", {
      bucket: "demo.appspot.com",
    });
    assert.match(url, /^http:\/\/127\.0\.0\.1:9199\//);
    assert.doesNotMatch(url, /firebasestorage\.googleapis\.com/);
  } finally {
    if (prev === undefined) delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;
    else process.env.FIREBASE_STORAGE_EMULATOR_HOST = prev;
  }
});

test("attachment path shape uses users/{uid}/attachments/", () => {
  const url = buildMediaUploadUrl("users/alice/attachments/rec1/photo.jpg", {
    bucket: "demo.appspot.com",
    emulatorHost: "127.0.0.1:9199",
  });
  assert.match(url, /users%2Falice%2Fattachments%2Frec1%2Fphoto\.jpg|users\/alice\/attachments/);
});
