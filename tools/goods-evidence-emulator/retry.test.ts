import assert from "node:assert/strict";

import { isRetryable } from "./retry";

assert.equal(isRetryable({ code: 10 }), true);
assert.equal(isRetryable({ code: "ABORTED" }), true);
assert.equal(isRetryable({ code: "aborted" }), true);

assert.equal(isRetryable({ code: 16 }), false);
assert.equal(isRetryable({ code: "UNAUTHENTICATED" }), false);
assert.equal(isRetryable({ code: 16, message: "ABORTED: not contention" }), false);
assert.equal(isRetryable(new Error("ABORTED: simulated retry")), false);
assert.equal(isRetryable({ message: "too much contention" }), false);
assert.equal(isRetryable("ABORTED"), false);
assert.equal(isRetryable(null), false);

console.log("tools/goods-evidence-emulator/retry.test.ts: ok");
