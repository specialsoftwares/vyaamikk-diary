import assert from "node:assert/strict";
import test from "node:test";

import {
  isLetterheadGeneratedLayout,
  validateWritingMargins,
} from "./letterheadGeneratedLayout";

test("validateWritingMargins accepts defaults", () => {
  assert.equal(
    validateWritingMargins({ topPct: 19, bottomPct: 11, leftPct: 12, rightPct: 12 }).ok,
    true
  );
});

test("validateWritingMargins rejects collapsed writing area", () => {
  const r = validateWritingMargins({
    topPct: 50,
    bottomPct: 50,
    leftPct: 12,
    rightPct: 12,
  });
  assert.equal(r.ok, false);
});

test("isLetterheadGeneratedLayout accepts v1 shapes", () => {
  assert.equal(
    isLetterheadGeneratedLayout({
      version: 1,
      logoAlign: "left",
      appearance: "original",
      businessName: "Shop",
      address: null,
      contact: null,
      gstin: null,
      logoUri: null,
    }),
    true
  );
  assert.equal(isLetterheadGeneratedLayout({ version: 2 }), false);
});
