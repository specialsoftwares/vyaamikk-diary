/**
 * Firebase implementation of AuthService.
 *
 * Phone OTP in React Native requires platform-specific verifiers:
 *   - On native (iOS/Android) use `@react-native-firebase/auth` which handles
 *     SafetyNet/Play Integrity (Android) and silent verification / APNs (iOS).
 *   - On web use `signInWithPhoneNumber` with a `RecaptchaVerifier`.
 *
 * The Firebase JS SDK (which we have installed) does NOT support native phone
 * OTP out of the box. This implementation:
 *   1. Handles the post-OTP UEID lookup/creation in a Firestore transaction.
 *   2. Handles profile updates (real, no seam — Firestore writes work).
 *   3. Handles the phone-change atomic swap inside a Firestore transaction.
 *   4. Provides clearly-marked integration seams for the OTP verifier
 *      portions of startOtp / confirmOtp / startMobileChange / confirmMobileChange.
 */

import {
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  type Transaction,
} from "firebase/firestore";

import { AppError } from "@/domain/errors";
import { DEFAULT_PDF_BRANDING, type PhoneE164, UserProfile, UEID } from "@/domain/types";
import { applyProfilePatch, normaliseUserProfile } from "./normalizeProfile";
import { applyOtpLoginTimestamps } from "./loginTimestamps";
import { enrichPatchWithEmailLink } from "./emailLink";
import {
  commitFirestoreEmailIndexOps,
  lookupFirestoreEmailIndex,
} from "./emailIndexFirestore";
import {
  buildClientProfileFirestoreWrite,
  findRejectedProductionPatchKeys,
  isConsentOnlyProfilePatch,
  stripServerOwnedProfilePatchKeys,
} from "./clientProfilePatchPayload";
import { profileDocumentMergeFields } from "./profileFirestorePayload";
import {
  openBusinessCloud,
  protectBusinessCloud,
  userProfileWriteNeedsSeal,
  BUSINESS_SENSITIVE_FIELDS,
} from "@/services/privacy/businessCloudSeal";
import { recordRetiredPhone } from "@/services/accountDeletion/retiredIdentity";
import { throwPendingDeletionLoginBlocked } from "@/services/auth/identityErrors";
import {
  assertNoStaleActiveAccountAtDerivedUid,
  throwDuplicateActiveMobile,
} from "@/services/auth/mobileIdentity";
import { isPhoneRetiredFirestore } from "@/services/accountDeletion/retiredIdentity";
import { loadProfileByPhoneFirestore } from "@/services/auth/profileByPhone";
import { hashMobileE164, normalizePhoneE164 } from "@/utils/mobileHash";
import { generateUEID } from "@/utils/ueid";
import { getFirebaseAuth, getFirebaseDb } from "@/config/firebase";
import { createLogger } from "@/utils/logger";
import {
  callResolveOrCreateUserByPhone,
  useIdentityCallables,
} from "./identityCallable";
import {
  confirmNativePhoneOtp,
  signOutNativePhoneAuth,
  startNativePhoneOtp,
  getNativeAuthUid,
} from "./nativePhoneAuth";
import { retryOwnedMobileBind } from "./ownedMobileBindRetry";
import { captureNativePhoneContactChangeCurrent } from "./nativePhoneContactChange";
import {
  cleanBothAuthSdks,
  currentAuthMutationGeneration,
  currentSessionCommitEpoch,
} from "./authSessionFence";
import {
  captureProfileWriteOwnership, assertProfileWriteOwnership, readLiveProfileUid,
  type ProfileWriteOwnership,
} from "./profileWriteOwnership";
import { retireNativeCallableAuthReady } from "./nativeCallableAuthGate";

import type {
  AuthService,
  ProfileWriteClaim,
  AuthResult,
  OtpChallenge,
  ProfilePatch,
} from "./types";

const log = createLogger("auth/firebase");

const USERS_COLLECTION = "users";
const PHONE_INDEX_COLLECTION = "phoneIndex";
const UEID_INDEX_COLLECTION = "ueidIndex";

