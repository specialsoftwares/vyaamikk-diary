/**
 * Shared-dev auth backend.
 *
 *   mock OTP  +  real Firestore identity/profile storage
 *
 * The point of this implementation is to **fix the cross-device profile
 * sync bug** that pure-local dev mode has by definition: AsyncStorage is
 * per-device, so anything keyed there cannot follow a user from iOS to
 * Android. This service writes identity + profile to Firestore (a real
 * shared backend) while still using a mock OTP code (`123456`) so dev
 * testing never needs an SMS gateway.
 *
 * Activation: enabled automatically when `EXPO_PUBLIC_APP_MODE=development`
 * **and** the Firebase config env vars are present. See
 * `src/services/auth/index.ts → getAuthService()` for the selector.
 *
 * Data model (matches production for forward-compat):
 *   • users/{uid}              — full UserProfile document
 *   • phoneIndex/{phoneE164}   — { uid } back-reference, used to find a
 *                                user by phone and to enforce the
 *                                "one phone = one account" invariant
 *                                across the change-mobile flow.
 *
 * uid scheme: we DO NOT use Firebase Auth here (we have no native phone
 * verifier wired up). Instead we derive the uid deterministically from
 * the phone on first sign-up. For all subsequent logins, the phoneIndex
 * is the source of truth — even after the user changes their phone, the
 * uid stays stable.
 *
 * Security note: dev Firestore rules should be permissive (see
 * firestore.rules.dev). DO NOT deploy this scheme to a production
 * Firestore project — production must use the real Firebase Auth-backed
 * flow in firebase.ts.
 */

import {
  doc,
  getDoc,
  runTransaction,
  setDoc,
  type Transaction,
} from "firebase/firestore";

import { AppError } from "@/domain/errors";
import { DEFAULT_PDF_BRANDING, type PhoneE164, type UEID, type UserProfile } from "@/domain/types";
import { applyProfilePatch, normaliseUserProfile } from "./normalizeProfile";
import { applyOtpLoginTimestamps } from "./loginTimestamps";
import { enrichPatchWithEmailLink } from "./emailLink";
import {
  commitFirestoreEmailIndexOps,
  lookupFirestoreEmailIndex,
} from "./emailIndexFirestore";
import { profileDocumentMergeFields } from "./profileFirestorePayload";
import {
  finalizeDeletionIfDue,
  isActiveAccount,
  isPendingDeletionAccount,
} from "@/services/accountDeletion";
import { isPhoneRetiredFirestore, recordRetiredPhone } from "@/services/accountDeletion/retiredIdentity";
import { throwPendingDeletionLoginBlocked } from "@/services/auth/identityErrors";
import {
  assertNoStaleActiveAccountAtDerivedUid,
  throwDuplicateActiveMobile,
  throwReleasedMobileLoginBlocked,
} from "@/services/auth/mobileIdentity";
import { loadProfileByPhoneFirestore } from "@/services/auth/profileByPhone";
import { hashMobileE164, normalizePhoneE164 } from "@/utils/mobileHash";
import { deriveMockUidFromPhone, deriveUEIDFromPhone, generateUEID } from "@/utils/ueid";
import { getFirebaseDb } from "@/config/firebase";
import { createLogger } from "@/utils/logger";

import type {
  AuthService,
  AuthResult,
  OtpChallenge,
  ProfilePatch,
} from "./types";

const log = createLogger("auth/shared-dev");
const MOCK_OTP = "123456";

const USERS_COLLECTION = "users";
const PHONE_INDEX_COLLECTION = "phoneIndex";
const UEID_INDEX_COLLECTION = "ueidIndex";

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

