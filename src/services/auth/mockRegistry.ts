/**
 * Mock auth registry persistence (AsyncStorage).
 * Kept separate from mock.ts so account-deletion flows do not create a require cycle.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  DEFAULT_PDF_BRANDING,
  type EmailIndexEntry,
  type PhoneE164,
  type UEID,
  type UserProfile,
} from "@/domain/types";
import { hashMobileE164, normalizePhoneE164 } from "@/utils/mobileHash";
import { hashEmail, normalizeEmail } from "@/utils/emailHash";
import { deriveMockUidFromPhone, deriveUEIDFromPhone, generateUEID } from "@/utils/ueid";
import { createLogger } from "@/utils/logger";

const log = createLogger("auth/mockRegistry");
const REGISTRY_KEY = "vyd_mock_registry_v1";
const DIARY_KEY_PREFIX = "vyd_diary_v1_";

export interface RegistryShape {
  /** Canonical mobile → uid index (one active account per phone on this device). */
  phoneIndex: Record<string, string>;
  /** Released mobiles — must not restore prior UEID on re-login (device-local). */
  releasedPhones?: Record<PhoneE164, UEID>;
  /** Email hash → account index (device-local uniqueness in mock mode). */
  emailIndex: Record<string, EmailIndexEntry>;
  /** Phones we've previously confirmed OTP for on THIS device. */
  seenPhones: Record<string, true>;
  /** Cached profile, keyed by the current uid. */
  users: Record<string, UserProfile>;
}

function isModernRegistryShape(parsed: Record<string, unknown>): boolean {
  return (
    parsed.phoneIndex != null &&
    typeof parsed.phoneIndex === "object" &&
    parsed.users != null &&
    typeof parsed.users === "object"
  );
}

/** Drop stale phoneIndex rows that do not match the user's current mobile. */
export function reconcileRegistryPhoneIndex(registry: RegistryShape): boolean {
  let dirty = false;
  const released = registry.releasedPhones ?? {};
  for (const [phone, uid] of Object.entries({ ...registry.phoneIndex })) {
    const profile = registry.users[uid];
    const normalized = normalizePhoneE164(phone);
    if (
      released[normalized] != null ||
      !profile ||
      !profile.phoneE164 ||
      normalizePhoneE164(profile.phoneE164) !== normalized
    ) {
      delete registry.phoneIndex[phone];
      dirty = true;
    }
  }
  for (const profile of Object.values(registry.users)) {
    if (!profile?.phoneE164 || profile.status === "deleted") continue;
    const phone = normalizePhoneE164(profile.phoneE164);
    if (registry.phoneIndex[phone] !== profile.uid) {
      registry.phoneIndex[phone] = profile.uid;
      dirty = true;
    }
  }
  return dirty;
}

