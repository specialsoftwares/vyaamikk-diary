import assert from "node:assert/strict";

import { resolveResendControl } from "@/hooks/resendControl";

assert.equal(
  resolveResendControl({ resendAvailableAt: null, remainingSeconds: 0, online: true, busy: false }),
  "unavailable"
);
assert.equal(
  resolveResendControl({ resendAvailableAt: 1_000, remainingSeconds: 5, online: true, busy: false }),
  "cooling"
);
assert.equal(
  resolveResendControl({ resendAvailableAt: 1_000, remainingSeconds: 0, online: true, busy: true }),
  "sending"
);
assert.equal(
  resolveResendControl({ resendAvailableAt: 1_000, remainingSeconds: 0, online: false, busy: false }),
  "offline"
);
assert.equal(
  resolveResendControl({ resendAvailableAt: 1_000, remainingSeconds: 0, online: true, busy: false }),
  "ready"
);

console.log("resendControl.test.ts: ok");
