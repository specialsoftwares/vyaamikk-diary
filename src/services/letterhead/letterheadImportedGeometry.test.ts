import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { computeImportedContainLayout } from "./letterheadImportedGeometry";

test("tall 400×800 in 210×297 → 148.5×297 (height-limited)", () => {
  const layout = computeImportedContainLayout({
    frameWidth: 210,
    frameHeight: 297,
    imageWidth: 400,
    imageHeight: 800,
  });
  assert.ok(Math.abs(layout.width - 148.5) < 1e-9);
  assert.ok(Math.abs(layout.height - 297) < 1e-9);
  assert.equal(layout.top, 0);
  assert.ok(Math.abs(layout.left - (210 - 148.5) / 2) < 1e-9);
});

test("wide 800×400 in 210×297 → 210×105 (width-limited)", () => {
  const layout = computeImportedContainLayout({
    frameWidth: 210,
    frameHeight: 297,
    imageWidth: 800,
    imageHeight: 400,
  });
  assert.ok(Math.abs(layout.width - 210) < 1e-9);
  assert.ok(Math.abs(layout.height - 105) < 1e-9);
  assert.equal(layout.top, 0);
  assert.equal(layout.left, 0);
});

test("A4 210×297 in 210×297 fills the frame", () => {
  const layout = computeImportedContainLayout({
    frameWidth: 210,
    frameHeight: 297,
    imageWidth: 210,
    imageHeight: 297,
  });
  assert.ok(Math.abs(layout.width - 210) < 1e-9);
  assert.ok(Math.abs(layout.height - 297) < 1e-9);
  assert.equal(layout.left, 0);
  assert.equal(layout.top, 0);
});

test("unknown dimensions use A4 aspect without overflowing the frame", () => {
  const layout = computeImportedContainLayout({
    frameWidth: 210,
    frameHeight: 297,
    imageWidth: null,
    imageHeight: null,
  });
  assert.ok(layout.width <= 210 + 1e-9);
  assert.ok(layout.height <= 297 + 1e-9);
  assert.equal(layout.top, 0);
  assert.ok(layout.left >= 0);
});

test("never produces layout taller/wider than the frame", () => {
  for (const [iw, ih] of [
    [400, 800],
    [800, 400],
    [595, 842],
    [1, 10000],
    [10000, 1],
  ] as const) {
    const layout = computeImportedContainLayout({
      frameWidth: 210,
      frameHeight: 297,
      imageWidth: iw,
      imageHeight: ih,
    });
    assert.ok(layout.width <= 210 + 1e-6, `${iw}x${ih} width`);
    assert.ok(layout.height <= 297 + 1e-6, `${iw}x${ih} height`);
  }
});

test("setup and LetterheadPreview both use ImportedLetterheadImage + geometry helper", () => {
  const root = path.join(import.meta.dirname, "../../..");
  const setup = fs.readFileSync(
    path.join(root, "app/(app)/letterhead/setup.tsx"),
    "utf8"
  );
  const preview = fs.readFileSync(
    path.join(root, "src/components/letterhead/LetterheadPreview.tsx"),
    "utf8"
  );
  const component = fs.readFileSync(
    path.join(root, "src/components/letterhead/ImportedLetterheadImage.tsx"),
    "utf8"
  );
  assert.match(setup, /ImportedLetterheadImage/);
  assert.match(preview, /ImportedLetterheadImage/);
  assert.match(component, /computeImportedContainLayout/);
  assert.doesNotMatch(component, /width:\s*["']100%["']/);
});
