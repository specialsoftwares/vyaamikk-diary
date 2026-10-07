import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

test("android adapter requests JPEG + BASE_WITH_FILTER + pageLimit 1", () => {
  const src = readFileSync(join(here, "androidMlKitScanner.ts"), "utf8");
  assert.match(src, /ResultFormatOptions\.JPEG/);
  assert.match(src, /ScannerModeOptions\.BASE_WITH_FILTER/);
  assert.match(src, /pageLimit:\s*options\?\.pageLimit\s*\?\?\s*1/);
  assert.match(src, /galleryImportAllowed:\s*options\?\.galleryImportAllowed\s*\?\?\s*true/);
  assert.doesNotMatch(src, /ResultFormatOptions\.ALL|ResultFormatOptions\.PDF/);
});

test("index gates non-Android to unavailable scanner", () => {
  const src = readFileSync(join(here, "index.ts"), "utf8");
  assert.match(src, /Platform\.OS\s*===\s*"android"/);
  assert.match(src, /createUnavailableDocumentScanner/);
  assert.match(src, /createAndroidMlKitDocumentScanner/);
});

test("unavailable scanner never claims iOS support", () => {
  const src = readFileSync(join(here, "unavailableScanner.ts"), "utf8");
  assert.match(src, /status:\s*"unavailable"/);
  assert.match(src, /canScan:\s*false/);
});
