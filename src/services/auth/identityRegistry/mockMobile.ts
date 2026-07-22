/**
 * Mock-registry mobile index operations (local-mock backend).
 */

import type { PhoneE164, UEID, UserProfile } from "@/domain/types";
import { isActiveAccount } from "@/services/accountDeletion/accountStatus";
import { recordRetiredPhoneLocal } from "@/services/accountDeletion/retiredIdentity";
import {
  allocateRegistrationUid,
  appendIdentityChangeHistory,
  buildMobileChangedHistory,
} from "@/services/auth/mobileIdentity";
import type { RegistryShape } from "@/services/auth/mockRegistry";
import { hashMobileE164, normalizePhoneE164 } from "@/utils/mobileHash";
import { deriveMockUidFromPhone } from "@/utils/ueid";

export function markPhoneReleasedInRegistry(
  registry: RegistryShape,
  phone: PhoneE164,
  retiredUeid: UEID
): void {
  const normalized = normalizePhoneE164(phone);
  if (!registry.releasedPhones) registry.releasedPhones = {};
  registry.releasedPhones[normalized] = retiredUeid;
}

export function isPhoneReleasedInRegistry(registry: RegistryShape, phone: PhoneE164): boolean {
  const normalized = normalizePhoneE164(phone);
  return registry.releasedPhones?.[normalized] != null;
}

/** Active phone → uid (canonical login index). */
export function readActivePhoneUid(registry: RegistryShape, phone: PhoneE164): string | null {
  const normalized = normalizePhoneE164(phone);
  return registry.phoneIndex[normalized] ?? null;
}

/** Atomically rebind mobile for an existing account (uid and UEID unchanged).
 *
 * Local-mock only — server must enforce mobile quarantine before production bind
 * (functions/src/identity/mobileQuarantine.ts).
 */
export async function applyMockMobileChange(
  registry: RegistryShape,
  existing: UserProfile,
  newPhone: PhoneE164
): Promise<UserProfile> {
  const oldPhone = normalizePhoneE164(existing.phoneE164);
  const nextPhone = normalizePhoneE164(newPhone);
  if (oldPhone === nextPhone) return existing;

  const now = Date.now();
  const preservedUeid = existing.ueid;
  const uid = existing.uid;

  markPhoneReleasedInRegistry(registry, oldPhone, preservedUeid);
  try {
    await recordRetiredPhoneLocal(oldPhone, preservedUeid);
  } catch {
    // AsyncStorage unavailable (e.g. Node tests) — registry tombstone still applies.
  }

  delete registry.phoneIndex[oldPhone];
  registry.phoneIndex[nextPhone] = uid;

  const next: UserProfile = {
    ...existing,
    phoneE164: nextPhone,
    mobileHash: hashMobileE164(nextPhone),
    mobileLinkedAt: existing.mobileLinkedAt ?? existing.createdAt,
    mobileChangedAt: now,
    mobileChangeCount: (existing.mobileChangeCount ?? 0) + 1,
    identityChangeHistory: appendIdentityChangeHistory(
      existing.identityChangeHistory,
      buildMobileChangedHistory(oldPhone, nextPhone, now)
    ),
    updatedAt: now,
  };
  registry.users[uid] = next;
  return next;
}

export function resolveMockRegistrationUid(
  registry: RegistryShape,
  phone: PhoneE164
): string {
  const derived = deriveMockUidFromPhone(phone);
  return allocateRegistrationUid(registry.users[derived], phone);
}

export function isActivePhoneOwnedByOther(
  registry: RegistryShape,
  phone: PhoneE164,
  currentUid: string
): boolean {
  const normalized = normalizePhoneE164(phone);
  const owner = registry.phoneIndex[normalized];
  if (owner && owner !== currentUid) {
    const profile = registry.users[owner];
    return profile != null && isActiveAccount(profile);
  }
  for (const [u, profile] of Object.entries(registry.users)) {
    if (u !== currentUid && isActiveAccount(profile) && normalizePhoneE164(profile.phoneE164) === normalized) {
      return true;
    }
  }
  return false;
}
