/**
 * Source contract: letterhead setup / asset pick must not request
 * ImagePicker `base64: true` for the template path (avoids huge bridge
 * payloads). Storage must not use uploadString (see userStorage contract).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");

test("setup.tsx template pick uses base64: false and candidate file persist", () => {
  const setup = readFileSync(join(root, "app/(app)/letterhead/setup.tsx"), "utf8");
  assert.match(setup, /base64:\s*false/);
  assert.match(setup, /persistLetterheadCandidateFromAsset/);
  assert.doesNotMatch(setup, /base64:\s*true/);
});

test("letterheadAssetService does not request picker base64", () => {
  const asset = readFileSync(join(here, "letterheadAssetService.ts"), "utf8");
  assert.match(asset, /base64:\s*false/);
  assert.match(asset, /FileSystem\.readAsStringAsync/);
});

test("LetterheadPreview uses contain not stretch", () => {
  const preview = readFileSync(
    join(root, "src/components/letterhead/LetterheadPreview.tsx"),
    "utf8"
  );
  assert.match(preview, /resizeMode="contain"/);
  assert.doesNotMatch(preview, /resizeMode="stretch"/);
});