async function migrateAndLoad(): Promise<RegistryShape> {
  const raw = await AsyncStorage.getItem(REGISTRY_KEY);
  if (!raw) return { phoneIndex: {}, emailIndex: {}, seenPhones: {}, users: {}, releasedPhones: {} };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { phoneIndex: {}, emailIndex: {}, seenPhones: {}, users: {}, releasedPhones: {} };
  }

  if (isModernRegistryShape(parsed)) {
    const registry: RegistryShape = {
      phoneIndex: { ...(parsed.phoneIndex as Record<string, string>) },
      emailIndex: (parsed.emailIndex as Record<string, EmailIndexEntry> | undefined) ?? {},
      seenPhones: (parsed.seenPhones as Record<string, true> | undefined) ?? {},
      users: { ...(parsed.users as Record<string, UserProfile>) },
      releasedPhones: (parsed.releasedPhones as Record<PhoneE164, UEID> | undefined) ?? {},
    };
    for (const profile of Object.values(registry.users)) {
      if (profile && typeof profile.uid === "string") {
        registry.users[profile.uid] = { ...profile, uid: profile.uid };
      }
    }
    const dirty = reconcileRegistryPhoneIndex(registry);
    if (dirty) {
      log.info("registry reconciled phoneIndex", {
        phones: Object.keys(registry.phoneIndex).length,
        released: Object.keys(registry.releasedPhones ?? {}).length,
      });
      await persist(registry);
    }
    return registry;
  }

  const oldPhoneToUid =
    (parsed.phoneToUid as Record<string, string> | undefined) ?? {};
  const oldUsers =
    (parsed.users as Record<string, Partial<UserProfile> & { phoneE164?: string }> | undefined) ??
    {};
  const previousSeen = (parsed.seenPhones as Record<string, true> | undefined) ?? {};

  const next: RegistryShape = {
    phoneIndex: {},
    emailIndex: (parsed.emailIndex as Record<string, EmailIndexEntry> | undefined) ?? {},
    seenPhones: { ...previousSeen },
    users: {},
    releasedPhones: (parsed.releasedPhones as Record<PhoneE164, UEID> | undefined) ?? {},
  };

  let dirty = false;

  const releasedSet = new Set(
    Object.keys(next.releasedPhones ?? {}).map((p) => normalizePhoneE164(p))
  );

  for (const [oldKey, user] of Object.entries(oldUsers)) {
    if (!user || typeof user !== "object") continue;
    const phone = user.phoneE164;
    if (!phone) continue;
    const normalizedPhone = normalizePhoneE164(phone);

    const existingUid =
      typeof user.uid === "string" && user.uid.trim() ? user.uid.trim() : oldKey;
    const targetUid = existingUid || deriveMockUidFromPhone(phone);
    const phoneRetired = releasedSet.has(normalizedPhone);
    const targetUeid =
      typeof user.ueid === "string" && user.ueid.trim()
        ? user.ueid.trim()
        : phoneRetired
          ? generateUEID()
          : deriveUEIDFromPhone(phone);

    const needsUidChange = oldKey !== targetUid;
    const needsUeidChange = !user.ueid || user.ueid !== targetUeid;

    if (needsUidChange) {
      await migrateMockDiaryEntries(oldKey, targetUid);
      dirty = true;
    }
    if (needsUeidChange) {
      dirty = true;
    }

    const u = user as UserProfile;
    next.users[targetUid] = {
      uid: targetUid,
      ueid: targetUeid,
      phoneE164: phone,
      displayName: u.displayName ?? null,
      salutation: u.salutation ?? null,
      businessName: u.businessName ?? null,
      workType: u.workType ?? null,
      designation: u.designation ?? null,
      businessEmail: u.businessEmail ?? null,
      language: u.language ?? null,
      profileCompletedAt: u.profileCompletedAt ?? null,
      ueidReleasedAt: u.ueidReleasedAt ?? u.profileCompletedAt ?? null,
      onboardingIntroSeenAt: u.onboardingIntroSeenAt ?? u.profileCompletedAt ?? null,
      profileLogo: u.profileLogo ?? null,
      pdfBranding: u.pdfBranding ?? { ...DEFAULT_PDF_BRANDING },
      lastLoginAt: u.lastLoginAt ?? null,
      previousLoginAt: u.previousLoginAt ?? null,
      lastActiveAt: u.lastActiveAt ?? null,
      createdAt: u.createdAt ?? Date.now(),
      updatedAt:
        needsUidChange || needsUeidChange ? Date.now() : u.updatedAt ?? Date.now(),
      deletedAt: u.deletedAt ?? null,
      status: u.status ?? (u.deletedAt != null ? "deleted" : "active"),
      deletionRequestedAt: u.deletionRequestedAt ?? null,
      deletionScheduledFor: u.deletionScheduledFor ?? null,
      deletionCompletedAt: u.deletionCompletedAt ?? null,
      mobileHash: u.mobileHash ?? hashMobileE164(phone),
      retiredUeid: u.retiredUeid ?? false,
    };
    if (!phoneRetired) {
      next.phoneIndex[normalizedPhone] = targetUid;
    }
    next.seenPhones[normalizedPhone] = true;
  }

  for (const phone of Object.keys(oldPhoneToUid)) {
    if (!next.seenPhones[phone]) {
      next.seenPhones[phone] = true;
      dirty = true;
    }
  }

  for (const u of Object.values(next.users)) {
    if (!u.businessEmail?.trim()) continue;
    const hash = u.emailHash ?? hashEmail(normalizeEmail(u.businessEmail));
    if (next.emailIndex[hash]?.userId === u.uid) continue;
    if (next.emailIndex[hash] && next.emailIndex[hash].userId !== u.uid) continue;
    next.emailIndex[hash] = {
      emailHash: hash,
      userId: u.uid,
      ueid: u.ueid,
      status: u.status ?? "active",
      emailStatus: u.emailStatus ?? "unverified",
      linkedAt: u.emailLinkedAt ?? u.updatedAt,
      verifiedAt: u.emailVerifiedAt ?? null,
    };
    dirty = true;
  }

  if (dirty) {
    log.info("registry migrated", {
      migratedUsers: Object.keys(next.users).length,
      seenPhones: Object.keys(next.seenPhones).length,
    });
    await persist(next);
  }
  return next;
}

