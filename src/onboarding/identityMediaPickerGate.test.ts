import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  canStartPickerInvocation,
  isPickerCancelError,
  pickerHostIsReady,
  shouldDeferPickerLaunch,
  shouldRequestMediaLibraryPermissionBeforeLaunch,
} from "@/onboarding/identityMediaPickerGate";

const root = join(__dirname, "../..");

assert.equal(shouldRequestMediaLibraryPermissionBeforeLaunch("android"), false);
assert.equal(shouldRequestMediaLibraryPermissionBeforeLaunch("ios"), true);
assert.equal(pickerHostIsReady("active"), true);
assert.equal(pickerHostIsReady("inactive"), false);
assert.equal(shouldDeferPickerLaunch("background"), true);
assert.equal(canStartPickerInvocation(false), true);
assert.equal(canStartPickerInvocation(true), false);
assert.equal(isPickerCancelError({ reason: "cancelled", message: "Image selection cancelled." }), true);
assert.equal(isPickerCancelError(new Error("boom")), false);

const identityMedia = readFileSync(join(root, "src/onboarding/identityMedia.ts"), "utf8");
assert.match(identityMedia, /waitForPickerHostReady/);
assert.match(identityMedia, /shouldRequestMediaLibraryPermissionBeforeLaunch/);
assert.match(identityMedia, /pickerInFlight/);
assert.match(identityMedia, /launchImageLibraryAsync/);

console.log("identityMediaPickerGate.test.ts: ok");
