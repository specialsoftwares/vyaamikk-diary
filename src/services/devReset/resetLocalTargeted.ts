import AsyncStorage from "@react-native-async-storage/async-storage";

import { hashEmail, normalizeEmail } from "@/utils/emailHash";
import { normalizePhoneE164 } from "@/utils/mobileHash";
import type { UserProfile } from "@/domain/types";
import { purgeLocalAccountData } from "@/services/accountDeletion/purgeLocal";
import {
  loadMockRegistry,
  removeMockRegistryUser,
  saveMockRegistry,
} from "@/services/auth/mockRegistry";
import { loadMockProfileByPhone } from "@/services/auth/mock";
import { createLogger } from "@/utils/logger";

import { assertDevResetAllowed } from "./guards";
import {
  clearDevInMemoryCaches,
  purgeSqliteDevTablesForUser,
  removeDevAsyncKeysForUser,
} from "./purgeDevExtras";

const log = createLogger("devReset/localTargeted");

export interface DevResetTarget {
  phone?: string;
  email?: string;
  ueid?: string;
}

export interface DevLocalTargetedResetResult {
  scope: "local_targeted";
  found: boolean;
  userId?: string;
  ueid?: string;
  phoneE164?: string;
}

async function resolveTargetProfile(target: DevResetTarget): Promise<UserProfile | null> {
  const registry = await loadMockRegistry();

  if (target.phone?.trim()) {
    const phone = normalizePhoneE164(target.phone.trim());
    const byRegistry = await loadMockProfileByPhone(phone);
    if (byRegistry) return byRegistry;
    const uid = registry.phoneIndex[phone];
    return uid ? (registry.users[uid] ?? null) : null;
  }

  if (target.email?.trim()) {
    const hash = hashEmail(normalizeEmail(target.email));
    const idx = registry.emailIndex[hash];
    if (idx?.userId) return registry.users[idx.userId] ?? null;
    return (
      Object.values(registry.users).find(
        (u) => u.businessEmail?.toLowerCase() === normalizeEmail(target.email!)
      ) ?? null
    );
  }

  if (target.ueid?.trim()) {
    const ueid = target.ueid.trim().toUpperCase();
    return Object.values(registry.users).find((u) => u.ueid === ueid) ?? null;
  }

  return null;
}

/** Remove one test identity and all linked local data on this device. */
export async function resetLocalDevDataForTarget(
  confirmation: string,
  target: DevResetTarget
): Promise<DevLocalTargetedResetResult> {
  assertDevResetAllowed(confirmation);

  if (!target.phone && !target.email && !target.ueid) {
    throw new Error("Provide --phone, --email, or --ueid for targeted reset.");
  }

  const profile = await resolveTargetProfile(target);
  if (!profile) {
    log.info("target not found locally", target);
    return { scope: "local_targeted", found: false };
  }

  log.info("resetLocalDevDataForTarget", {
    uid: profile.uid,
    ueid: profile.ueid,
    phone: profile.phoneE164,
  });

  await purgeLocalAccountData({
    userId: profile.uid,
    profileLogo: profile.profileLogo,
  });
  purgeSqliteDevTablesForUser(profile.uid);
  await removeDevAsyncKeysForUser(profile.uid);
  await removeMockRegistryUser(profile.uid, profile.phoneE164);

  const registry = await loadMockRegistry();
  if (profile.emailHash) {
    delete registry.emailIndex[profile.emailHash];
    await saveMockRegistry(registry);
  }

  await scrubRetiredPhoneLocal(profile.phoneE164);
  clearDevInMemoryCaches();

  return {
    scope: "local_targeted",
    found: true,
    userId: profile.uid,
    ueid: profile.ueid,
    phoneE164: profile.phoneE164,
  };
}

async function scrubRetiredPhoneLocal(phoneE164: string): Promise<void> {
  const key = "vyd_retired_phones_v1";
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return;
  try {
    const store = JSON.parse(raw) as Record<string, unknown>;
    delete store[phoneE164];
    await AsyncStorage.setItem(key, JSON.stringify(store));
  } catch {
    // ignore
  }
}

export { resolveTargetProfile };
