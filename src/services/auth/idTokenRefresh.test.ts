import assert from "node:assert/strict";

import {
  isRecoverableIdTokenError,
  readNativeIdToken,
  shouldForceIdTokenRefresh,
} from "./idTokenRefresh";

const token = "a".repeat(40);

assert.equal(shouldForceIdTokenRefresh({ explicitInvalidation: false, recoveryAttempt: 0 }), false);
assert.equal(shouldForceIdTokenRefresh({ explicitInvalidation: true, recoveryAttempt: 0 }), true);
assert.equal(shouldForceIdTokenRefresh({ explicitInvalidation: false, recoveryAttempt: 1 }), true);
assert.equal(isRecoverableIdTokenError({ code: "auth/user-token-expired" }), true);
assert.equal(isRecoverableIdTokenError({ code: "auth/user-disabled" }), false);
assert.equal(isRecoverableIdTokenError({ code: "permission-denied" }), false);
assert.equal(isRecoverableIdTokenError(new Error("no code")), false);

async function main(): Promise<void> {
{
  const calls: boolean[] = [];
  const read = await readNativeIdToken(
    {
      async getIdToken(force) {
        calls.push(Boolean(force));
        return token;
      },
    },
    { explicitInvalidation: false }
  );
  assert.deepEqual(calls, [false]);
  assert.equal(read.forced, false);
  assert.equal(read.recoveryUsed, false);
  assert.equal(read.token, token);
}

{
  const calls: boolean[] = [];
  const read = await readNativeIdToken(
    {
      async getIdToken(force) {
        calls.push(Boolean(force));
        if (!force) throw Object.assign(new Error("expired"), { code: "auth/user-token-expired" });
        return token;
      },
    },
    { explicitInvalidation: false }
  );
  assert.deepEqual(calls, [false, true]);
  assert.equal(read.recoveryUsed, true);
  assert.equal(read.forced, true);
}

{
  const calls: boolean[] = [];
  await assert.rejects(
    () =>
      readNativeIdToken(
        {
          async getIdToken(force) {
            calls.push(Boolean(force));
            throw Object.assign(new Error("disabled"), { code: "auth/user-disabled" });
          },
        },
        { explicitInvalidation: false }
      ),
    (error: unknown) => (error as { code?: string }).code === "auth/user-disabled"
  );
  assert.deepEqual(calls, [false]);
}

{
  const calls: boolean[] = [];
  const read = await readNativeIdToken(
    {
      async getIdToken(force) {
        calls.push(Boolean(force));
        return token;
      },
    },
    { explicitInvalidation: true }
  );
  assert.deepEqual(calls, [true]);
  assert.equal(read.forced, true);
  assert.equal(read.recoveryUsed, false);
}
}

main().then(() => {
  console.log("idTokenRefresh.test.ts: ok");
});
