/**
 * Behavioral contracts for the Storage upload boundary on RN ≥ 0.74.
 * Source-inspected against locked firebase / expo-file-system packages.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.join(import.meta.dirname, "../../..");
const uploadSrc = fs.readFileSync(
  path.join(import.meta.dirname, "userStorageUpload.ts"),
  "utf8"
);
const coreSrc = fs.readFileSync(
  path.join(import.meta.dirname, "userStorageUploadCore.ts"),
  "utf8"
);
const storageSrc = fs.readFileSync(path.join(import.meta.dirname, "userStorage.ts"), "utf8");

test("multipart threshold matches Firebase JS SDK (256 KiB)", () => {
  assert.match(coreSrc, /FIREBASE_STORAGE_MULTIPART_THRESHOLD_BYTES = 256 \* 1024/);
  const sdk = fs.readFileSync(
    path.join(root, "node_modules/@firebase/storage/dist/index.esm.js"),
    "utf8"
  );
  assert.match(sdk, /blob\.size\(\) > 256 \* 1024/);
});

test("Expo File is not a runtime Blob; slice builds ArrayBufferView Blob", () => {
  const src = fs.readFileSync(
    path.join(root, "node_modules/expo-file-system/src/FileSystem.ts"),
    "utf8"
  );
  assert.match(src, /export class File extends ExpoFileSystem\.FileSystemFile implements Blob/);
  assert.match(src, /new Blob\(\[this\.bytesSync\(\)\.slice/);
});

test("Firebase FbsBlob only accepts native Blob | ArrayBuffer | Uint8Array", () => {
  const src = fs.readFileSync(
    path.join(root, "node_modules/@firebase/storage/dist/index.esm.js"),
    "utf8"
  );
  assert.match(src, /p instanceof Blob/);
  assert.match(src, /FbsBlob\.getBlob\(preBlobPart, blob, postBlobPart\)/);
});

test("userStorage upload path uses media REST + uploadAsync, not uploadBytesResumable(File)", () => {
  const storageCode = storageSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(storageCode, /uploadBytesResumable/);
  assert.doesNotMatch(storageCode, /\buploadString\b/);
  assert.match(storageCode, /uploadLocalFileViaMediaApi/);
  assert.match(uploadSrc, /uploadAsync/);
  assert.match(uploadSrc, /FileSystemUploadType\.BINARY_CONTENT/);
  assert.match(coreSrc, /remoteBytes !== localBytes/);
  assert.match(uploadSrc, /Authorization/);
  assert.match(uploadSrc, /Bearer/);
  assert.match(coreSrc, /Refusing production Storage URL while emulator host is set/);
});

test("production default media request construction (endpoint, query, binary, content-type, auth header)", async () => {
  const { buildMediaUploadUrl } = await import("./userStorageUploadCore");
  const prev = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  try {
    const url = buildMediaUploadUrl("users/alice/letterhead/sample.jpg", {
      bucket: "vyaamikk-diary.appspot.com",
      emulatorHost: null,
    });
    assert.match(url, /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\//);
    assert.match(url, /\/o\?name=/);
    assert.match(url, /uploadType=media/);
    assert.doesNotMatch(url, /uploadType=multipart/);
  } finally {
    if (prev === undefined) delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;
    else process.env.FIREBASE_STORAGE_EMULATOR_HOST = prev;
  }

  // Production ports: raw binary upload type, Content-Type, Authorization present
  // (Bearer scheme). Do not assert or print token values.
  assert.match(uploadSrc, /FileSystemUploadType\.BINARY_CONTENT/);
  assert.match(uploadSrc, /httpMethod:\s*"POST"/);
  assert.match(uploadSrc, /Authorization:\s*`Bearer \$\{idToken\}`/);
  assert.match(uploadSrc, /"Content-Type":\s*contentType/);
  assert.match(uploadSrc, /createDefaultMediaUploadPorts/);
  // Emulator multipart adapter is separately labelled — not this production path.
  const mediaRest = fs.readFileSync(
    path.join(import.meta.dirname, "letterheadMediaRest.emulator.test.ts"),
    "utf8"
  );
  assert.match(mediaRest, /EMULATOR_MULTIPART_ADAPTER/);
  assert.match(mediaRest, /NOT[\s\S]*identical production wire-format/);
});

test("attachment helpers share the same media upload path", () => {
  assert.match(storageSrc, /export async function uploadRecordAttachment/);
  assert.match(storageSrc, /uploadBase64ToPath/);
  assert.match(storageSrc, /return await uploadLocalFileToPath/);
});
