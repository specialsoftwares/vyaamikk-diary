import assert from "node:assert/strict";

import {
  __clearNativePhoneSessions,
  isNativePhoneAuthAvailable,
} from "./nativePhoneAuth";

function run() {
  __clearNativePhoneSessions();
  // In Node test env, native module is not linked.
  assert.equal(isNativePhoneAuthAvailable(), false);
  console.log("nativePhoneAuth.test.ts: ok");
}

run();
