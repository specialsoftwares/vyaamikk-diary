/**
 * Development-only auth backend.
 *
 * IDENTITY MODEL (P0 invariant):
 *
 *   • UEID belongs to the user, not the phone number.
 *   • `phoneIndex` is the canonical active-mobile → uid map.
 *   • On mobile change, the old number is retired (released) and must
 *     never recover the same UEID via `deriveUEIDFromPhone`.
 *   • `uid` stays stable across mobile change (no re-key).
 *
 *   Local/mock enforces uniqueness on this device only. Production /
 *   shared-dev use Firestore indexes + retiredPhones tombstones.
 */

import { AppError } from "@/domain/errors";
import {
  DEFAULT_PDF_BRANDING,
  type PhoneE164,
  type UserProfile,
} from "@/domain/types";
import { applyProfilePatch } from "./normalizeProfile";
import { applyOtpLoginTimestamps } from "./loginTimestamps";
import { enrichPatchWithEmailLink } from "./emailLink";
import {
  commitLocalEmailIndexOpsInRegistry,
  lookupLocalEmailIndex,
} from "./emailIndexLocal";
import {
  isActiveAccount,
  isPendingDeletionAccount,
} from "@/services/accountDeletion/accountStatus";
import { isPhoneRetiredLocally } from "@/services/accountDeletion/retiredIdentity";
import {
  loadMockRegistry,
  saveMockRegistry,
} from "@/services/auth/mockRegistry";
import {
  applyMockMobileChange,
  isActivePhoneOwnedByOther,
  isPhoneReleasedInRegistry,
  resolveMockRegistrationUid,
} from "@/services/auth/identityRegistry/mockMobile";
import {
  assertNoStaleActiveAccountAtDerivedUid,
  findActiveProfileForLoginPhone,
  resolveNewMockAccountUeid,
  throwDuplicateActiveMobile,
} from "@/services/auth/mobileIdentity";
import { throwPendingDeletionLoginBlocked } from "@/services/auth/identityErrors";
import { hashMobileE164, normalizePhoneE164 } from "@/utils/mobileHash";
import { deriveMockUidFromPhone } from "@/utils/ueid";
import { createLogger } from "@/utils/logger";
import {
  localMockConfirmMobileOtp,
  localMockStartMobileOtp,
} from "@/services/auth/localMockMobileOtp";

import type {
  AuthService,
  AuthResult,
  OtpChallenge,
  ProfilePatch,
} from "./types";

const log = createLogger("auth/mock");

export { loadMockProfileByPhone, __resetMockRegistry } from "@/services/auth/mockRegistry";

