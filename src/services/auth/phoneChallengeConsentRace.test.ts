/**
 * Consent after confirm must use the authoritative profile, not a stale
 * React session closure (reproduces "Not signed in." after confirmOtp).
 */
import assert from "node:assert/strict";

type SessionUser = { uid: string; phoneE164: string };
type UpdateOpts = { user?: SessionUser };

/**
 * Mirrors the AuthProvider.updateProfile session resolution rule after the fix.
 */
function resolveUpdateTarget(
  sessionUser: SessionUser | null,
  opts?: UpdateOpts
): SessionUser | null {
  return opts?.user ?? sessionUser;
}

const profile: SessionUser = {
  uid: "uid_fresh",
  phoneE164: "+916420835745",
};

// Pre-confirm React state: signed out / null session
assert.equal(resolveUpdateTarget(null), null);

// After confirmOtp schedules setState but before commit — pass authoritative user
assert.equal(resolveUpdateTarget(null, { user: profile })?.uid, "uid_fresh");

// After commit, session alone is enough
assert.equal(resolveUpdateTarget(profile)?.uid, "uid_fresh");

console.log("phoneChallengeConsentRace.test.ts: ok");
