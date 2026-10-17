import assert from "node:assert/strict";
import test from "node:test";

import {
  isWebpRiffBytes,
  ownedCandidateTempUris,
  sniffImageMimeFromBase64Head,
} from "./letterheadImageMime";

test("admits JPEG and PNG magic", () => {
  assert.equal(sniffImageMimeFromBase64Head("/9j/4AAQ"), "image/jpeg");
  assert.equal(sniffImageMimeFromBase64Head("iVBORw0KGgo"), "image/png");
});

test("WebP requires RIFF and WEBP — RIFF alone is rejected", () => {
  // Synthetic: UklGR without V0VC (WEBP)
  assert.equal(sniffImageMimeFromBase64Head("UklGRAAAAAAA"), null);
  // With WEBP marker
  assert.equal(sniffImageMimeFromBase64Head("UklGRxxxV0VC"), "image/webp");
});

test("isWebpRiffBytes checks byte tags", () => {
  const ok = new Uint8Array(12);
  ok.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  ok.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  assert.equal(isWebpRiffBytes(ok), true);
  const riffOnly = new Uint8Array(12);
  riffOnly.set([0x52, 0x49, 0x46, 0x46], 0);
  assert.equal(isWebpRiffBytes(riffOnly), false);
});

test("picker image/* MIME is never implied by sniff helper", () => {
  assert.equal(sniffImageMimeFromBase64Head("notanimage"), null);
});

test("ownedCandidateTempUris tracks staging and final for cleanup", () => {
  assert.deepEqual(ownedCandidateTempUris("/s.bin", null), ["/s.bin"]);
  assert.deepEqual(ownedCandidateTempUris("/s.bin", "/s.jpg"), ["/s.bin", "/s.jpg"]);
});
