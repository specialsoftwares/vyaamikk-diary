/**
 * Global auth state.
 *
 * Holds the active session + full user profile, exposes high-level actions
 * (startOtp, confirmOtp, signOut, updateProfile). Screens consume this via
 * `useAuth()` and never call the service layer directly.
 *
 * The session is persisted to SecureStore (full UserProfile + signedInAt),
 * so on boot the router can decide between dashboard and Complete Profile
 * without any backend call.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, InteractionManager } from "react-native";

import type { PhoneE164, UserProfile } from "@/domain/types";
import {
  getAuthService,
  type OtpChallenge,
  type ProfilePatch,
} from "@/services/auth";
import { sessionStore, forceClearAllSessions, type AuthSession } from "@/services/session";
import { toAppError } from "@/domain/errors";
import { clearMasterDataSessionCache } from "@/services/masterData";
import { createLogger } from "@/utils/logger";
import { getActiveBackend, type ActiveBackend } from "@/config/env";
import { isLoginBlockedAccount } from "@/services/accountDeletion/accountStatus";
import { useLocalDb } from "@/state/localDb";
import { clearAuthWrapperProgress } from "@/auth-v2/authWrapperProgress";

const log = createLogger("state/auth");

const SESSION_REVALIDATION_MS = 6_000;

async function revalidateSessionProfile(
  user: UserProfile,
  backend: ActiveBackend
): Promise<{ profile: UserProfile | null; unverified: boolean }> {
  const timeout = new Promise<{ kind: "timeout" }>((resolve) => {
    setTimeout(() => resolve({ kind: "timeout" }), SESSION_REVALIDATION_MS);
  });
  const load = loadProfileForBootRevalidation(user, backend)
    .then((profile) => ({ kind: "ok" as const, profile }))
    .catch((e) => {
      // Transient failure (offline, bridge unavailable) must NOT sign the
      // user out — only a confirmed missing/blocked profile does that.
      log.warn("session revalidation failed", e);
      return { kind: "timeout" as const };
    });

  const result = await Promise.race([load, timeout]);
  if (result.kind === "timeout") {
    return { profile: null, unverified: true };
  }
  return { profile: result.profile, unverified: false };
}

async function loadProfileForBootRevalidation(
  user: UserProfile,
  backend: ActiveBackend
): Promise<UserProfile | null> {
  if (backend === "local-mock") {
    const { loadMockProfileByPhone } = await import("@/services/auth/mock");
    return loadMockProfileByPhone(user.phoneE164);
  }
  if (backend === "firebase-production") {
    // Production rules lock phoneIndex down, so the profile must be read
    // by uid — which requires the JS-SDK auth bridge to be established.
    const { ensureJsAuthSession } = await import("@/services/auth/jsAuthBridge");
    const bridged = await ensureJsAuthSession();
    if (!bridged) {
      throw new Error("JS auth bridge unavailable — keeping cached session");
    }
    const { loadProfileByUidFirestore } = await import("@/services/auth/profileByPhone");
    return loadProfileByUidFirestore(user.uid);
  }
  if (backend === "firebase-shared-dev") {
    const { loadProfileByPhoneFirestore } = await import("@/services/auth/profileByPhone");
    return loadProfileByPhoneFirestore(user.phoneE164);
  }
  return null;
}

async function loadLiveProfileForSession(
  phoneE164: PhoneE164,
  backend: ActiveBackend
): Promise<UserProfile | null> {
  if (backend === "local-mock") {
    const { loadMockProfileByPhone } = await import("@/services/auth/mock");
    return loadMockProfileByPhone(phoneE164);
  }
  if (backend === "firebase-production" || backend === "firebase-shared-dev") {
    const { loadProfileByPhoneFirestore } = await import("@/services/auth/profileByPhone");
    return loadProfileByPhoneFirestore(phoneE164);
  }
  return null;
}

// Print which backend is in use once, at module load. This makes
// "why don't my profile changes sync across devices?" answerable in
// 5 seconds by checking the Metro console.
log.info("active backend", { backend: getActiveBackend() });

export type AuthStatus = "loading" | "signed_out" | "signed_in";

interface AuthState {
  status: AuthStatus;
  session: AuthSession | null;
  user: UserProfile | null;
  /** True for the brief window after first OTP success, before "Continue to Diary". */
  justCreated: boolean;
}

