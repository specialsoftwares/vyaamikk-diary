import assert from "node:assert/strict";

import { AppError } from "@/domain/errors";
import {
  classifyAtomicCreateError,
  wrapAtomicCreateFailure,
} from "./classifyCreateError";

assert.equal(
  classifyAtomicCreateError(new AppError("quota_exhausted", "limit")),
  "quota_exhausted"
);
assert.equal(
  classifyAtomicCreateError(new AppError("quota_state_invalid", "bad")),
  "quota_state_invalid"
);
assert.equal(
  classifyAtomicCreateError({ code: "permission-denied", message: "Missing or insufficient permissions." }),
  "permission_denied"
);
assert.notEqual(
  classifyAtomicCreateError({ code: "permission-denied", message: "quota" }),
  "quota_exhausted"
);
assert.equal(
  classifyAtomicCreateError({ code: "unauthenticated" }),
  "unauthenticated"
);
assert.equal(classifyAtomicCreateError({ code: "unavailable" }), "network");

const wrapped = new Error("tx failed");
(wrapped as Error & { cause: AppError }).cause = new AppError("quota_exhausted", "limit");
assert.equal(classifyAtomicCreateError(wrapped), "quota_exhausted");
assert.equal(wrapAtomicCreateFailure(wrapped).code, "quota_exhausted");

const denied = wrapAtomicCreateFailure({ code: "permission-denied" });
assert.equal(denied.code, "permission_denied");
assert.equal(denied.details?.reason, "authorization_denied");

console.log("classifyCreateError.test.ts: ok");
