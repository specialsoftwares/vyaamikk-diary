/**
 * Geometric header crop. This does not render a PDF and does not detect print.
 */
import assert from "node:assert/strict";

import {
  adjustHeaderCrop,
  headerCropPixels,
  suggestHeaderCrop,
} from "./letterheadHeaderCrop";
import { headerBandHeightPct, headerImageHeightMm } from "./letterheadPlacement";

const wide = suggestHeaderCrop(1600, 280);
assert.equal(wide.height, 1);
assert.equal(wide.originY, 0);
const widePx = headerCropPixels(1600, 280, wide);
assert.equal(widePx.width, 1600);
assert.equal(widePx.height, 280);

const tall = suggestHeaderCrop(1200, 2000);
assert.equal(tall.originY, 0);
assert.ok(tall.height < 0.5);
assert.ok(tall.height >= 0.12);
const tallPx = headerCropPixels(1200, 2000, tall);
assert.ok(tallPx.height < 2000);
assert.equal(tallPx.originX, 0);
assert.ok(headerBandHeightPct(tallPx.width, tallPx.height) <= 42.05);

const shifted = adjustHeaderCrop(1200, 2000, tall, { originY: 0.1, height: 0.05 });
assert.ok(shifted.originY > tall.originY);
assert.ok(headerBandHeightPct(
  headerCropPixels(1200, 2000, shifted).width,
  headerCropPixels(1200, 2000, shifted).height
) <= 42.05);
const pushed = adjustHeaderCrop(1200, 2000, shifted, { originY: 5 });
assert.ok(pushed.originY + pushed.height <= 1.001);

const mm = headerImageHeightMm(tallPx.width, tallPx.height);
const pct = headerBandHeightPct(tallPx.width, tallPx.height);
assert.ok(Math.abs(mm - (pct / 100) * 11.6929 * 25.4) < 0.2);

console.log("letterheadHeaderCrop.test.ts: ok — suggestion is geometric");