/** Re-keys per-user diary AsyncStorage when mock uid changes (phone change). */
export async function migrateMockDiaryEntries(oldUid: string, newUid: string): Promise<void> {
  if (oldUid === newUid) return;
  const oldKey = `${DIARY_KEY_PREFIX}${oldUid}`;
  const newKey = `${DIARY_KEY_PREFIX}${newUid}`;
  const oldData = await AsyncStorage.getItem(oldKey);
  if (!oldData) return;
  const existingNew = await AsyncStorage.getItem(newKey);
  if (existingNew) {
    log.warn("diary migration skipped — target uid already has entries", { oldUid, newUid });
    return;
  }
  await AsyncStorage.setItem(newKey, oldData);
  await AsyncStorage.removeItem(oldKey);
  log.info("diary entries migrated", { oldUid, newUid });
}

async function persist(reg: RegistryShape): Promise<void> {
  await AsyncStorage.setItem(REGISTRY_KEY, JSON.stringify(reg));
}

export async function loadMockRegistry(): Promise<RegistryShape> {
  return migrateAndLoad();
}

export async function saveMockRegistry(reg: RegistryShape): Promise<void> {
  await persist(reg);
}

export async function loadMockProfileByPhone(phoneE164: PhoneE164): Promise<UserProfile | null> {
  const phone = normalizePhoneE164(phoneE164);
  const registry = await migrateAndLoad();
  const uid = registry.phoneIndex[phone];
  if (!uid) return null;
  const profile = registry.users[uid];
  if (!profile) return null;
  if (normalizePhoneE164(profile.phoneE164) !== phone) return null;
  return profile;
}

/** Removes mock registry entry after local purge (account deletion). */
export async function removeMockRegistryUser(
  uid: string,
  phoneE164: PhoneE164
): Promise<void> {
  const registry = await migrateAndLoad();
  const phone = normalizePhoneE164(phoneE164);
  const existing = registry.users[uid];
  const emailHash = existing?.emailHash;
  delete registry.users[uid];
  delete registry.phoneIndex[phone];
  delete registry.seenPhones[phone];
  if (registry.releasedPhones) delete registry.releasedPhones[phone];
  if (emailHash) delete registry.emailIndex[emailHash];
  await persist(registry);
  log.info("removeMockRegistryUser", { uid, phone: phoneE164 });
}

/** Test helper — wipes the mock registry. Not exported via the barrel. */
export async function __resetMockRegistry(): Promise<void> {
  await AsyncStorage.removeItem(REGISTRY_KEY);
}
