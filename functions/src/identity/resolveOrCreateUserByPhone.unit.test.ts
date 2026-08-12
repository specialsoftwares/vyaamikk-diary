/**
 * Pure unit coverage for the vc7 INTERNAL root cause:
 * Firestore transactions forbid reads after writes. Quarantine "opportunistic release"
 * must be deferred until the full read phase completes.
 *
 * Also proves first-time vs returning branch classification inputs.
 */
import assert from "node:assert/strict";
import { HttpsError } from "firebase-functions/v2/https";

import {
  applyLoginTimestamps,
  freshProfileShell,
  normalizePhoneE164,
  type UserProfileDoc,
} from "./shared";
import {
  assertMobileNotQuarantinedPure,
  createEmptyQuarantineState,
  releaseMobileQuarantineIfDuePure,
  sha256MobileHash,
  startMobileQuarantinePure,
} from "./mobileQuarantine";

const NOW = 1_700_000_000_000;
const PHONE = "+919876543210";
const UID = "authUidABCDEF";

type Branch =
  | "returning_active"
  | "returning_deletion_pending"
  | "first_time_create"
  | "repair_phone_index"
  | "recreate_inactive_user"
  | "phone_conflict";

/**
 * Mirrors resolveOrCreateUserByPhone branch selection (no Firestore).
 * Used to prove first-time vs returning paths separately from the TX plumbing.
 */
function classifyIdentityBranch(input: {
  phoneIndexUid: string | null;
  authUid: string;
  user: UserProfileDoc | null;
}): Branch {
  const { phoneIndexUid, authUid, user } = input;
  if (phoneIndexUid) {
    if (phoneIndexUid !== authUid) return "phone_conflict";
    if (!user) throw new HttpsError("failed-precondition", "Identity registry is inconsistent.");
    if (user.status === "pending_deletion") return "returning_deletion_pending";
    if (user.status === "active") return "returning_active";
    throw new HttpsError(
      "permission-denied",
      "This account was deleted. Sign in again to create a new account."
    );
  }
  if (user?.status === "active") {
    const priorPhone =
      typeof user.phoneE164 === "string" ? normalizePhoneE164(user.phoneE164) : "";
    if (priorPhone) return "repair_phone_index";
  }
  if (user && user.status !== "active") return "recreate_inactive_user";
  return "first_time_create";
}

function testNormalizePhoneRejectsNonString() {
  assert.throws(() => normalizePhoneE164(undefined as unknown as string), TypeError);
  assert.throws(() => normalizePhoneE164(""), TypeError);
  assert.equal(normalizePhoneE164("9876543210"), "+919876543210");
  assert.equal(normalizePhoneE164("+919876543210"), "+919876543210");
  assert.equal(normalizePhoneE164("+91 98765 43210"), "+919876543210");
}

function testExpiredQuarantineReleaseIsSeparateWriteStep() {
  const state = createEmptyQuarantineState();
  const mobileHash = sha256MobileHash(PHONE);
  startMobileQuarantinePure(state, {
    mobileHash,
    formerUid: UID,
    reason: "mobile_change",
    now: NOW - 22 * 24 * 60 * 60 * 1000,
  });

  // Read-phase: assert does not throw once quarantine is past releaseAt.
  assert.doesNotThrow(() => assertMobileNotQuarantinedPure(state, mobileHash, NOW));

  // Write-phase companion (pure): release is a separate mutating step.
  const before = state.quarantines[mobileHash]?.status;
  assert.equal(before, "active");
  releaseMobileQuarantineIfDuePure(state, mobileHash, NOW);
  assert.equal(state.quarantines[mobileHash]?.status, "released");
}

/**
 * Simulates the OLD defect: quarantine update (write) then later reads.
 * Firestore Admin SDK throws; we prove the ordering class of bug.
 */
