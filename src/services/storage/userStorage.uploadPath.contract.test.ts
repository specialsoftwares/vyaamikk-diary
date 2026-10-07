/**
 * Contract: letterhead Storage upload must not use firebase `uploadString`
 * (RN ≥ 0.74 BlobManager rejects ArrayBuffer-backed Blobs created during
 * multipart construction — owner error:
 * "Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported").
 *
 * Injected / source check — not a device proof of upload success.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "userStorage.ts"), "utf8");

test("userStorage does not import uploadString", () => {
  assert.doesNotMatch(src, /import\s*\{[^}]*\buploadString\b/);
  assert.doesNotMatch(src, /\bawait\s+uploadString\s*\(/);
});

test("userStorage uploads via Expo File + uploadBytesResumable", () => {
  assert.match(src, /uploadBytesResumable/);
  assert.match(src, /expo-file-system/);
  assert.match(src, /new File\(/);
});

test("uploadLetterheadImage accepts local file URIs", () => {
  assert.match(src, /isLocalFileUri|file:\/\//);
  assert.match(src, /uploadLocalFileToPath/);
});
