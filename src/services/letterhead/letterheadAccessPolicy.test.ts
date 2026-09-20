import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  LETTERHEAD_COMMERCIAL_POLICY_STATUS,
  LETTERHEAD_FREE_PERIOD_CALENDAR_MONTHS,
  LETTERHEAD_LEAP_DAY_RULE,
  LETTERHEAD_SIGNUP_AUTHORITY,
  LETTERHEAD_SIGNUP_FIELD,
  LETTERHEAD_SUCCESSOR_PRICING_ADOPTED,
  addUtcCalendarMonths,
  letterheadAccessWindow,
  letterheadAnniversaryUtcMs,
  letterheadCreatesConsumeOrdinaryQuota,
  readServerSignupAt,
} from "./letterheadAccessPolicy";

const root = path.join(import.meta.dirname, "../../..");

assert.equal(LETTERHEAD_COMMERCIAL_POLICY_STATUS, "adopted");
assert.equal(LETTERHEAD_FREE_PERIOD_CALENDAR_MONTHS, 12);
assert.equal(LETTERHEAD_SIGNUP_FIELD, "users/{uid}.createdAt");
assert.equal(LETTERHEAD_SUCCESSOR_PRICING_ADOPTED, false);
assert.equal(LETTERHEAD_LEAP_DAY_RULE, "clamp_to_last_valid_utc_day");
assert.equal(LETTERHEAD_SIGNUP_AUTHORITY.clientWritable, false);
assert.equal(LETTERHEAD_SIGNUP_AUTHORITY.deviceTime, "denied");
assert.equal(LETTERHEAD_SIGNUP_AUTHORITY.firstLetterheadUse, "denied");
assert.equal(LETTERHEAD_SIGNUP_AUTHORITY.subscriptionPurchase, "denied");
assert.equal(LETTERHEAD_SIGNUP_AUTHORITY.reinstall, "denied");
assert.equal(LETTERHEAD_SIGNUP_AUTHORITY.policyImplementationDate, "denied");
assert.equal(LETTERHEAD_SIGNUP_AUTHORITY.planChange, "does_not_reset");
assert.equal(LETTERHEAD_SIGNUP_AUTHORITY.logoutLogin, LETTERHEAD_SIGNUP_AUTHORITY.logoutLogin);

assert.equal(readServerSignupAt(undefined), null);
assert.equal(readServerSignupAt(null), null);
assert.equal(readServerSignupAt("1700000000000"), null);
assert.equal(readServerSignupAt(1.5), null);
assert.equal(readServerSignupAt(0), null);
assert.equal(readServerSignupAt(-1), null);
assert.equal(readServerSignupAt(1_700_000_000_000), 1_700_000_000_000);

const signup = Date.UTC(2024, 8, 18, 9, 15, 30, 0);
assert.equal(letterheadAnniversaryUtcMs(signup), Date.UTC(2025, 8, 18, 9, 15, 30, 0));

const leap = Date.UTC(2024, 1, 29, 12, 0, 0, 0);
assert.equal(addUtcCalendarMonths(leap, 12), Date.UTC(2025, 1, 28, 12, 0, 0, 0));
assert.equal(addUtcCalendarMonths(Date.UTC(2024, 0, 31), 1), Date.UTC(2024, 1, 29));

const during = letterheadAccessWindow({ signupAt: signup, nowMs: Date.UTC(2025, 8, 17) });
assert.equal(during.kind, "included_free_period");
assert.equal(letterheadCreatesConsumeOrdinaryQuota(during), false);

const onAnniversary = letterheadAccessWindow({
  signupAt: signup,
  nowMs: Date.UTC(2025, 8, 18, 9, 15, 30, 0),
});
assert.equal(onAnniversary.kind, "included_pending_successor");
assert.equal(letterheadCreatesConsumeOrdinaryQuota(onAnniversary), false);

const farFuture = letterheadAccessWindow({ signupAt: signup, nowMs: Date.UTC(2099, 0, 1) });
assert.equal(farFuture.kind, "included_pending_successor");
assert.equal(letterheadCreatesConsumeOrdinaryQuota(farFuture), false);

const forgedClock = letterheadAccessWindow({ signupAt: signup, nowMs: Date.UTC(1999, 0, 1) });
assert.equal(forgedClock.kind, "included_free_period");
assert.equal(letterheadCreatesConsumeOrdinaryQuota(forgedClock), false);

const unknown = letterheadAccessWindow({ signupAt: undefined, nowMs: Date.now() });
assert.equal(unknown.kind, "signup_unknown_pending_successor");
assert.equal(letterheadCreatesConsumeOrdinaryQuota(unknown), false);

const originalNow = Date.now;
Date.now = () => Date.UTC(2099, 6, 1);
try {
  assert.equal(letterheadAnniversaryUtcMs(signup), Date.UTC(2025, 8, 18, 9, 15, 30, 0));
  assert.equal(
    letterheadCreatesConsumeOrdinaryQuota(letterheadAccessWindow({ signupAt: signup, nowMs: originalNow() })),
    false
  );
} finally {
  Date.now = originalNow;
}

const processOffset = process.env.TZ;
process.env.TZ = "America/Los_Angeles";
try {
  assert.equal(addUtcCalendarMonths(leap, 12), Date.UTC(2025, 1, 28, 12, 0, 0, 0));
} finally {
  if (processOffset === undefined) delete process.env.TZ;
  else process.env.TZ = processOffset;
}

const sharedSrc = fs.readFileSync(path.join(root, "functions/src/identity/shared.ts"), "utf8");
assert.equal(sharedSrc.includes("createdAt: now"), true);
assert.match(sharedSrc, /function applyLoginTimestamps\([\s\S]*lastLoginAt: now/);
assert.equal(sharedSrc.includes("createdAt: now"), true);
assert.doesNotMatch(
  sharedSrc.slice(sharedSrc.indexOf("function applyLoginTimestamps")),
  /createdAt:\s*now/
);

const resolverSrc = fs.readFileSync(
  path.join(root, "functions/src/identity/resolveOrCreateUserByPhone.ts"),
  "utf8"
);
assert.equal(resolverSrc.includes("freshProfileShell"), true);
assert.equal(resolverSrc.includes("recreate_inactive_user"), true);
assert.equal(resolverSrc.includes("applyLoginTimestamps(profile, now)"), true);

const rulesSrc = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
assert.equal(rulesSrc.includes("request.resource.data.get('createdAt', 0) == resource.data.get('createdAt', 0)"), true);

const patchSrc = fs.readFileSync(path.join(root, "src/services/auth/clientProfilePatchPayload.ts"), "utf8");
assert.equal(patchSrc.includes('"createdAt"'), true);
assert.doesNotMatch(patchSrc.slice(0, patchSrc.indexOf("SERVER_OWNED_PROFILE_PATCH_KEYS")), /"createdAt"/);

console.log("letterheadAccessPolicy.test.ts: ok");