interface AuthApi extends AuthState {
  /** DEV: force-clear SecureStore session + in-memory auth (after dev reset). */
  hardDevSignOut(): Promise<void>;
  startOtp(phoneE164: PhoneE164): Promise<OtpChallenge>;
  confirmOtp(challenge: OtpChallenge, code: string): Promise<UserProfile>;
  signOut(): Promise<void>;
  requestAccountDeletion(): Promise<import("@/domain/accountDeletion").AccountDeletionResult>;
  cancelAccountDeletion(phoneE164: PhoneE164): Promise<UserProfile>;
  /** Save session after production account reactivation (post email verify). */
  finishReactivation(profile: UserProfile): Promise<UserProfile>;
  acknowledgeUEID(): void;
  updateProfile(patch: ProfilePatch): Promise<UserProfile>;
  /** Persist usage heartbeat (`lastActiveAt` only — never login fields). */
  touchLastActive(): Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { status: dbStatus } = useLocalDb();
  const [state, setState] = useState<AuthState>({
    status: "loading",
    session: null,
    user: null,
    justCreated: false,
  });

  // Boot — local DB first, then restore session from SecureStore (no network wait).
  useEffect(() => {
    if (dbStatus === "loading") return;
    if (dbStatus === "failed") {
      setState((s) => ({ ...s, status: "signed_out" }));
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const session = await sessionStore.load();
        if (cancelled) return;
        if (session) {
          let user = session.user;
          const backend = getActiveBackend();
          const { profile: live, unverified } = await revalidateSessionProfile(
            user,
            backend
          );

          if (unverified) {
            log.warn("session revalidation unverified — using cached session for boot");
            setState({
              status: "signed_in",
              session,
              user,
              justCreated: false,
            });
            return;
          }

          if (!live || isLoginBlockedAccount(live)) {
            await forceClearAllSessions();
            setState((s) => ({ ...s, status: "signed_out" }));
            return;
          }

          if (__DEV__ && live.uid !== user.uid) {
            log.warn("dev session uid mismatch — clearing stale SecureStore session");
            await forceClearAllSessions();
            setState((s) => ({ ...s, status: "signed_out" }));
            return;
          }

          if (live.updatedAt !== user.updatedAt || live.status !== user.status) {
            user = live;
            await sessionStore.save({ ...session, user });
          }

          setState({
            status: "signed_in",
            session: { ...session, user },
            user,
            justCreated: false,
          });
        } else {
          setState((s) => ({ ...s, status: "signed_out" }));
        }
      } catch (e) {
        log.error("boot failed", e);
        setState((s) => ({ ...s, status: "signed_out" }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dbStatus]);

  const saveSession = useCallback(
    async (user: UserProfile, opts?: { preserveSignedInAt?: boolean }) => {
      const now = Date.now();
      const signedInAt = opts?.preserveSignedInAt
        ? (state.session?.signedInAt ?? user.lastLoginAt ?? now)
        : (user.lastLoginAt ?? now);
      const lastActiveAt =
        user.lastActiveAt ?? state.session?.lastActiveAt ?? signedInAt;
      const session: AuthSession = {
        user,
        signedInAt,
        lastActiveAt,
      };
      await sessionStore.save(session);
      return session;
    },
    [state.session?.signedInAt, state.session?.lastActiveAt]
  );

  const startOtp = useCallback(async (phoneE164: PhoneE164) => {
    try {
      return await getAuthService().startOtp(phoneE164);
    } catch (e) {
      throw toAppError(e);
    }
  }, []);

  const confirmOtp = useCallback(
    async (challenge: OtpChallenge, code: string) => {
      try {
        const { profile, isNewUser } = await getAuthService().confirmOtp(challenge, code);
        if (state.user?.uid && state.user.uid !== profile.uid) {
          clearMasterDataSessionCache();
        }
        const session = await saveSession(profile);
        setState({
          status: "signed_in",
          session,
          user: session.user,
          justCreated: isNewUser,
        });
        void import("@/services/device/trustedDeviceRegistry").then((m) =>
          m.recordTrustedDeviceLogin(profile)
        );
        return profile;
      } catch (e) {
        throw toAppError(e);
      }
    },
    [saveSession]
  );

  const signOut = useCallback(async () => {
    const uid = state.session?.user.uid;
    try {
      await getAuthService().signOut();
    } catch (e) {
      log.warn("auth signOut error", e);
    }
    if (uid) await clearAuthWrapperProgress(uid);
    await forceClearAllSessions();
    clearMasterDataSessionCache();
    setState({
      status: "signed_out",
      session: null,
      user: null,
      justCreated: false,
    });
  }, [state.session?.user.uid]);

  const hardDevSignOut = useCallback(async () => {
    if (!__DEV__) return;
    const uid = state.session?.user.uid;
    if (uid) await clearAuthWrapperProgress(uid);
    await forceClearAllSessions();
    clearMasterDataSessionCache();
    setState({
      status: "signed_out",
      session: null,
      user: null,
      justCreated: false,
    });
  }, [state.session?.user.uid]);

  const requestAccountDeletion = useCallback(async () => {
    if (!state.session) {
      throw toAppError(new Error("Not signed in."));
    }
    try {
      const result = await getAuthService().requestAccountDeletion(state.session.user);
      await sessionStore.clear();
      clearMasterDataSessionCache();
      setState({
        status: "signed_out",
        session: null,
        user: null,
        justCreated: false,
      });
      return result;
    } catch (e) {
      log.warn("requestAccountDeletion error", e);
      throw toAppError(e);
    }
  }, [state.session]);

  const cancelAccountDeletion = useCallback(async (phoneE164: PhoneE164) => {
    const backend = getActiveBackend();
    const profile = await loadLiveProfileForSession(phoneE164, backend);
    if (!profile) {
      throw toAppError(new Error("Account not found."));
    }
    try {
      return await getAuthService().cancelAccountDeletion(profile);
    } catch (e) {
      throw toAppError(e);
    }
  }, []);

  const finishReactivation = useCallback(
    async (profile: UserProfile) => {
      if (getActiveBackend() === "firebase-production") {
        void import("@/services/auth/jsAuthBridge").then((m) =>
          m.ensureJsAuthSession()
        );
      }
      const session = await saveSession(profile);
      setState({
        status: "signed_in",
        session,
        user: session.user,
        justCreated: false,
      });
      void import("@/services/device/trustedDeviceRegistry").then((m) =>
        m.recordTrustedDeviceLogin(profile)
      );
      return profile;
    },
    [saveSession]
  );

  const acknowledgeUEID = useCallback(() => {
    setState((s) => ({ ...s, justCreated: false }));
  }, []);

  const updateProfile = useCallback(
    async (patch: ProfilePatch): Promise<UserProfile> => {
      const current = state.session?.user;
      if (!current) throw toAppError(new Error("Not signed in."));
      try {
        const next = await getAuthService().updateProfile(current.uid, patch);
        const session = await saveSession(next, { preserveSignedInAt: true });
        setState((s) => ({ ...s, session, user: session.user }));
        return session.user;
      } catch (e) {
        throw toAppError(e);
      }
    },
    [state.session, saveSession]
  );

  const sessionRef = useRef(state.session);
  const statusRef = useRef(state.status);
  sessionRef.current = state.session;
  statusRef.current = state.status;

  const touchLastActive = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || statusRef.current !== "signed_in") return;
    const now = Date.now();
    const prev = current.user.lastActiveAt ?? current.lastActiveAt ?? 0;
    if (now - prev < 60_000) return;

    const user: UserProfile = { ...current.user, lastActiveAt: now };
    const session: AuthSession = { ...current, lastActiveAt: now, user };
    await sessionStore.save(session);
    sessionRef.current = session;

    setState((s) => {
      if (s.status !== "signed_in") return s;
      return { ...s, session, user: session.user };
    });

    try {
      void getAuthService()
        .updateProfile(current.user.uid, { lastActiveAt: now })
        .catch((e) => log.warn("touchLastActive profile sync failed", e));
    } catch (e) {
      log.warn("touchLastActive profile sync failed", e);
    }
  }, []);

  const touchRef = useRef(touchLastActive);
  touchRef.current = touchLastActive;

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void touchRef.current();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (state.status !== "signed_in" || !state.session) return;
    const task = InteractionManager.runAfterInteractions(() => {
      void touchRef.current();
    });
    return () => task.cancel();
  }, [state.status, state.session?.user?.uid]);

  const api = useMemo<AuthApi>(
    () => ({
      ...state,
      startOtp,
      confirmOtp,
      signOut,
      hardDevSignOut,
      requestAccountDeletion,
      cancelAccountDeletion,
      finishReactivation,
      acknowledgeUEID,
      updateProfile,
      touchLastActive,
    }),
    [
      state,
      startOtp,
      confirmOtp,
      signOut,
      hardDevSignOut,
      requestAccountDeletion,
      cancelAccountDeletion,
      finishReactivation,
      acknowledgeUEID,
      updateProfile,
      touchLastActive,
    ]
  );

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