function readJsAuthUid(): string | null {
  try {
    return getFirebaseAuth().currentUser?.uid ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolves (or creates, atomically) the user profile for a given phone number.
 *
 * Uniqueness rules enforced inside the transaction:
 *   - phoneIndex/{phone} stores the canonical uid for a phone.
 *   - ueidIndex/{ueid} reserves the UEID so it can never be re-issued.
 *   - users/{uid} is the actual profile document.
 *
 * If the phone is known, the same UEID is returned (never mutated).
 *
 * IMPORTANT: production uses RANDOM `generateUEID()` here, NOT the
 * deterministic `deriveUEIDFromPhone()` used by the dev mock. Random
 * allocation + server-side reservation is the correct production scheme
 * because deterministic derivation would let an attacker reverse a UEID
 * back to a phone number using the same hash. Do not change this without
 * also redesigning the privacy model.
 */
async function resolveOrCreateUser(
  authUid: string,
  phoneE164: PhoneE164
): Promise<AuthResult> {
  const { finalizeDeletionIfDue, isActiveAccount, isPendingDeletionAccount } = await import("@/services/accountDeletion");
  const phone = normalizePhoneE164(phoneE164);
  const existingByPhone = await loadProfileByPhoneFirestore(phone);
  if (existingByPhone) {
    if (isPendingDeletionAccount(existingByPhone)) {
      if (await finalizeDeletionIfDue(existingByPhone)) {
        // Grace elapsed — registry cleared; fall through to fresh registration txn.
      } else {
        throwPendingDeletionLoginBlocked(existingByPhone);
      }
    } else if (!isActiveAccount(existingByPhone)) {
      // Deleted account with stale index should not occur; block ambiguous restore.
      throw new AppError(
        "permission_denied",
        "This account was deleted. Sign in again to create a new account."
      );
    }
  }

  const db = getFirebaseDb();
  return runTransaction(db, async (tx) => {
    const phoneRef = doc(db, PHONE_INDEX_COLLECTION, phone);
    const phoneSnap = await tx.get(phoneRef);

    if (phoneSnap.exists()) {
      const { uid } = phoneSnap.data() as { uid: string };
      const userRef = doc(db, USERS_COLLECTION, uid);
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists()) {
        throw new AppError(
          "unknown",
          "Identity registry is inconsistent. Please contact support."
        );
      }
      const profile = normaliseUserProfile(uid, userSnap.data() as Record<string, unknown>);
      const now = Date.now();
      if (isPendingDeletionAccount(profile)) {
        throwPendingDeletionLoginBlocked(profile);
      }
      if (!isActiveAccount(profile)) {
        throw new AppError(
          "permission_denied",
          "This account was deleted. Sign in again to create a new account."
        );
      }
      const loggedIn = applyOtpLoginTimestamps(profile, now);
      tx.update(userRef, {
        lastLoginAt: loggedIn.lastLoginAt,
        previousLoginAt: loggedIn.previousLoginAt,
        lastActiveAt: loggedIn.lastActiveAt,
        updatedAt: loggedIn.updatedAt,
      });
      return { profile: loggedIn, isNewUser: false };
    }

    const retired = await isPhoneRetiredFirestore(phone);

    const userRef = doc(db, USERS_COLLECTION, authUid);
    const existingUser = await tx.get(userRef);
    if (existingUser.exists()) {
      const prior = normaliseUserProfile(
        authUid,
        existingUser.data() as Record<string, unknown>
      );
      if (isActiveAccount(prior)) {
        assertNoStaleActiveAccountAtDerivedUid(prior, phone);
      }
      if (!isActiveAccount(prior)) {
        // Re-register after deletion — fresh UEID, empty profile shell.
        const freshUeid = await allocateUeidInTransaction(tx, authUid);
        const now = Date.now();
        const fresh: UserProfile = {
          uid: authUid,
          ueid: freshUeid,
          phoneE164: phone,
          mobileHash: hashMobileE164(phone),
          displayName: null,
          salutation: null,
          businessName: null,
          workType: null,
          designation: null,
          businessEmail: null,
          language: null,
          profileCompletedAt: null,
          ueidReleasedAt: null,
          onboardingIntroSeenAt: null,
          profileLogo: null,
          pdfBranding: { ...DEFAULT_PDF_BRANDING },
          lastLoginAt: now,
          previousLoginAt: null,
          lastActiveAt: now,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          status: "active",
          deletionRequestedAt: null,
          deletionScheduledFor: null,
          deletionCompletedAt: null,
          retiredUeid: false,
        };
        tx.set(userRef, fresh);
        tx.set(phoneRef, { uid: authUid, createdAt: now });
        return { profile: fresh, isNewUser: true };
      }
    }

    const ueid = await allocateUeidInTransaction(tx, authUid);

    const now = Date.now();
    if (retired) {
      log.info("resolveOrCreateUser fresh registration on retired phone", { phone });
    }
    const profile: UserProfile = {
      uid: authUid,
      ueid,
      phoneE164: phone,
      mobileHash: hashMobileE164(phone),
      displayName: null,
      salutation: null,
      businessName: null,
      workType: null,
      designation: null,
      businessEmail: null,
      language: null,
      profileCompletedAt: null,
      ueidReleasedAt: null,
      onboardingIntroSeenAt: null,
      profileLogo: null,
      pdfBranding: { ...DEFAULT_PDF_BRANDING },
      lastLoginAt: now,
      previousLoginAt: null,
      lastActiveAt: now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      status: "active",
      deletionRequestedAt: null,
      deletionScheduledFor: null,
      deletionCompletedAt: null,
      retiredUeid: false,
    };

    tx.set(doc(db, USERS_COLLECTION, authUid), profile);
    tx.set(phoneRef, { uid: authUid, createdAt: now });
    return { profile, isNewUser: true };
  });
}

async function allocateUeidInTransaction(tx: Transaction, authUid: string): Promise<UEID> {
  const db = getFirebaseDb();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = generateUEID();
    const ueidRef = doc(db, UEID_INDEX_COLLECTION, candidate);
    const ueidSnap = await tx.get(ueidRef);
    if (!ueidSnap.exists()) {
      tx.set(ueidRef, { uid: authUid, status: "active", createdAt: Date.now() });
      return candidate;
    }
    const data = ueidSnap.data() as { retired?: boolean; status?: string };
    if (data.retired === true || data.status === "retired") {
      continue;
    }
  }
  throw new AppError("unknown", "Could not allocate a unique Vyaamikk ID. Please try again.");
}

