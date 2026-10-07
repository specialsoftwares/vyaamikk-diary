/**
 * Injected contracts for candidate ownership, size policy, and cleanup.
 * Source-only — avoid importing RN Image under node --test.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const src = fs.readFileSync(
  path.join(import.meta.dirname, "letterheadCandidateImage.ts"),
  "utf8"
);
const setupSrc = fs.readFileSync(
  path.join(import.meta.dirname, "../../../app/(app)/letterhead/setup.tsx"),
  "utf8"
);

test("candidate uses SyncSessionToken, not fileGeneration as auth", () => {
  assert.match(src, /sessionGeneration/);
  assert.match(src, /beginLetterheadCapture/);
  assert.match(src, /mayIssueRemoteWork/);
  assert.match(src, /captureAdmissionToken/);
  assert.match(src, /fileGeneration/);
  assert.match(src, /not an auth token/);
});

test("long-edge oversize is rejected (not a no-op)", () => {
  assert.match(src, /MAX_TEMPLATE_LONG_EDGE_PX = 3500/);
  assert.match(src, /longEdge > MAX_TEMPLATE_LONG_EDGE_PX/);
  assert.match(src, /throw new LetterheadCandidateError\("too_large"\)/);
});

test("MIME is sniffed from magic bytes; unsupported formats rejected", () => {
  assert.match(src, /sniffImageMime/);
  assert.match(src, /unsupported_format/);
  assert.match(src, /\/9j\//);
});

test("scanner/local files read dimensions via Image.getSize when missing", () => {
  assert.match(src, /Image\.getSize/);
});

test("setup cleans candidate via ref on unmount, not null-closing effect", () => {
  assert.match(setupSrc, /candidateRef/);
  assert.match(setupSrc, /mountedRef/);
  assert.match(setupSrc, /retireLetterheadCandidate\(owned\)/);
  assert.doesNotMatch(
    setupSrc,
    /useEffect\(\(\) => \{\s*return \(\) => \{\s*void retireLetterheadCandidate\(candidate\)/
  );
});

test("setup does not delete inside setState updater", () => {
  assert.doesNotMatch(setupSrc, /setCandidate\(\(prev\).*retireLetterheadCandidate/);
});

test("assertCandidateOwner rechecks live sync generation", () => {
  assert.match(src, /live\.generation !== candidate\.sessionGeneration/);
});
