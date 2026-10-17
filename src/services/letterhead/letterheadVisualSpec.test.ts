import assert from "node:assert/strict";
import test from "node:test";

import {
  APPEARANCE_CSS_FILTER,
  generatedHeaderFlex,
  IMPORTED_PAGE_FIT,
  IMPORTED_PAGE_POSITION,
  pdfAlignClass,
} from "./letterheadVisualSpec";

test("right alignment uses row-reverse + flex-start (matches PDF CSS)", () => {
  const right = generatedHeaderFlex("right");
  assert.equal(right.flexDirection, "row-reverse");
  assert.equal(right.justifyContent, "flex-start");
  assert.equal(pdfAlignClass("right"), "align-right");
});

test("imported page fit is contain + top center", () => {
  assert.equal(IMPORTED_PAGE_FIT, "contain");
  assert.equal(IMPORTED_PAGE_POSITION, "top center");
});

test("mono is high-contrast grayscale, not opacity", () => {
  assert.match(APPEARANCE_CSS_FILTER.mono, /contrast\(3\)/);
  assert.doesNotMatch(APPEARANCE_CSS_FILTER.mono, /opacity/);
  assert.equal(APPEARANCE_CSS_FILTER.original, "none");
  assert.equal(APPEARANCE_CSS_FILTER.color, "none");
});
