import assert from "node:assert/strict";

import { normaliseUserProfile } from "@/services/auth/normalizeProfile";

import {
  assessSelfDeclaredDob,
  observedBirthday,
  profileNeedsAgeGate,
  resolveSignedInOnboardingContinuation,
} from "./ageEligibility";
import { assessSelfDeclaredDob as assessOnServer } from "../../functions/src/identity/ageEligibility";

function ist(isoUtc: string) {
  return Date.parse(isoUtc);
}

const vectors: { name: string; dob: unknown; now: number; claim?: unknown; expect: string }[] = [
  {
    name: "eighteenth birthday",
    dob: "2008-10-22",
    now: ist("2026-10-21T18:30:00.000Z"),
    expect: "eligible",
  },
  {
    name: "day before birthday",
    dob: "2008-10-22",
    now: ist("2026-10-20T18:30:00.000Z"),
    expect: "ineligible",
  },
  {
    name: "29 February observed on 1 March",
    dob: "2008-02-29",
    now: ist("2026-02-28T18:30:00.000Z"),
    expect: "eligible",
  },
  {
    name: "29 February still the day before in IST",
    dob: "2008-02-29",
    now: ist("2026-02-28T18:29:59.000Z"),
    expect: "ineligible",
  },
  {
    name: "16th birthday in a leap year is still under 18",
    dob: "2008-02-29",
    now: ist("2024-02-28T18:30:00.000Z"),
    expect: "ineligible",
  },
  {
    name: "timezone still previous IST date",
    dob: "2008-03-02",
    now: ist("2026-03-01T18:29:59.000Z"),
    expect: "ineligible",
  },
  { name: "malformed", dob: "22-10-2008", now: ist("2026-10-21T18:30:00.000Z"), expect: "malformed" },
  { name: "impossible", dob: "2023-02-29", now: ist("2026-10-21T18:30:00.000Z"), expect: "impossible" },
  { name: "future", dob: "2027-01-01", now: ist("2026-10-21T18:30:00.000Z"), expect: "future" },
  {
    name: "forged client claim",
    dob: "2000-01-01",
    now: ist("2026-10-21T18:30:00.000Z"),
    claim: true,
    expect: "forged",
  },
];

for (const vector of vectors) {
  const app = assessSelfDeclaredDob({
    dateOfBirth: vector.dob,
    nowMs: vector.now,
    clientClaim: vector.claim,
  });
  const server = assessOnServer({
    dateOfBirth: vector.dob,
    nowMs: vector.now,
    clientClaim: vector.claim,
  });
  assert.deepEqual(server, app, vector.name);
  const actual = app.ok ? app.ageEligibility : app.reason;
  assert.equal(actual, vector.expect, vector.name);
}

assert.deepEqual(observedBirthday(2024, 2, 29), { month: 2, day: 29 });
assert.deepEqual(observedBirthday(2026, 2, 29), { month: 3, day: 1 });
assert.equal(profileNeedsAgeGate(undefined), false);
assert.equal(profileNeedsAgeGate({ ageEligibility: "unassessed" }), false);
assert.equal(profileNeedsAgeGate({ ageEligibility: "ineligible" }), false);
assert.equal(profileNeedsAgeGate({ ageEligibility: "eligible" }), false);
assert.equal(profileNeedsAgeGate({ ageEligibility: null, demographicAgeBand: null }), false);
assert.equal(
  resolveSignedInOnboardingContinuation({
    hasVerifiedEmail: false,
    profileCompletedAt: null,
    ageEligibility: null,
    demographicAgeBand: "skipped",
  }),
  "email"
);
assert.equal(
  resolveSignedInOnboardingContinuation({
    hasVerifiedEmail: true,
    profileCompletedAt: null,
    ageEligibility: "unassessed",
  }),
  "profile"
);
assert.equal(
  resolveSignedInOnboardingContinuation({
    hasVerifiedEmail: true,
    profileCompletedAt: 1,
    demographicAgeBand: null,
  }),
  "dashboard"
);

const stored = normaliseUserProfile("uid-1", {
  uid: "uid-1",
  ueid: "VYD-2026-TEST01",
  phoneE164: "+919876543210",
  dateOfBirth: "2000-01-01",
  ageEligibility: "eligible",
  agePolicyVersion: "self-declared-dob-18-ist-2026-10",
  createdAt: 1,
  updatedAt: 1,
});
assert.equal(stored.ageEligibility, "eligible");
assert.equal("dateOfBirth" in stored, false);

console.log("ageEligibility.test.ts: ok");
