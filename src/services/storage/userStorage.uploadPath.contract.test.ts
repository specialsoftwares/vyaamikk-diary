/**
 * Letterhead / attachment upload path: no uploadString; media REST upload.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const src = fs.readFileSync(path.join(import.meta.dirname, "userStorage.ts"), "utf8");
const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

test("userStorage does not import uploadString", () => {
  assert.doesNotMatch(codeOnly, /\buploadString\b/);
});

test("userStorage does not pass Expo File into uploadBytesResumable", () => {
  assert.doesNotMatch(codeOnly, /uploadBytesResumable/);
  assert.match(codeOnly, /uploadLocalFileViaMediaApi/);
});

test("uploadLetterheadImage accepts local file URIs", () => {
  assert.match(codeOnly, /isLocalFileUri/);
  assert.match(codeOnly, /uploadLocalFileToPath/);
});
