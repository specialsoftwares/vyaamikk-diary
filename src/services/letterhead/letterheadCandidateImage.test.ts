/**
 * Source/injected contracts for candidate ownership helpers.
 * Avoids importing expo-file-system / react-native under plain node --test.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "letterheadCandidateImage.ts"), "utf8");

test("candidate persist copies file without ImagePicker base64 requirement", () => {
  assert.match(src, /FileSystem\.copyAsync/);
  assert.match(src, /assertCandidateOwner/);
  assert.match(src, /wrong_owner/);
  assert.match(src, /MAX_TEMPLATE_COMPRESSED_BYTES\s*=\s*4\s*\*\s*1024\s*\*\s*1024/);
});

test("candidate module retires local files on replace", () => {
  assert.match(src, /retireLetterheadCandidate/);
  assert.match(src, /deleteAsync/);
});