/**
 * Atomically swap the phone linked to an existing user.
 *
 * Reads (collected first, inside the transaction):
 *   - users/{currentUid} — confirms the user still exists.
 *   - phoneIndex/{newPhone} — must NOT exist OR must point at currentUid.
 *
 * Writes (all-or-nothing):
 *   - delete phoneIndex/{oldPhone}
 *   - set    phoneIndex/{newPhone}  = { uid: currentUid, createdAt: now }
 *   - update users/{currentUid}.phoneE164 = newPhone
 *
 * UEID is preserved.
 *
 * NOTE: This client path is not authoritative for mobile quarantine.
 * Server must enforce assertMobileNotQuarantined + startMobileQuarantine
 * (see functions/src/identity/mobileQuarantine.ts) before any production bind.
 */
async function swapPhoneNumber(
  currentUid: string,
  newPhoneE164: PhoneE164
): Promise<UserProfile> {
  const db = getFirebaseDb();
  const newPhone = normalizePhoneE164(newPhoneE164);
  let releasedPhone: PhoneE164 | null = null;

  const profile = await runTransaction(db, async (tx) => {
    const userRef = doc(db, USERS_COLLECTION, currentUid);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists()) {
      throw new AppError("not_found", "Your account was not found.");
    }
    const user = normaliseUserProfile(
      currentUid,
      userSnap.data() as Record<string, unknown>
    );
    if (user.deletedAt) {
      throw new AppError("not_found", "Your account was not found.");
    }
    if (normalizePhoneE164(user.phoneE164) === newPhone) {
      return user;
    }

    const newPhoneRef = doc(db, PHONE_INDEX_COLLECTION, newPhone);
    const newPhoneSnap = await tx.get(newPhoneRef);
    if (newPhoneSnap.exists()) {
      const { uid: ownerOfNew } = newPhoneSnap.data() as { uid: string };
      if (ownerOfNew !== currentUid) {
        throwDuplicateActiveMobile();
      }
    }

    releasedPhone = normalizePhoneE164(user.phoneE164);
    const oldPhoneRef = doc(db, PHONE_INDEX_COLLECTION, releasedPhone);
    tx.delete(oldPhoneRef);
    tx.set(newPhoneRef, { uid: currentUid, createdAt: Date.now() });
    const now = Date.now();
    tx.update(userRef, {
      phoneE164: newPhone,
      mobileHash: hashMobileE164(newPhone),
      mobileChangedAt: now,
      mobileChangeCount: (user.mobileChangeCount ?? 0) + 1,
      updatedAt: now,
    });

    return {
      ...user,
      phoneE164: newPhone,
      mobileHash: hashMobileE164(newPhone),
      mobileChangedAt: now,
      updatedAt: now,
    };
  });

  if (releasedPhone) {
    await recordRetiredPhone(releasedPhone, profile.ueid, currentUid);
  }
  return profile;
}

