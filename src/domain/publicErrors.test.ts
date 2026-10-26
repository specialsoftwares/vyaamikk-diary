import assert from "node:assert/strict";

import { AppError, userFacingMessage } from "@/domain/errors";
import { toPublicError } from "@/domain/publicErrors";
import { LocalKeyUnavailable } from "@/services/accountDeletion/localDataKey";

const leaked = new Error("secure_store_unavailable");
assert.equal(userFacingMessage(leaked).includes("secure_store_unavailable"), false);
assert.match(userFacingMessage(new LocalKeyUnavailable("secure_random_unavailable")), /secure storage/i);

const hostile = new Error("SQL syntax near secret-token");
Object.defineProperty(hostile, "message", {
  get() {
    throw new Error("getter");
  },
});
const wrapped = { cause: hostile };
assert.equal(toPublicError(wrapped).message.includes("SQL"), false);
assert.equal(toPublicError(wrapped).message.includes("secret-token"), false);

const cycle: { cause?: unknown } = {};
cycle.cause = cycle;
assert.equal(toPublicError(cycle).title, "Something went wrong");

const reactivation = new AppError("unknown", "Business email verification required.", undefined, {
  code: "no_verified_email",
});
const shown = toPublicError(reactivation, "reactivation");
assert.equal(shown.message.includes("Business email verification required"), false);
assert.match(shown.message, /Contact support/);

console.log("publicErrors.test.ts: ok");