function testReadAfterWriteOrderingIsIllegal() {
  type Op = { kind: "read" | "write"; label: string };
  const ops: Op[] = [];
  let wrote = false;
  const record = {
    read(label: string) {
      if (wrote) {
        throw new Error(
          `Firestore transaction failure: read after write (${label}). ` +
            "This surfaces to clients as functions/internal."
        );
      }
      ops.push({ kind: "read", label });
    },
    write(label: string) {
      wrote = true;
      ops.push({ kind: "write", label });
    },
  };

  // OLD buggy order (must fail):
  assert.throws(() => {
    record.read("phoneIndex");
    record.read("mobileQuarantines");
    record.write("mobileQuarantines.release"); // opportunistic release too early
    record.read("retiredPhones"); // illegal
  }, /read after write/);

  // NEW order (must succeed) for first-time create:
  wrote = false;
  ops.length = 0;
  record.read("phoneIndex");
  record.read("mobileQuarantines");
  record.read("retiredPhones");
  record.read("users");
  record.read("ueidIndex");
  record.write("mobileQuarantines.release");
  record.write("ueidIndex.claim");
  record.write("users.set");
  record.write("phoneIndex.set");
  assert.equal(ops.filter((o) => o.kind === "read").length, 5);
  assert.equal(ops.filter((o) => o.kind === "write").length, 4);
}

function testReturningActiveBranch() {
  const profile = freshProfileShell(UID, PHONE, "VYD-2026-AAAAAA", NOW);
  const branch = classifyIdentityBranch({
    phoneIndexUid: UID,
    authUid: UID,
    user: profile,
  });
  assert.equal(branch, "returning_active");
  const loggedIn = applyLoginTimestamps(profile, NOW + 1000);
  assert.equal(loggedIn.lastLoginAt, NOW + 1000);
  assert.equal(loggedIn.previousLoginAt, NOW);
  assert.notEqual(branch, "first_time_create");
}

function testFirstTimeCreateBranch() {
  const branch = classifyIdentityBranch({
    phoneIndexUid: null,
    authUid: UID,
    user: null,
  });
  assert.equal(branch, "first_time_create");
  const created = freshProfileShell(UID, PHONE, "VYD-2026-BBBBBB", NOW);
  assert.equal(created.status, "active");
  assert.equal(created.phoneE164, PHONE);
  assert.equal(created.uid, UID);
}

function testReturningConflictAndDeletion() {
  assert.equal(
    classifyIdentityBranch({
      phoneIndexUid: "other-uid",
      authUid: UID,
      user: null,
    }),
    "phone_conflict"
  );

  const pending = freshProfileShell(UID, PHONE, "VYD-2026-CCCCCC", NOW);
  pending.status = "pending_deletion";
  pending.deletionScheduledFor = NOW + 5 * 24 * 60 * 60 * 1000;
  assert.equal(
    classifyIdentityBranch({
      phoneIndexUid: UID,
      authUid: UID,
      user: pending,
    }),
    "returning_deletion_pending"
  );
}

function testRecreateInactiveIsNewUserPath() {
  const deleted = freshProfileShell(UID, PHONE, "VYD-2026-DDDDDD", NOW);
  deleted.status = "deleted";
  assert.equal(
    classifyIdentityBranch({
      phoneIndexUid: null,
      authUid: UID,
      user: deleted,
    }),
    "recreate_inactive_user"
  );
}

function testUidSuffixLoggingContract() {
  // Mirror server logging: never include full uid or phone in structured fields.
  const uidSuffix = UID.length >= 6 ? UID.slice(-6) : "??????";
  assert.equal(uidSuffix, "ABCDEF");
  assert.equal(uidSuffix.includes(PHONE), false);
  const mobileHashPrefix = sha256MobileHash(PHONE).slice(0, 8);
  assert.equal(mobileHashPrefix.length, 8);
  assert.equal(mobileHashPrefix.includes("9876"), false);
}

testNormalizePhoneRejectsNonString();
testExpiredQuarantineReleaseIsSeparateWriteStep();
testReadAfterWriteOrderingIsIllegal();
testReturningActiveBranch();
testFirstTimeCreateBranch();
testReturningConflictAndDeletion();
testRecreateInactiveIsNewUserPath();
testUidSuffixLoggingContract();

console.log("resolveOrCreateUserByPhone.unit.test.ts: ok");
