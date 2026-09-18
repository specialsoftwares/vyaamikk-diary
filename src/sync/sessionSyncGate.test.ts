import assert from "node:assert/strict";

import { AppError } from "@/domain/errors";
import { wrapAtomicCreateFailure } from "@/billing/optionC/classifyCreateError";
import { isSyncAuthError, sessionSyncGate } from "@/sync/sessionSyncGate";

sessionSyncGate.unlock();

assert.equal(isSyncAuthError(new AppError("session_expired", "expired")), true);
assert.equal(isSyncAuthError(new AppError("auth_not_configured", "cfg")), true);
assert.equal(isSyncAuthError(wrapAtomicCreateFailure({ code: "unauthenticated" })), true);

assert.equal(isSyncAuthError(new AppError("permission_denied", "nope")), false);
assert.equal(isSyncAuthError(new AppError("quota_exhausted", "limit")), false);
assert.equal(isSyncAuthError({ code: "permission-denied", message: "Missing or insufficient permissions." }), false);
assert.equal(isSyncAuthError("unauthorized permission auth token 401 403"), false);

sessionSyncGate.lock("session_expired");
assert.equal(sessionSyncGate.isLocked(), true);
sessionSyncGate.unlock();
assert.equal(sessionSyncGate.isLocked(), false);

console.log("sessionSyncGate.test.ts: ok");
