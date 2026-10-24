/**
 * Session save/load/delete queue. SecureStore and AsyncStorage stay in
 * session.ts. Logout and login share this queue so an older delete cannot
 * erase a newer save.
 */

import type { UserProfile } from "@/domain/types";
import { normaliseProfileSalutation } from "@/domain/profileSalutation";
import { authRetirementOwns } from "@/services/auth/authSessionFence";

export const SESSION_KEY = "vyd_session_v2";
export const LEGACY_SESSION_KEY = "vyd_session_v1";

export type SessionStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
};

export interface AuthSession {
  user: UserProfile;
  signedInAt: number;
  /** Session activity mirror of `user.lastActiveAt` (not shown as "last login"). */
  lastActiveAt: number;
}

let defaultStorage: SessionStorage | null = null;
let activeStorage: SessionStorage | null = null;
let persistQueue: Promise<void> = Promise.resolve();

function enqueuePersist<T>(work: () => Promise<T>): Promise<T> {
  const run = persistQueue.then(work, work);
  persistQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export function installSessionStorage(storage: SessionStorage): void {
  defaultStorage = storage;
  activeStorage = storage;
  persistQueue = Promise.resolve();
}

/** Test seam. Passing null restores the installed production storage. */
export function __setSessionStorageForTests(next: SessionStorage | null): void {
  activeStorage = next ?? defaultStorage;
  persistQueue = Promise.resolve();
}

function storage(): SessionStorage {
  if (!activeStorage) {
    throw new Error("Session storage is not installed.");
  }
  return activeStorage;
}

function isProfileShape(value: unknown): value is UserProfile {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.uid === "string" && typeof v.ueid === "string" && typeof v.phoneE164 === "string";
}

async function loadSession(): Promise<AuthSession | null> {
  try {
    await storage().deleteItem(LEGACY_SESSION_KEY);
  } catch {
    // ignore — purely a cleanup step
  }

  const raw = await storage().getItem(SESSION_KEY);
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
      typeof parsed.user.profileCompletedAt === "number" ? parsed.user.profileCompletedAt : null;
    const user = {
      ...parsed.user,
      salutation: normaliseProfileSalutation(parsed.user.salutation),
      designation: typeof parsed.user.designation === "string" ? parsed.user.designation : null,
      businessEmail: typeof parsed.user.businessEmail === "string" ? parsed.user.businessEmail : null,
      deletionScheduledFor:
        typeof parsed.user.deletionScheduledFor === "number" ? parsed.user.deletionScheduledFor : null,
      ueidReleasedAt:
        typeof parsed.user.ueidReleasedAt === "number" ? parsed.user.ueidReleasedAt : completedAt,
      onboardingIntroSeenAt:
        typeof parsed.user.onboardingIntroSeenAt === "number"
          ? parsed.user.onboardingIntroSeenAt
          : completedAt,
      profileLogo: parsed.user.profileLogo ?? null,
      pdfBranding: parsed.user.pdfBranding ?? { includeProfileLogo: true },
      lastLoginAt: typeof parsed.user.lastLoginAt === "number" ? parsed.user.lastLoginAt : null,
      previousLoginAt:
        typeof parsed.user.previousLoginAt === "number" ? parsed.user.previousLoginAt : null,
      lastActiveAt: typeof parsed.user.lastActiveAt === "number" ? parsed.user.lastActiveAt : null,
    };
    return {
      user,
      signedInAt: parsed.signedInAt,
      lastActiveAt: user.lastActiveAt ?? sessionLastActive,
    };
  } catch {
    return null;
  }
}

export const sessionStore = {
  async load(): Promise<AuthSession | null> {
    return enqueuePersist(() => loadSession());
  },
  async save(session: AuthSession): Promise<void> {
    await enqueuePersist(() => storage().setItem(SESSION_KEY, JSON.stringify(session)));
  },
  /** A profile response must still own the session when its queued write runs. */
  async saveIfCurrent(session: AuthSession, isCurrent: () => boolean): Promise<boolean> {
    return enqueuePersist(async () => {
      if (!isCurrent()) return false;
      await storage().setItem(SESSION_KEY, JSON.stringify(session));
      if (isCurrent()) return true;
      // This callback still owns the persistence queue. Any newer login save
      // runs after this cleanup, so it cannot be erased by the stale response.
      await storage().deleteItem(SESSION_KEY);
      return false;
    });
  },
  async clear(): Promise<void> {
    await enqueuePersist(async () => {
      await storage().deleteItem(SESSION_KEY);
      await storage().deleteItem(LEGACY_SESSION_KEY);
    });
  },
};

/**
 * Logout delete. Ownership is checked when this queued callback runs, and
 * again before the legacy-key delete. A save queued behind an in-flight
 * delete is written after that delete returns.
 */
export async function clearSessionForRetirement(ownedGeneration: number): Promise<boolean> {
  return enqueuePersist(async () => {
    if (!authRetirementOwns(ownedGeneration)) return false;
    await storage().deleteItem(SESSION_KEY);
    if (!authRetirementOwns(ownedGeneration)) return false;
    await storage().deleteItem(LEGACY_SESSION_KEY);
    return authRetirementOwns(ownedGeneration);
  });
}
