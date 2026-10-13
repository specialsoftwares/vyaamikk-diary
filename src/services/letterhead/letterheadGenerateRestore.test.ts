/**
 * The logo-layout editor is retired. Margin validation stays for stored
 * generated layouts that older records still deserialize.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { validateWritingMargins } from "./letterheadGeneratedLayout";

test("generate route does not apply the live profile logo", () => {
  const generateSrc = fs.readFileSync(
    path.join(import.meta.dirname, "../../../app/(app)/letterhead/generate.tsx"),
    "utf8"
  );
  assert.match(generateSrc, /Redirect href="\/\(app\)\/letterhead\/history"/);
  assert.doesNotMatch(generateSrc, /applyProfileAsNew|logoForSave|validateWritingMargins\(/);
});

test("stored writing margins still reject an overflowing area", () => {
  assert.equal(
    validateWritingMargins({ topPct: 50, bottomPct: 50, leftPct: 10, rightPct: 10 }).ok,
    false
  );
});
