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

test("attachment helpers share the same media upload path", () => {
  assert.match(storageSrc, /export async function uploadRecordAttachment/);
  assert.match(storageSrc, /uploadBase64ToPath/);
  assert.match(storageSrc, /return await uploadLocalFileToPath/);
});
