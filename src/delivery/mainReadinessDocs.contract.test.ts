/**
 * Reviewer copy and the recorded main-only gaps stay aligned with source.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "../..");
const review = fs.readFileSync(path.join(root, "docs/PLAY_REVIEW_SETUP.md"), "utf8");
const create = fs.readFileSync(path.join(root, "app/(app)/letterhead/create.tsx"), "utf8");
const keyPlan = fs.readFileSync(
  path.join(root, "docs/release/main-android-readiness/content-key-plan.md"),
  "utf8"
);
const grinGap = fs.readFileSync(
  path.join(root, "docs/release/main-android-readiness/grin-protection-gap.md"),
  "utf8"
);

assert.match(create, /does not edit, save, or generate a PDF/);
assert.doesNotMatch(create, /saveLetterheadCreateWithPdf/);
assert.match(review, /Letterhead creation is retired/);
assert.match(review, /internal-grin/);
assert.match(review, /EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` to `"1"/);
assert.match(review, /keep\nthe flag at `"0"/);
assert.doesNotMatch(review, /Intended Internal binaries keep/);
assert.doesNotMatch(review, /\[PLAY_REVIEW_PHONE\]\d/);
assert.match(review, /\[PLAY_REVIEW_PHONE\]/);
assert.match(review, /\[PLAY_REVIEW_CODE\]/);

assert.match(keyPlan, /missing initial key/);
assert.match(keyPlan, /not a lost historical key/);
assert.match(keyPlan, /does not create a key/);
assert.match(grinGap, /does not port it/);
assert.match(grinGap, /vydEvidence: "pending"/);
assert.match(grinGap, /CONTENT_DATA_KEY/);
assert.match(grinGap, /does not provide it/);

console.log("mainReadinessDocs.contract.test.ts: ok");
