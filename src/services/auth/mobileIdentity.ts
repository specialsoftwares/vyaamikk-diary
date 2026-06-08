/**
 * Mobile identity policy — login resolution and mobile-change release.
 * Pure functions (testable without React Native / Firestore).
 */

import { AppError } from "@/domain/errors";
import type { IdentityChangeHistoryEntry } from "@/domain/identityRegistry";
import type { PhoneE164, UEID, UserProfile } from "@/domain/types";
import { isActiveAccount } from "@/services/accountDeletion/accountStatus";
import { hashMobileE164, normalizePhoneE164 } from "@/utils/mobileHash";
import { deriveMockUidFromPhone, deriveUEIDFromPhone, generateUEID } from "@/utils/ueid";
import { shortId } from "@/utils/id";
import type { RegistryShape } from "@/services/auth/mockRegistry";

export const MOBILE_DUPLICATE_ACTIVE_MESSAGE =
  "This mobile number is already linked to a Vyaamikk account. Please continue with that account or contact support.";

export const MOBILE_RELEASED_LOGIN_MESSAGE =
  "This mobile number is no longer linked to the previous Vyaamikk account. Please register again or use your current registered number.";

export type PhoneIndexLookup =
  | { kind: "active"; uid: string }
  | { kind: "none" };

/** Whether a released phone may register as a fresh account (never restore old UEID). */
export function shouldFreshRegisterReleasedPhone(): boolean {
  return true;
}

export function throwReleasedMobileLoginBlocked(): never {
  throw new AppError("permission_denied", MOBILE_RELEASED_LOGIN_MESSAGE);
}

export function throwDuplicateActiveMobile(): never {
  throw new AppError("permission_denied", MOBILE_DUPLICATE_ACTIVE_MESSAGE);
}

/**
 * When phone is not in the active index, reject login if an active account
 * still exists at the deterministic dev uid but with a different current mobile
 * (stale slot after mobile change).
 */
export function assertNoStaleActiveAccountAtDerivedUid(
  occupant: UserProfile | undefined,
  loginPhone: PhoneE164
): void {
  if (!occupant || !isActiveAccount(occupant)) return;
  const normalizedLogin = normalizePhoneE164(loginPhone);
  if (normalizePhoneE164(occupant.phoneE164) === normalizedLogin) return;
  throwReleasedMobileLoginBlocked();
}

/** Pick uid for a brand-new registration when the derived slot is occupied. */
export function allocateRegistrationUid(
  occupant: UserProfile | undefined,
  phoneE164: PhoneE164
): string {
  const derived = deriveMockUidFromPhone(phoneE164);
  if (!occupant || !isActiveAccount(occupant)) return derived;
  if (normalizePhoneE164(occupant.phoneE164) === normalizePhoneE164(phoneE164)) {
    return derived;
  }
  return shortId("mock");
}

export function appendIdentityChangeHistory(
  existing: IdentityChangeHistoryEntry[] | undefined,
  entry: IdentityChangeHistoryEntry
): IdentityChangeHistoryEntry[] {
  const prev = existing ?? [];
  return [...prev.slice(-49), entry];
}

export function buildMobileChangedHistory(
  oldPhone: PhoneE164,
  newPhone: PhoneE164,
  at: number
): IdentityChangeHistoryEntry {
  return {
    at,
    action: "mobile_changed",
    meta: {
      oldHash: hashMobileE164(oldPhone),
      newHash: hashMobileE164(newPhone),
    },
  };
}

/** UEID tombstoned for this phone after mobile change / account retirement. */
export function getReleasedUeidForPhone(
  registry: RegistryShape,
  phone: PhoneE164
): UEID | null {
  const normalized = normalizePhoneE164(phone);
  return registry.releasedPhones?.[normalized] ?? null;
}

/** True when an active account already owns this UEID on a different mobile. */
export function isUeidBoundToOtherActivePhone(
  registry: RegistryShape,
  loginPhone: PhoneE164,
  ueid: UEID
): boolean {
  const login = normalizePhoneE164(loginPhone);
  for (const profile of Object.values(registry.users)) {
    if (!isActiveAccount(profile)) continue;
    if (profile.ueid !== ueid) continue;
    if (normalizePhoneE164(profile.phoneE164) !== login) return true;
  }
  return false;
}

/**
 * Resolve UEID for a brand-new mock registration.
 * Never returns a released UEID or one still bound to another active mobile.
 */
export function resolveNewMockAccountUeid(
  registry: RegistryShape,
  phone: PhoneE164,
  retired: boolean
): UEID {
  const releasedUeid = getReleasedUeidForPhone(registry, phone);
  const mustAllocateFresh =
    retired || releasedUeid != null || registry.releasedPhones?.[normalizePhoneE164(phone)] != null;

  if (mustAllocateFresh) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const candidate = generateUEID();
      if (releasedUeid && candidate === releasedUeid) continue;
      if (isUeidBoundToOtherActivePhone(registry, phone, candidate)) continue;
      return candidate;
    }
    return generateUEID();
  }

  const derived = deriveUEIDFromPhone(phone);
  if (isUeidBoundToOtherActivePhone(registry, phone, derived)) {
    return generateUEID();
  }
  return derived;
}

/** Active profile for phone when phoneIndex and current mobile agree. */
export function findActiveProfileForLoginPhone(
  registry: RegistryShape,
  phone: PhoneE164
): UserProfile | null {
  const normalized = normalizePhoneE164(phone);
  if (registry.releasedPhones?.[normalized] != null) return null;
  const uid = registry.phoneIndex[normalized] ?? null;
  if (!uid) return null;
  const profile = registry.users[uid];
  if (!profile || !isActiveAccount(profile)) return null;
  if (normalizePhoneE164(profile.phoneE164) !== normalizePhoneE164(phone)) return null;
  return profile;
}
