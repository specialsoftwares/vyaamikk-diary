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
  stripServerOwnedProfilePatchKeys,
} from "./clientProfilePatchPayload";
import { profileDocumentMergeFields } from "./profileFirestorePayload";
import {
  finalizeDeletionIfDue,
  isActiveAccount,
  isPendingDeletionAccount,
} from "@/services/accountDeletion";
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
} from "./nativePhoneAuth";

import type {
  AuthService,
  AuthResult,
  OtpChallenge,
  ProfilePatch,
} from "./types";

const log = createLogger("auth/firebase");

const USERS_COLLECTION = "users";
const PHONE_INDEX_COLLECTION = "phoneIndex";
const UEID_INDEX_COLLECTION = "ueidIndex";

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

export const firebaseAuthService: AuthService = {
  async startOtp(phoneE164: PhoneE164): Promise<OtpChallenge> {
    return startNativePhoneOtp(phoneE164);
  },

  async confirmOtp(challenge: OtpChallenge, code: string): Promise<AuthResult> {
    await confirmNativePhoneOtp(challenge, code);
    const phone = normalizePhoneE164(challenge.phoneE164);
    if (useIdentityCallables()) {
      const result = await callResolveOrCreateUserByPhone(phone);
      // Bridge the native session to the JS SDK so Firestore/Storage
      // requests carry request.auth (rules require it). Non-fatal: the
      // record layer surfaces its own retryable error if this fails.
      const { ensureJsAuthSession } = await import("./jsAuthBridge");
      await ensureJsAuthSession();
      return result;
    }
    throw new AppError("auth_not_configured", "Identity callables not available.");
  },

  async signOut(): Promise<void> {
    try {
      await getFirebaseAuth().signOut();
      await signOutNativePhoneAuth();
    } catch (e) {
      log.warn("signOut failed", e);
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

  async updateProfile(uid: string, patch: ProfilePatch): Promise<UserProfile> {
    const production = useIdentityCallables();
    if (production) {
      const { ensureJsAuthSession } = await import("./jsAuthBridge");
      await ensureJsAuthSession();
      const rejected = findRejectedProductionPatchKeys(patch);
      if (rejected.length > 0) {
        throw new AppError(
          "permission_denied",
          "This profile field must be updated through the server identity service."
        );
      }
    }
    const db = getFirebaseDb();
    const ref = doc(db, USERS_COLLECTION, uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new AppError("not_found", "User profile not found.");
    const existing = normaliseUserProfile(uid, snap.data() as Record<string, unknown>);

    const safePatch = production
      ? stripServerOwnedProfilePatchKeys(patch, { production: true })
      : patch;

    const linkedPatch = production
      ? safePatch
      : await enrichPatchWithEmailLink(
          existing,
          safePatch,
          lookupFirestoreEmailIndex,
          commitFirestoreEmailIndexOps
        );

    const next = applyProfilePatch(existing, linkedPatch);
    if (production) {
      const write = buildClientProfileFirestoreWrite(existing, next, { production: true });
      if (write) {
        await setDoc(ref, write, { merge: true });
      }
    } else {
      await setDoc(ref, profileDocumentMergeFields(next), { merge: true });
    }
    return next;
  },

  async startMobileChange(newPhoneE164: PhoneE164): Promise<OtpChallenge> {
    throw new AppError(
      "permission_denied",
      "Mobile number change is support/admin-only and not available in the app."
    );
  },

  async confirmMobileChange(
    _currentUid: string,
    _challenge: OtpChallenge,
    _code: string
  ): Promise<UserProfile> {
    throw new AppError(
      "permission_denied",
      "Mobile number change is support/admin-only and not available in the app."
    );
  },
};

// Re-export internals so the production OTP-wiring code can call them.
export const __firebaseAuthInternals = { resolveOrCreateUser, swapPhoneNumber };

void Timestamp;
void serverTimestamp;
void deleteDoc;
