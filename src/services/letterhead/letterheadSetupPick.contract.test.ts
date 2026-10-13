/**
 * Letterhead template picking is no longer a product path.
 * Shared attachment upload still refuses uploadString and huge base64 payloads.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");

test("retired letterhead screens do not pick or scan a template", () => {
  for (const rel of [
    "app/(app)/letterhead/setup.tsx",
    "app/(app)/letterhead/generate.tsx",
    "app/(app)/letterhead/index.tsx",
  ]) {
    const src = readFileSync(join(root, rel), "utf8");
    assert.match(src, /Redirect href="\/\(app\)\/letterhead\/history"/);
    assert.doesNotMatch(src, /ImagePicker|launchDocumentScanner|base64:\s*true|persistLetterheadCandidate/);
  }
});

test("shared storage upload does not use uploadString", () => {
  const storage = readFileSync(join(root, "src/services/storage/userStorage.ts"), "utf8");
  assert.doesNotMatch(storage, /uploadString\(/);
});