export const mockAuthService: AuthService = {
  async startOtp(phoneE164: PhoneE164): Promise<OtpChallenge> {
    log.info("startOtp", { phone: phoneE164 });
    const result = await localMockStartMobileOtp(phoneE164, "login");
    return {
      verificationId: result.verificationId,
      phoneE164: result.phoneE164,
      devCodeHint: null,
      expiresAt: result.expiresAt,
      resendAvailableAt: result.resendAvailableAt,
    };
  },

  async confirmOtp(challenge: OtpChallenge, code: string): Promise<AuthResult> {
    await localMockConfirmMobileOtp(challenge, code, "login");

    const phone = normalizePhoneE164(challenge.phoneE164);
    const registry = await loadMockRegistry();
    const seenBefore = registry.seenPhones[phone] === true;

    const activeForPhone = findActiveProfileForLoginPhone(registry, phone);
    if (activeForPhone) {
      const indexedUid = activeForPhone.uid;
      let cached: UserProfile | undefined = registry.users[indexedUid];
      if (cached && isPendingDeletionAccount(cached)) {
        const { finalizeDeletionIfDue } = await import(
          "@/services/accountDeletion/finalizeIfDue"
        );
        if (await finalizeDeletionIfDue(cached)) {
          cached = undefined;
        } else {
          throwPendingDeletionLoginBlocked(cached);
        }
      }
      if (cached && isActiveAccount(cached)) {
        cached.uid = indexedUid;
        if (!cached.pdfBranding) cached.pdfBranding = { ...DEFAULT_PDF_BRANDING };
        if (cached.profileLogo === undefined) cached.profileLogo = null;
        const loggedIn = applyOtpLoginTimestamps(cached);
        registry.users[indexedUid] = loggedIn;
        registry.phoneIndex[phone] = indexedUid;
        registry.seenPhones[phone] = true;
        await saveMockRegistry(registry);
        log.info("confirmOtp existing", { uid: indexedUid, ueid: loggedIn.ueid, isNewUser: !seenBefore });
        return { profile: loggedIn, isNewUser: !seenBefore };
      }
    }

    const retired =
      isPhoneReleasedInRegistry(registry, phone) || (await isPhoneRetiredLocally(phone));
    assertNoStaleActiveAccountAtDerivedUid(registry.users[deriveMockUidFromPhone(phone)], phone);

    const uid = resolveMockRegistrationUid(registry, phone);
    const stale = registry.users[uid];
    if (stale && !isActiveAccount(stale)) {
      delete registry.users[uid];
    }

    const ueid = resolveNewMockAccountUeid(registry, phone, retired);
    const now = Date.now();
    const profile: UserProfile = {
      uid,
      ueid,
      phoneE164: phone,
      mobileHash: hashMobileE164(phone),
      mobileLinkedAt: now,
      mobileChangedAt: null,
      mobileChangeCount: 0,
      identityChangeHistory: [{ at: now, action: "account_created" }],
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
    registry.users[uid] = profile;
    registry.phoneIndex[phone] = uid;
    registry.seenPhones[phone] = true;
    await saveMockRegistry(registry);
    log.info("confirmOtp created", { uid, ueid, retired });
    return { profile, isNewUser: !seenBefore };
  },

  async updateProfile(uid: string, patch: ProfilePatch): Promise<UserProfile> {
    const registry = await loadMockRegistry();
    const existing = registry.users[uid];
    if (!existing) {
      throw new AppError("not_found", "User profile not found.");
    }
    const linkedPatch = await enrichPatchWithEmailLink(
      existing,
      patch,
      lookupLocalEmailIndex,
      async (ops) => {
        commitLocalEmailIndexOpsInRegistry(registry, ops);
      }
    );
    const next = applyProfilePatch(existing, linkedPatch);
    registry.users[uid] = next;
    await saveMockRegistry(registry);
    log.info("updateProfile", { uid, patchKeys: Object.keys(patch) });
    return next;
  },

  async startMobileChange(newPhoneE164: PhoneE164): Promise<OtpChallenge> {
    log.info("startMobileChange", { phone: newPhoneE164 });
    const result = await localMockStartMobileOtp(newPhoneE164, "mobile_change_new");
    return {
      verificationId: result.verificationId,
      phoneE164: result.phoneE164,
      devCodeHint: null,
      expiresAt: result.expiresAt,
      resendAvailableAt: result.resendAvailableAt,
    };
  },

  async confirmMobileChange(
    currentUid: string,
    challenge: OtpChallenge,
    code: string
  ): Promise<UserProfile> {
    await localMockConfirmMobileOtp(challenge, code, "mobile_change_new");

    const newPhone = normalizePhoneE164(challenge.phoneE164);
    const registry = await loadMockRegistry();
    const existing = registry.users[currentUid];
    if (!existing) {
      throw new AppError("not_found", "Your account was not found.");
    }
    if (normalizePhoneE164(existing.phoneE164) === newPhone) {
      return existing;
    }

    if (isActivePhoneOwnedByOther(registry, newPhone, currentUid)) {
      throwDuplicateActiveMobile();
    }

    const next = await applyMockMobileChange(registry, existing, newPhone);
    registry.seenPhones[newPhone] = true;
    await saveMockRegistry(registry);
    log.info("confirmMobileChange", {
      uid: currentUid,
      oldPhone: existing.phoneE164,
      newPhone,
      ueid: next.ueid,
    });
    return next;
  },

  async signOut(): Promise<void> {
    // Session cleared by caller.
  },

  async requestAccountDeletion(profile: UserProfile) {
    const { requestAccountDeletion } = await import("@/services/accountDeletion");
    return requestAccountDeletion(profile);
  },

  async cancelAccountDeletion(profile: UserProfile) {
    const { cancelAccountDeletion } = await import("@/services/accountDeletion");
    return cancelAccountDeletion(profile);
  },
};