export type ProfileUpdateIo = {
  production: boolean;
  ownership?: ProfileWriteOwnership;
  readAuthUid: () => string | null;
  getUserDoc: (uid: string) => Promise<{ exists: boolean; data: Record<string, unknown> | null }>;
  mergeUserDoc: (uid: string, data: Record<string, unknown>) => Promise<void>;
  openBusinessCloud: typeof openBusinessCloud;
  protectBusinessCloud: typeof protectBusinessCloud;
  requireJsAuthSession?: () => Promise<void>;
};

function consentOnlyMerge(write: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!write || !("legalConsents" in write)) return null;
  return {
    legalConsents: write.legalConsents,
    updatedAt: write.updatedAt,
  };
}

/**
 * Production profile write. Consent-only patches merge `legalConsents` and
 * do not open or seal. Sensitive business fields still seal in production;
 * the existing allowlist governs ordinary profile metadata.
 */
export async function updateProfileWithIo(
  uid: string,
  patch: ProfilePatch,
  io: ProfileUpdateIo
): Promise<UserProfile> {
  const owner = io.ownership ?? captureProfileWriteOwnership(uid);
  const assertCurrent = () => {
    if (owner.uid !== uid) throw new AppError("permission_denied", "session_changed");
    assertProfileWriteOwnership(owner, io.readAuthUid());
  };
  assertCurrent();
  if (io.production) {
    await io.requireJsAuthSession?.();
    assertCurrent();
    const rejected = findRejectedProductionPatchKeys(patch);
    if (rejected.length > 0) {
      throw new AppError(
        "permission_denied",
        "This profile field must be updated through the server identity service."
      );
    }
  }

  const snap = await io.getUserDoc(uid);
  assertCurrent();
  if (!snap.exists || !snap.data) throw new AppError("not_found", "User profile not found.");
  const rawProfile = snap.data;
  const consentOnly = isConsentOnlyProfilePatch(patch);

  let existing: ReturnType<typeof normaliseUserProfile>;
  if (consentOnly) {
    // Demographic age is not eligibility. This consent-only merge does not
    // set ageEligibility and does not call openBusinessCloud or
    // protectBusinessCloud. Sensitive writes retain active-account, owner,
    // session, restore, and deletion authorization on the server.
    existing = normaliseUserProfile(uid, rawProfile);
  } else {
    existing = (await io.openBusinessCloud(
      "users",
      normaliseUserProfile(uid, rawProfile) as unknown as Record<string, unknown>,
      rawProfile
    )) as unknown as ReturnType<typeof normaliseUserProfile>;
  }

  const safePatch = io.production
    ? stripServerOwnedProfilePatchKeys(patch, { production: true })
    : patch;
  const linkedPatch =
    consentOnly || io.production
      ? safePatch
      : await enrichPatchWithEmailLink(
          existing,
          safePatch,
          lookupFirestoreEmailIndex,
          commitFirestoreEmailIndexOps
        );
  const next = applyProfilePatch(existing, linkedPatch);

  // Re-read after the document read (and seal open) so a sign-out in that
  // gap cannot seal or publish.
  assertCurrent();

  if (io.production) {
    const write = buildClientProfileFirestoreWrite(existing, next, { production: true });
    if (consentOnly) {
      const consentWrite = consentOnlyMerge(write);
      if (consentWrite) {
        assertCurrent();
        await io.mergeUserDoc(uid, consentWrite);
      }
    } else if (write) {
      const needsSeal = userProfileWriteNeedsSeal(existing as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>);
      let sealed: Record<string, unknown>;
      if (needsSeal) sealed = await io.protectBusinessCloud({
        collection: "users",
        userId: uid,
        recordId: uid,
        revision: Number(next.updatedAt),
        plain: write,
        sensitiveSource: next as unknown as Record<string, unknown>,
        existingRaw: rawProfile,
      });
      else {
        for (const key of BUSINESS_SENSITIVE_FIELDS.users) {
          if (write[key] != null) throw new AppError("save_failed", "This profile change could not be protected.");
        }
        sealed = { ...write };
        delete sealed.contentSeal;
      }
      assertCurrent();
      await io.mergeUserDoc(uid, sealed);
    }
  } else if (consentOnly) {
    const consentWrite = consentOnlyMerge(
      buildClientProfileFirestoreWrite(existing, next, { production: false })
    );
    if (consentWrite) {
      assertCurrent();
      await io.mergeUserDoc(uid, consentWrite);
    }
  } else {
    assertCurrent();
    await io.mergeUserDoc(uid, profileDocumentMergeFields(next));
  }
  assertCurrent();
  return next;
}

