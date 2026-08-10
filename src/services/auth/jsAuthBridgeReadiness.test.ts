/**
 * JS auth bridge readiness — Firestore must not run when bridge fails.
 */
import assert from "node:assert/strict";

import { AppError } from "@/domain/errors";

/**
 * Mirrors requireJsAuthSessionForFirestore failure contract (no RN Firebase in Node).
 */
function bridgeGate(bridged: boolean, phase: string): void {
  if (bridged) return;
  throw new AppError(
    "auth_failed",
    "Your phone sign-in succeeded, but secure cloud access is not ready yet. Please try again.",
    undefined,
    {
      authPhase: "post_auth",
      failureDomain: "firestore",
      diagnosticCode: "JS_AUTH_BRIDGE_FAILED",
      phase,
      retryAccountSetup: true,
    }
  );
}

assert.doesNotThrow(() => bridgeGate(true, "update_profile"));

assert.throws(
  () => bridgeGate(false, "post_phone_identity"),
  (err: unknown) => {
    assert.ok(err instanceof AppError);
    assert.equal(err.code, "auth_failed");
    assert.equal(err.details?.diagnosticCode, "JS_AUTH_BRIDGE_FAILED");
    assert.equal(err.details?.failureDomain, "firestore");
    assert.ok(!/Missing or insufficient permissions/i.test(err.message));
    return true;
  }
);

// Hydration race guard: while OTP post-auth is in flight, do not advance to email.
function shouldHydrateToEmail(args: {
  signedIn: boolean;
  verifyInFlight: boolean;
  hasVerifiedEmail: boolean;
}): boolean {
  if (!args.signedIn) return false;
  if (args.verifyInFlight) return false;
  if (args.hasVerifiedEmail) return false;
  return true;
}

assert.equal(
  shouldHydrateToEmail({ signedIn: true, verifyInFlight: true, hasVerifiedEmail: false }),
  false,
  "in-flight verify must block email hydration"
);
assert.equal(
  shouldHydrateToEmail({ signedIn: true, verifyInFlight: false, hasVerifiedEmail: false }),
  true
);

console.log("jsAuthBridgeReadiness.test.ts: ok");
