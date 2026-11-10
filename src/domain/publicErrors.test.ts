import assert from "node:assert/strict";

import { AppError, userFacingMessage } from "@/domain/errors";
import { presentPublicError, toPublicError } from "@/domain/publicErrors";
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

const leakedTransport = new Error("functions/internal exploded");
leakedTransport.stack = "Error: functions/internal exploded\n    at explode (src/app.ts:1:1)";
const shownTransport = presentPublicError(leakedTransport);
assert.equal(shownTransport.includes("functions/"), false);
assert.equal(shownTransport.includes("    at "), false);
assert.equal(shownTransport.includes("src/app.ts"), false);
assert.equal(presentPublicError({ code: "functions/unavailable" }).includes("unavailable"), true);
assert.match(presentPublicError({ code: "functions/unauthenticated" }), /sign in again/i);
assert.equal(presentPublicError({ code: "functions/unauthenticated" }).includes("30"), false);
assert.match(presentPublicError({ code: "functions/resource-exhausted" }), /wait/i);
assert.match(
  presentPublicError(new AppError("permission_denied", "raw", undefined, { reason: "session_changed" })),
  /sign-in changed/i
);
assert.equal(presentPublicError("functions/internal secret").includes("functions/"), false);

console.log("publicErrors.test.ts: ok");
