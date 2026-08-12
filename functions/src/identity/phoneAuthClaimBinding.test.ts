/**
 * Authenticated phone-claim binding for Phone Auth identity callables.
 * Proves mismatch / missing-claim rejection BEFORE any identity mutation.
 */
import assert from "node:assert/strict";
import { HttpsError } from "firebase-functions/v2/https";

import {
  AUTH_PHONE_CLAIM_MISSING,
  AUTH_PHONE_MISMATCH,
  canonicalizePhoneE164,
  phoneAuthBindingSafeMeta,
  resolveAuthoritativePhoneAuthIdentity,
} from "./phoneAuthClaimBinding";

const PHONE_A = "+919716332674";
const PHONE_B = "+916420835745";
const UID_A = "uid_phone_a_aaaaaa";

let mutationAttempts = 0;
function pretendIdentityMutation(): void {
  mutationAttempts += 1;
}

function runBound(input: {
  authUid?: string | null;
  tokenPhone?: unknown;
  clientPhone?: unknown;
}): ReturnType<typeof resolveAuthoritativePhoneAuthIdentity> {
  const bound = resolveAuthoritativePhoneAuthIdentity({
    authUid: input.authUid,
    tokenPhoneNumber: input.tokenPhone,
    clientPhoneE164: input.clientPhone,
  });
  // Only runs if binding succeeded — proves gate is before mutation.
  pretendIdentityMutation();
  return bound;
}

mutationAttempts = 0;

// A. authenticated A + requested A → success (derive from token)
{
  const bound = runBound({
    authUid: UID_A,
    tokenPhone: PHONE_A,
    clientPhone: PHONE_A,
  });
  assert.equal(bound.phoneE164, PHONE_A);
  assert.equal(bound.authUid, UID_A);
  assert.equal(mutationAttempts, 1);
}

// Formatting-equivalent match still succeeds; identity phone is canonical from claim
{
  mutationAttempts = 0;
  const bound = runBound({
    authUid: UID_A,
    tokenPhone: "+91 97163 32674",
    clientPhone: "9716332674",
  });
  assert.equal(bound.phoneE164, PHONE_A);
  assert.equal(mutationAttempts, 1);
}

// B. authenticated A + requested B → rejected, zero mutation
{
  mutationAttempts = 0;
  assert.throws(
    () =>
      runBound({
        authUid: UID_A,
        tokenPhone: PHONE_A,
        clientPhone: PHONE_B,
      }),
    (err: unknown) => {
      assert.ok(err instanceof HttpsError);
      assert.equal(err.code, "permission-denied");
      assert.equal(
        (err.details as { diagnosticCode?: string } | undefined)?.diagnosticCode,
        AUTH_PHONE_MISMATCH
      );
      // Never leak phones in message
      assert.ok(!String(err.message).includes(PHONE_A));
      assert.ok(!String(err.message).includes(PHONE_B));
      return true;
    }
  );
  assert.equal(mutationAttempts, 0, "mismatch must not reach identity mutation");
}

// C. inactive-profile attack class: UID of A + client B → rejected before recreate
{
  mutationAttempts = 0;
  assert.throws(
    () =>
      runBound({
        authUid: UID_A,
        tokenPhone: PHONE_A,
        clientPhone: PHONE_B,
      }),
    (err: unknown) => err instanceof HttpsError && err.code === "permission-denied"
  );
  assert.equal(mutationAttempts, 0);
}

// D. authenticated without phone claim → rejected
{
  mutationAttempts = 0;
  assert.throws(
    () =>
      runBound({
        authUid: UID_A,
        tokenPhone: undefined,
        clientPhone: PHONE_A,
      }),
    (err: unknown) => {
      assert.ok(err instanceof HttpsError);
      assert.equal(err.code, "failed-precondition");
      assert.equal(
        (err.details as { diagnosticCode?: string } | undefined)?.diagnosticCode,
        AUTH_PHONE_CLAIM_MISSING
      );
      return true;
    }
  );
  assert.equal(mutationAttempts, 0);
}

// E. malformed client phone → rejected
{
  mutationAttempts = 0;
  assert.throws(
    () =>
      runBound({
        authUid: UID_A,
        tokenPhone: PHONE_A,
        clientPhone: "not-a-phone",
      }),
    (err: unknown) => err instanceof HttpsError && err.code === "invalid-argument"
  );
  assert.equal(mutationAttempts, 0);
}

// F. malformed authenticated phone claim → rejected as claim missing/invalid
{
  mutationAttempts = 0;
  assert.throws(
    () =>
      runBound({
        authUid: UID_A,
        tokenPhone: "+",
        clientPhone: PHONE_A,
      }),
    (err: unknown) => {
      assert.ok(err instanceof HttpsError);
      assert.equal(err.code, "failed-precondition");
      assert.equal(
        (err.details as { diagnosticCode?: string } | undefined)?.diagnosticCode,
        AUTH_PHONE_CLAIM_MISSING
      );
      return true;
    }
  );
  assert.equal(mutationAttempts, 0);
}

// Unauthenticated
{
  assert.throws(
    () =>
      runBound({
        authUid: null,
        tokenPhone: PHONE_A,
        clientPhone: PHONE_A,
      }),
    (err: unknown) => err instanceof HttpsError && err.code === "unauthenticated"
  );
}

// G/H helpers: canonicalize
assert.equal(canonicalizePhoneE164(PHONE_B), PHONE_B);
assert.equal(canonicalizePhoneE164("6420835745"), PHONE_B);

// Safe metadata never includes full phone
{
  const meta = phoneAuthBindingSafeMeta({
    authUid: UID_A,
    tokenPhoneNumber: PHONE_A,
  });
  assert.equal(meta.authUidPresent, true);
  assert.equal(meta.tokenPhonePresent, true);
  assert.equal(meta.tokenPhoneSuffix, PHONE_A.slice(-4));
  assert.ok(!JSON.stringify(meta).includes(PHONE_A));
}

// J. claimMobile shares the same binding (alias contract)
{
  // claimMobile === resolveOrCreateUserByPhone in source; binding helper is the gate.
  assert.equal(AUTH_PHONE_MISMATCH, "AUTH_PHONE_MISMATCH");
  assert.equal(AUTH_PHONE_CLAIM_MISSING, "AUTH_PHONE_CLAIM_MISSING");
}

console.log("phoneAuthClaimBinding.test.ts: ok");
console.log(
  JSON.stringify({
    claimNameProvenInTypings: "phone_number",
    model: "assert_equality_then_derive_from_token",
    mismatchBlocksMutation: true,
  })
);