export const firebaseAuthService: AuthService = {
  async startOtp(phoneE164: PhoneE164, options?: { forceResend?: boolean }): Promise<OtpChallenge> {
    return startNativePhoneOtp(phoneE164, options);
  },

  async confirmOtp(challenge: OtpChallenge, code: string): Promise<AuthResult> {
    log.info("confirmOtp phase", {
      phase: "OTP_VERIFY_START",
      verificationIdPresent: Boolean(challenge.verificationId),
    });
    await confirmNativePhoneOtp(challenge, code);
    log.info("confirmOtp phase", {
      phase: "FIREBASE_SIGN_IN_SUCCESS",
      firebaseUserPresent: true,
    });
    try {
      const { authPerfMark } = await import("./authFlowPerf");
      authPerfMark("V3_firebase_auth_ok");
    } catch {
      // ignore
    }
    const phone = normalizePhoneE164(challenge.phoneE164);
    if (useIdentityCallables()) {
      try {
        const { authPerfMark } = await import("./authFlowPerf");
        const { beginSharedJsAuthSession } = await import("./jsAuthBridge");
        const { afterPhoneIdentityResolved } = await import("./phoneOtpEmailTransition");
        authPerfMark("V5_resolver_begin");
        // Identity is enough to show email. The JS bridge starts after the
        // account transaction and is shared with the deferred consent write.
        // Email verification keeps using the native phone token. A failed
        // bridge stays a failure for Firestore work.
        const result = await afterPhoneIdentityResolved({
          resolveAccount: async () => {
            const resolved = await callResolveOrCreateUserByPhone(phone);
            authPerfMark("V6_resolver_ok");
            return resolved;
          },
          beginBridge: () => beginSharedJsAuthSession(),
        });
        // Boundary: after identity is known. Clear only transient pending-email
        // cache when this UID is still in unverified email onboarding.
        // Server pendingEmailVerifications are replaced on the next
        // startEmailVerification (not deleted here — no extra callable).
        // Verified returning users are left untouched.
        const { hasAuthoritativeVerifiedEmail } = await import("@/auth/identityRouteState");
        const { shouldClearTransientPendingEmailAfterPhoneAuth } = await import(
          "./pendingEmailPolicy"
        );
        const { clearTransientPendingEmailState } = await import("./pendingEmailVerification");
        if (
          shouldClearTransientPendingEmailAfterPhoneAuth(result.profile) &&
          !hasAuthoritativeVerifiedEmail(result.profile)
        ) {
          clearTransientPendingEmailState(result.profile.uid);
        }
        return result;
      } catch (e) {
        // Firebase phone auth already succeeded — preserve that boundary in diagnostics.
        if (e instanceof AppError) {
          throw new AppError(e.code, e.message, e.cause ?? e, {
            ...e.details,
            authPhase: e.details?.authPhase ?? "post_auth",
            firebaseSignInSucceeded: true,
            diagnosticCode:
              (typeof e.details?.diagnosticCode === "string" && e.details.diagnosticCode) ||
              `POST_AUTH:${e.code}`,
          });
        }
        throw e;
      }
    }
    throw new AppError("auth_not_configured", "Identity callables not available.", undefined, {
      authPhase: "post_auth",
      diagnosticCode: "IDENTITY_CALLABLES_DISABLED",
    });
  },

  async signOut(): Promise<void> {
    const uid = getFirebaseAuth().currentUser?.uid ?? null;
    // Local sign-out already retired this generation. A second bump would
    // look like a newer login and skip the profile clear that still owns it.
    // Same-UID replacement bumps the commit epoch without the bridge generation.
    const retired = currentAuthMutationGeneration();
    const epoch = currentSessionCommitEpoch();
    const stillThisSignOut = () =>
      currentAuthMutationGeneration() === retired && currentSessionCommitEpoch() === epoch;
    retireNativeCallableAuthReady();
    const result = await cleanBothAuthSdks(retired, {
      signOutJs: async () => {
        if (!stillThisSignOut()) throw new Error("session_changed");
        await getFirebaseAuth().signOut();
      },
      signOutNative: async () => {
        const cleared = await signOutNativePhoneAuth(stillThisSignOut);
        if (!cleared) throw new Error("native sign-out incomplete");
      },
    });
    if (result.skippedBecauseNewerSession || !stillThisSignOut()) return;
    if (!result.jsCleared || !result.nativeCleared) {
      log.warn("signOut partial", {
        jsCleared: result.jsCleared,
        nativeCleared: result.nativeCleared,
      });
    }
    if (uid && stillThisSignOut()) {
      const { clearTransientPendingEmailState } = await import("./pendingEmailVerification");
      clearTransientPendingEmailState(uid);
    }
  },

  async requestAccountDeletion(profile: UserProfile) {
    const { requestAccountDeletion } = await import("@/services/accountDeletion");
    return requestAccountDeletion(profile);
  },

  async cancelAccountDeletion(profile: UserProfile) {
    const { cancelAccountDeletion } = await import("@/services/accountDeletion");
    return cancelAccountDeletion(profile);
  },

  async updateProfile(uid: string, patch: ProfilePatch, claim?: ProfileWriteClaim): Promise<UserProfile> {
    const production = useIdentityCallables();
    const db = getFirebaseDb();
    const owner = claim
      ? { ...claim, epoch: claim.epoch ?? currentSessionCommitEpoch() }
      : captureProfileWriteOwnership(uid);
    return updateProfileWithIo(uid, patch, {
      production, ownership: owner,
      readAuthUid: () => production ? readLiveProfileUid() : readJsAuthUid(),
      requireJsAuthSession: production ? async () => {
        const { requireJsAuthSessionForFirestore } = await import("./jsAuthBridge");
        await requireJsAuthSessionForFirestore("update_profile");
      } : undefined,
      getUserDoc: async profileUid => {
        const snap = await getDoc(doc(db, USERS_COLLECTION, profileUid));
        return { exists: snap.exists(), data: snap.exists() ? snap.data() as Record<string, unknown> : null };
      },
      mergeUserDoc: async (profileUid, payload) => { await setDoc(doc(db, USERS_COLLECTION, profileUid), payload, { merge: true }); },
      openBusinessCloud, protectBusinessCloud,
    });
  },

  async startMobileChange(newPhoneE164: PhoneE164, options?: { forceResend?: boolean }): Promise<OtpChallenge> {
    const openingUid = getNativeAuthUid();
    const openingGeneration = currentAuthMutationGeneration();
    const openingEpoch = currentSessionCommitEpoch();
    const contactCurrent = captureNativePhoneContactChangeCurrent();
    const assertCurrent = () => {
      if (!contactCurrent() || getNativeAuthUid() !== openingUid || currentAuthMutationGeneration() !== openingGeneration || currentSessionCommitEpoch() !== openingEpoch) throw new Error("session_changed");
    };
    const phone = normalizePhoneE164(newPhoneE164);
    const { getNativeAuthUid, getNativeAuthPhoneE164 } = await import("./nativePhoneAuth");
    const uid = getNativeAuthUid();
    if (!uid) {
      throw new AppError(
        "auth_failed",
        "You must stay signed in to change your verified mobile number."
      );
    }
    const currentPhone = getNativeAuthPhoneE164();
    if (currentPhone && currentPhone === phone) {
      throw new AppError(
        "invalid_phone",
        "Enter a different mobile number than your current verified number."
      );
    }

    // Server preflight BEFORE mutating Auth — reject collisions without Auth risk.
    const { preflightProductionMobileChange } = await import(
      "./reconcilePendingMobileContactChange"
    );
    await preflightProductionMobileChange(phone);
    assertCurrent();

    const { startNativePhoneContactChangeOtp, NATIVE_CONTACT_CHANGE_PURPOSE } = await import(
      "./nativePhoneContactChange"
    );
    assertCurrent();
    const challenge = await startNativePhoneContactChangeOtp(phone, options);
    assertCurrent();
    log.info("startMobileChange challenge issued", {
      purpose: NATIVE_CONTACT_CHANGE_PURPOSE,
      uidSuffix: uid.slice(-6),
    });
    return challenge;
  },

  async confirmMobileChange(
    currentUid: string,
    challenge: OtpChallenge,
    code: string
  ): Promise<UserProfile> {
    const openingGeneration = currentAuthMutationGeneration();
    const openingEpoch = currentSessionCommitEpoch();
    const contactCurrent = captureNativePhoneContactChangeCurrent();
    const assertCurrent = () => {
      if (!contactCurrent() || getNativeAuthUid() !== currentUid || currentAuthMutationGeneration() !== openingGeneration || currentSessionCommitEpoch() !== openingEpoch) throw new Error("session_changed");
    };
    assertCurrent();
    const {
      confirmNativePhoneContactChangeUpdate,
      NATIVE_CONTACT_CHANGE_PURPOSE,
    } = await import("./nativePhoneContactChange");
    const { getNativeAuthPhoneE164 } = await import("./nativePhoneAuth");
    assertCurrent();
    const oldPhone = getNativeAuthPhoneE164();

    // 1) Update CURRENT Firebase Auth user phone to B (preserves UID).
    const updated = await confirmNativePhoneContactChangeUpdate(challenge, code);
    assertCurrent();
    if (updated.uid !== currentUid) {
      throw new AppError(
        "auth_failed",
        "Mobile change could not preserve your account. No server change was applied."
      );
    }

    // 2) Persist pending + 3) force bridge + 4) atomic server bind.
    // If server bind fails, pending remains; boot reconciles. Never return to
    // Review as success while Auth=B and profile still A.
    const { completeServerMobileBindAfterAuthUpdate } = await import(
      "./reconcilePendingMobileContactChange"
    );
    const profile = await retryOwnedMobileBind({
      isCurrent: () => {
        try { assertCurrent(); return true; } catch { return false; }
      },
      bind: () => completeServerMobileBindAfterAuthUpdate({
        uid: currentUid,
        oldPhoneE164: (oldPhone ?? challenge.phoneE164) as PhoneE164,
        newerPhoneE164: updated.phoneE164,
        operationId: `client_${challenge.verificationId}`,
      }),
    });
    log.info("confirmMobileChange complete", { purpose: NATIVE_CONTACT_CHANGE_PURPOSE });
    return profile;
  },
};

// Re-export internals so the production OTP-wiring code can call them.
export const __firebaseAuthInternals = { resolveOrCreateUser, swapPhoneNumber };

void Timestamp;
void serverTimestamp;
void deleteDoc;
