/**
 * Session persistence layer (V2).
 *
 * SecureStore on native, AsyncStorage on web. The persisted shape is the
 * full UserProfile + signedInAt so that on boot the app can restore not
 * only identity (uid, ueid, phone) but also whether the user has
 * completed the profile step — that's what gates the dashboard.
 *
 * V1 wrote a tiny `{uid, ueid, phoneE164, signedInAt}` shape under
 * `vyd_session_v1`. We bump to `vyd_session_v2` so:
 *   • old v1 sessions are ignored (the user signs in once more — and gets
 *     back the same deterministic UEID, so nothing is lost),
 *   • we don't have to lie about missing fields on a v1 cache.
 */

import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import type { UserProfile } from "@/domain/types";
import { normaliseProfileSalutation } from "@/domain/profileSalutation";

const KEY = "vyd_session_v2";
const LEGACY_KEY = "vyd_session_v1";

const isSecureStoreAvailable = Platform.OS === "ios" || Platform.OS === "android";

export interface AuthSession {
  user: UserProfile;
  signedInAt: number;
  /** Session activity mirror of `user.lastActiveAt` (not shown as "last login"). */
  lastActiveAt: number;
}

async function setItem(key: string, value: string): Promise<void> {
  if (isSecureStoreAvailable) {
    await SecureStore.setItemAsync(key, value);
  } else {
    await AsyncStorage.setItem(key, value);
  }
}

async function getItem(key: string): Promise<string | null> {
  if (isSecureStoreAvailable) {
    return SecureStore.getItemAsync(key);
  }
  return AsyncStorage.getItem(key);
}

async function deleteItem(key: string): Promise<void> {
  if (isSecureStoreAvailable) {
    await SecureStore.deleteItemAsync(key);
  } else {
    await AsyncStorage.removeItem(key);
  }
}

function isProfileShape(value: unknown): value is UserProfile {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.uid === "string" && typeof v.ueid === "string" && typeof v.phoneE164 === "string";
}

export const sessionStore = {
  async load(): Promise<AuthSession | null> {
    // Best-effort: discard any v1 session so we never accidentally use the
    // old minimal shape (which lacks profileCompletedAt etc.).
    try {
      await deleteItem(LEGACY_KEY);
    } catch {
      // ignore — purely a cleanup step
    }

    const raw = await getItem(KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<AuthSession>;
      if (!parsed || !isProfileShape(parsed.user) || typeof parsed.signedInAt !== "number") {
        return null;
      }
      const sessionLastActive =
        typeof parsed.lastActiveAt === "number"
          ? parsed.lastActiveAt
          : typeof parsed.user.lastActiveAt === "number"
            ? parsed.user.lastActiveAt
            : parsed.signedInAt;
      const completedAt =
        typeof parsed.user.profileCompletedAt === "number"
          ? parsed.user.profileCompletedAt
          : null;
      const user = {
        ...parsed.user,
        salutation: normaliseProfileSalutation(parsed.user.salutation),
        designation:
          typeof parsed.user.designation === "string" ? parsed.user.designation : null,
        businessEmail:
          typeof parsed.user.businessEmail === "string" ? parsed.user.businessEmail : null,
        deletionScheduledFor:
          typeof parsed.user.deletionScheduledFor === "number"
            ? parsed.user.deletionScheduledFor
            : null,
        ueidReleasedAt:
          typeof parsed.user.ueidReleasedAt === "number"
            ? parsed.user.ueidReleasedAt
            : completedAt,
        onboardingIntroSeenAt:
          typeof parsed.user.onboardingIntroSeenAt === "number"
            ? parsed.user.onboardingIntroSeenAt
            : completedAt,
        profileLogo: parsed.user.profileLogo ?? null,
        pdfBranding: parsed.user.pdfBranding ?? { includeProfileLogo: true },
        lastLoginAt:
          typeof parsed.user.lastLoginAt === "number" ? parsed.user.lastLoginAt : null,
        previousLoginAt:
          typeof parsed.user.previousLoginAt === "number"
            ? parsed.user.previousLoginAt
            : null,
        lastActiveAt:
          typeof parsed.user.lastActiveAt === "number" ? parsed.user.lastActiveAt : null,
      };
      return {
        user,
        signedInAt: parsed.signedInAt,
        lastActiveAt: user.lastActiveAt ?? sessionLastActive,
      };
    } catch {
      return null;
    }
  },
  async save(session: AuthSession): Promise<void> {
    await setItem(KEY, JSON.stringify(session));
  },
  async clear(): Promise<void> {
    await deleteItem(KEY);
    await deleteItem(LEGACY_KEY);
  },
};

/**
 * DEV / reset helper — clears session from SecureStore AND AsyncStorage, then verifies gone.
 * Reloading the app does NOT clear session; this must run explicitly.
 */
export async function forceClearAllSessions(): Promise<void> {
  await sessionStore.clear();
  try {
    await AsyncStorage.removeItem(KEY);
    await AsyncStorage.removeItem(LEGACY_KEY);
  } catch {
    // ignore
  }
  if (isSecureStoreAvailable) {
    try {
      await SecureStore.deleteItemAsync(KEY);
      await SecureStore.deleteItemAsync(LEGACY_KEY);
    } catch {
      // ignore
    }
  }
  const remaining = await sessionStore.load();
  if (remaining) {
    throw new Error("Session could not be cleared. Please try again.");
  }
}
