/**
 * Generate screen must restore saved layout on Edit (not silent profile overwrite).
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { validateWritingMargins } from "./letterheadGeneratedLayout";

const generateSrc = fs.readFileSync(
  path.join(import.meta.dirname, "../../../app/(app)/letterhead/generate.tsx"),
  "utf8"
);

test("generate restores saved layout before editing", () => {
  assert.match(generateSrc, /restoreSaved/);
  assert.match(generateSrc, /sourceType === "generated_layout"/);
  assert.match(generateSrc, /genRefreshProfile/);
  assert.match(generateSrc, /applyProfileAsNew/);
});

test("generate refuses device-local logo URIs as durable assets", () => {
  assert.match(generateSrc, /isDurableLogoUri/);
  assert.match(generateSrc, /startsWith\("data:"\)/);
  assert.doesNotMatch(
    generateSrc,
    /logoForSave = includeLogo\s*\?\s*logoDataUri \?\? baseline\.logoUri/
  );
});

test("generate validates writing margins before save", () => {
  assert.match(generateSrc, /validateWritingMargins\(margins\)/);
  assert.equal(
    validateWritingMargins({ topPct: 50, bottomPct: 50, leftPct: 10, rightPct: 10 }).ok,
    false
  );
});

test("generate includes logo bytes in size validation", () => {
  assert.match(generateSrc, /logoBytes > 700_000/);
});
