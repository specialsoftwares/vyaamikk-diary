import assert from "node:assert/strict";

import {
  assertSameCanonicalAsNormalizeIndian,
  canonicalReviewPhoneFromLocalDigits,
  isPlayReviewCompatiblePhoneE164,
} from "./playReviewPhoneContract";
import { isValidIndianLocalMobile, toE164FromDraft } from "./phoneValidation";
import { normalizePhoneE164 } from "@/utils/mobileHash";

function testIndianUiContract() {
  assert.equal(isValidIndianLocalMobile("9876543210"), true);
  assert.equal(isValidIndianLocalMobile("5876543210"), false);
  assert.equal(isValidIndianLocalMobile("987654321"), false);
  assert.equal(toE164FromDraft("+91", "9876543210"), "+919876543210");
  assert.equal(canonicalReviewPhoneFromLocalDigits("9876543210"), "+919876543210");
  assert.equal(assertSameCanonicalAsNormalizeIndian("9876543210"), "+919876543210");
}

function testPlayReviewCompatibility() {
  assert.equal(isPlayReviewCompatiblePhoneE164("+919876543210"), true);
  assert.equal(isPlayReviewCompatiblePhoneE164("9876543210"), true);
  assert.equal(isPlayReviewCompatiblePhoneE164("+91 98765 43210"), true);
  // Firebase docs often show US test numbers — incompatible with this app UI.
  assert.equal(isPlayReviewCompatiblePhoneE164("+16505553434"), false);
  assert.equal(isPlayReviewCompatiblePhoneE164("+15555550100"), false);
  assert.equal(isPlayReviewCompatiblePhoneE164("+915876543210"), false);
}

function testServerNormalizePreservesPlus() {
  assert.equal(normalizePhoneE164("+919876543210"), "+919876543210");
  assert.equal(normalizePhoneE164("919876543210"), "+919876543210");
}

function main() {
  testIndianUiContract();
  testPlayReviewCompatibility();
  testServerNormalizePreservesPlus();
  console.log("playReviewPhoneContract.test.ts: ok");
}

main();
