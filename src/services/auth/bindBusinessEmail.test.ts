import assert from "node:assert/strict";

import {
  completeBusinessEmailBind,
  requiresServerEmailBinding,
  startBusinessEmailVerification,
} from "@/services/auth/bindBusinessEmail";

assert.equal(typeof requiresServerEmailBinding, "function");
assert.equal(typeof startBusinessEmailVerification, "function");
assert.equal(typeof completeBusinessEmailBind, "function");

console.log("bindBusinessEmail.test.ts: exports present");