export const sharedDevAuthService: AuthService = {
  async startOtp(phoneE164: PhoneE164): Promise<OtpChallenge> {
    log.info("startOtp", { phone: phoneE164 });
    return {
      verificationId: `sdev_${Date.now()}`,
      phoneE164,
      // Shared-dev must never expose OTP in UI; deterministic 000000 is forbidden here.
      devCodeHint: null,
    };
  },

  async confirmOtp(challenge: OtpChallenge, code: string): Promise<AuthResult> {
    if (code.trim() === "000000") {
      throw new AppError(
        "permission_denied",
        "This verification code cannot be used in this environment."
      );
    }
    if (code.trim() !== MOCK_OTP) {
      throw new AppError("invalid_otp", "Incorrect OTP.");
    }
    const phone = normalizePhoneE164(challenge.phoneE164);
    const existingByPhone = await loadProfileByPhoneFirestore(phone);
    if (existingByPhone) {
      if (isPendingDeletionAccount(existingByPhone)) {
        if (await finalizeDeletionIfDue(existingByPhone)) {
          // Registry cleared — fresh registration below.
        } else {
          throwPendingDeletionLoginBlocked(existingByPhone);
        }
      } else if (!isActiveAccount(existingByPhone)) {
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
      const derivedUid = deriveMockUidFromPhone(phone);
      const derivedRef = doc(db, USERS_COLLECTION, derivedUid);
      const derivedSnap = await tx.get(derivedRef);
      if (derivedSnap.exists()) {
        const occupant = normaliseUserProfile(
          derivedUid,
          derivedSnap.data() as Record<string, unknown>
        );
        assertNoStaleActiveAccountAtDerivedUid(occupant, phone);
      }

      let uid = derivedUid;
      const userRef = doc(db, USERS_COLLECTION, uid);
      const existing = await tx.get(userRef);

      if (existing.exists()) {
        const prior = normaliseUserProfile(uid, existing.data() as Record<string, unknown>);
        if (isActiveAccount(prior) && normalizePhoneE164(prior.phoneE164) === phone) {
          const now = Date.now();
          const loggedIn = applyOtpLoginTimestamps(prior, now);
          tx.update(userRef, {
            lastLoginAt: loggedIn.lastLoginAt,
            previousLoginAt: loggedIn.previousLoginAt,
            lastActiveAt: loggedIn.lastActiveAt,
            updatedAt: loggedIn.updatedAt,
          });
          tx.set(phoneRef, { uid, createdAt: now });
          return { profile: loggedIn, isNewUser: false };
        }
        if (isActiveAccount(prior) && normalizePhoneE164(prior.phoneE164) !== phone) {
          if (retired) {
            uid = `sdev_${Date.now().toString(36)}`;
          } else {
            throwReleasedMobileLoginBlocked();
          }
        }
      }

      const registrationRef = doc(db, USERS_COLLECTION, uid);
      const ueid = retired
        ? await allocateUeidInTransaction(tx, uid)
        : deriveUEIDFromPhone(phone);

      const now = Date.now();
      const profile: UserProfile = {
        uid,
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
      tx.set(registrationRef, profile);
      if (retired) {
        tx.set(doc(db, UEID_INDEX_COLLECTION, ueid), {
          uid,
          status: "active",
          createdAt: now,
        });
      }
      tx.set(phoneRef, { uid, createdAt: now });
      log.info("confirmOtp created (shared-dev)", { uid, ueid });
      return { profile, isNewUser: true };
    });
  },

  async signOut(): Promise<void> {
    // No remote session to invalidate — local session is cleared by caller.
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
    const db = getFirebaseDb();
    const ref = doc(db, USERS_COLLECTION, uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new AppError("not_found", "User profile not found.");
    }
    const existing = normaliseUserProfile(uid, snap.data() as Record<string, unknown>);
    const linkedPatch = await enrichPatchWithEmailLink(
      existing,
      patch,
      lookupFirestoreEmailIndex,
      commitFirestoreEmailIndexOps
    );
    const next = applyProfilePatch(existing, linkedPatch);
    await setDoc(ref, profileDocumentMergeFields(next), { merge: true });
    log.info("updateProfile", { uid, keys: Object.keys(patch) });
    return next;
  },

  async startMobileChange(newPhoneE164: PhoneE164): Promise<OtpChallenge> {
    log.info("startMobileChange", { phone: newPhoneE164 });
    return {
      verificationId: `sdev_chg_${Date.now()}`,
      phoneE164: newPhoneE164,
      // Shared-dev must never expose OTP in UI; deterministic 000000 is forbidden here.
      devCodeHint: null,
    };
  },

  async confirmMobileChange(
    currentUid: string,
    challenge: OtpChallenge,
    code: string
  ): Promise<UserProfile> {
    if (code.trim() !== MOCK_OTP) {
      throw new AppError("invalid_otp", "Incorrect OTP.");
    }
    const newPhone = challenge.phoneE164;
    const db = getFirebaseDb();

    // Atomic swap:
    //   1. Verify the user still exists.
    //   2. Reject if newPhone is already in phoneIndex pointing at a
    //      different (non-deleted) user.
    //   3. delete phoneIndex/{oldPhone}
    //      set    phoneIndex/{newPhone} = { uid: currentUid }
    //      update users/{currentUid}.phoneE164 = newPhone
    //   4. UEID and uid are NEVER touched.
    let releasedPhone: PhoneE164 | null = null;
    const profile = await runTransaction(db, async (tx) => {
      const userRef = doc(db, USERS_COLLECTION, currentUid);
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists()) {
        throw new AppError("not_found", "Your account was not found.");
      }
      const existing = normaliseUserProfile(
        currentUid,
        userSnap.data() as Record<string, unknown>
      );
      if (existing.deletedAt) {
        throw new AppError("not_found", "Your account was not found.");
      }
      if (normalizePhoneE164(existing.phoneE164) === normalizePhoneE164(newPhone)) {
        return existing;
      }

      const newPhoneNorm = normalizePhoneE164(newPhone);
      const newPhoneRef = doc(db, PHONE_INDEX_COLLECTION, newPhoneNorm);
      const newPhoneSnap = await tx.get(newPhoneRef);
      if (newPhoneSnap.exists()) {
        const { uid: ownerOfNew } = newPhoneSnap.data() as { uid: string };
        if (ownerOfNew !== currentUid) {
          const otherSnap = await tx.get(doc(db, USERS_COLLECTION, ownerOfNew));
          if (otherSnap.exists()) {
            const other = normaliseUserProfile(
              ownerOfNew,
              otherSnap.data() as Record<string, unknown>
            );
            if (isActiveAccount(other)) {
              throwDuplicateActiveMobile();
            }
          }
        }
      }

      const oldPhone = normalizePhoneE164(existing.phoneE164);
      releasedPhone = oldPhone;
      const oldPhoneRef = doc(db, PHONE_INDEX_COLLECTION, oldPhone);
      tx.delete(oldPhoneRef);
      tx.set(newPhoneRef, { uid: currentUid, createdAt: Date.now() });
      const now = Date.now();
      tx.update(userRef, {
        phoneE164: newPhoneNorm,
        mobileHash: hashMobileE164(newPhoneNorm),
        mobileChangedAt: now,
        mobileChangeCount: (existing.mobileChangeCount ?? 0) + 1,
        updatedAt: now,
      });

      return {
        ...existing,
        phoneE164: newPhoneNorm,
        mobileHash: hashMobileE164(newPhoneNorm),
        mobileChangedAt: now,
        updatedAt: now,
      };
    });

    if (releasedPhone) {
      await recordRetiredPhone(releasedPhone, profile.ueid, currentUid);
    }
    return profile;
  },
};
