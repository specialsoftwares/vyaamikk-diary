import assert from "node:assert/strict";

import {
  AUTH_ENTRY_HREF,
  getAuthEntryHref,
  isAuthWrapperV2Enabled,
} from "@/config/authWrapper";

function main() {
  assert.equal(isAuthWrapperV2Enabled(), true);
  assert.equal(getAuthEntryHref(), "/(auth)/v2");
  assert.equal(AUTH_ENTRY_HREF, "/(auth)/v2");
  console.log("authWrapper.test.ts: ok");
}

main();
