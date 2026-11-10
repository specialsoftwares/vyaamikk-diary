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
import { AppState, InteractionManager, Platform } from "react-native";

import type { PhoneE164, UserProfile } from "@/domain/types";
import {
  getAuthService,
  type OtpChallenge,
  type ProfilePatch,
} from "@/services/auth";
import {
  clearSessionForRetirement,
  forceClearAllSessions,
  sessionStore,
  type AuthSession,
} from "@/services/session";
import {
  authRetirementOwns,
  beginSessionCommit,
  clearPersistedProfileIfOwned,
  currentAuthMutationGeneration,
  currentSessionCommitEpoch,
  retireJsAuthBridge,
  runLocalDeviceSignOut,
  type LocalSignOutResult,
} from "@/services/auth/authSessionFence";
import { retainLocalAccountOnLogout } from "@/services/accountDeletion/localAccountBoundary";
import { prepareLocalAccountKey } from "@/services/accountDeletion/localKeyLifecycle";
import {
  commitAfterLocalReadiness,
  openRetainedSession,
  sessionChangedError,
  sessionStillOwned,
  type SessionClaim,
  type SessionLive,
} from "@/services/accountDeletion/sessionLocalReadiness";
import { sessionPublicationLive } from "@/services/accountDeletion/sessionPublication";
import { getNativeAuthUid } from "@/services/auth/nativePhoneAuth";
import { confirmFailureForOwnedEpoch } from "@/services/auth/profileWriteOwnership";
import { phoneAuthCopy } from "@/auth-v2/phoneAuthCopy";
import { PHONE_SESSION_BOUND_MS, raceOwnedPublication } from "@/auth-v2/phoneAuthOperation";

function readPublicationLive(): SessionLive {
  let jsUid: string | null = null;
  if (Platform.OS === "web") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getFirebaseAuth } = require("@/config/firebase") as {
        getFirebaseAuth: () => { currentUser?: { uid?: string | null } | null };
      };
      jsUid = getFirebaseAuth().currentUser?.uid ?? null;
    } catch {
      jsUid = null;
    }
  }
  return sessionPublicationLive({
    platform: Platform.OS,
    nativeUid: getNativeAuthUid(),
    jsUid,
    generation: currentAuthMutationGeneration(),
    epoch: currentSessionCommitEpoch(),
  });
}
import { markAuthStage } from "@/services/auth/authStageTiming";
import { retireNativeCallableAuthReady } from "@/services/auth/nativeCallableAuthGate";
import { AppError, toAppError } from "@/domain/errors";
import { clearMasterDataSessionCache } from "@/services/masterData";
import { createLogger } from "@/utils/logger";
import {
  env,
  getActiveBackend,
  getResolvedEnvironment,
  type ActiveBackend,
} from "@/config/env";
import { formatRuntimeDiagnostics } from "@/config/runtimeEnvironment";
import { isLoginBlockedAccount } from "@/services/accountDeletion/accountStatus";
import { useLocalDb } from "@/state/localDb";
import { clearAuthWrapperProgress } from "@/auth-v2/authWrapperProgress";
import { clearTransientPendingEmailState } from "@/services/auth/pendingEmailVerification";
import { clearLocalMockPendingEmailForUid } from "@/services/auth/localMockEmailOtp";
import {
  beginFirstActionFreezeSession,
  endFirstActionFreezeSession,
  markFirstActionFreeze,
} from "@/diagnostics/firstActionFreezeDiag";
import {
  claimSessionLastActiveTouch,
  clearSessionLastActiveTouch,
  releaseSessionLastActiveTouch,
} from "@/services/auth/sessionLastActiveTouch";

const log = createLogger("state/auth");

// Print resolved runtime + backend once at module load (no secrets).
try {
  log.info(
    "runtime environment",
    formatRuntimeDiagnostics(getResolvedEnvironment(), env.firebase.projectId)
  );
} catch (e) {
  log.warn("runtime environment log skipped", e);
}

const SESSION_REVALIDATION_MS = 6_000;
const SESSION_RESTORE_DEADLINE_MS = 8_000;

function raceDeadline<T>(work: Promise<T>, ms: number): Promise<T | "deadline"> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("deadline"), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve("deadline");
      }
    );
  });
}

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
  startOtp(phoneE164: PhoneE164, options?: { forceResend?: boolean }): Promise<OtpChallenge>;
  confirmOtp(
    challenge: OtpChallenge,
    code: string,
    opts?: { deadlineAt?: number }
  ): Promise<UserProfile>;
  signOut(): Promise<LocalSignOutResult>;
  requestAccountDeletion(): Promise<import("@/domain/accountDeletion").AccountDeletionResult>;
  cancelAccountDeletion(phoneE164: PhoneE164): Promise<UserProfile>;
  /** Save session after production account reactivation (post email verify). */
  finishReactivation(
    profile: UserProfile,
    claim?: SessionClaim,
    stillCurrent?: () => boolean
  ): Promise<UserProfile>;
  acknowledgeUEID(): void;
  updateProfile(
    patch: ProfilePatch,
    opts?: { user?: UserProfile; ownedGeneration?: number; ownedEpoch?: number; isCurrent?: () => boolean }
  ): Promise<UserProfile>;
  /** Refresh session from a server-returned profile (email bind, reactivation). */
  applyServerProfile(
    profile: UserProfile,
    ownedGeneration?: number,
    readLiveUid?: () => string | null,
    ownedEpoch?: number
  ): Promise<UserProfile>;
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
  const bootAttemptRef = useRef(0);

  // Boot — local DB first, then restore session from SecureStore (no network wait).
  useEffect(() => {
    if (dbStatus === "loading") return;
    if (dbStatus === "failed") {
      setState((s) => ({ ...s, status: "signed_out" }));
      return;
    }

    let cancelled = false;
    const attempt = ++bootAttemptRef.current;
    const bootStillCurrent = () => !cancelled && attempt === bootAttemptRef.current;
    const restore = (async () => {
      try {
        const session = await sessionStore.load();
        if (!bootStillCurrent()) return;
        if (session) {
          const keyStarted = globalThis.performance?.now?.() ?? Date.now();
          const decision = await openRetainedSession({
            session,
            prepare: (uid) => prepareLocalAccountKey(uid),
            liveUid: getNativeAuthUid(),
          });
          if (!bootStillCurrent()) return;
          if (decision.action !== "publish") {
            setState((s) => ({ ...s, status: "signed_out" }));
            return;
          }
          markAuthStage("LOCAL_KEY_READY", keyStarted);
          let user = session.user;
          const backend = getActiveBackend();
          const { profile: live, unverified } = await revalidateSessionProfile(
            user,
            backend
          );

          if (unverified) {
            log.warn("session revalidation unverified — using cached session for boot");
            if (!bootStillCurrent()) return;
            setState({
              status: "signed_in",
              session,
              user,
              justCreated: false,
            });
            return;
          }

          if (!live || isLoginBlockedAccount(live)) {
            const { applyLocalDeletionPolicy } = await import(
              "@/services/accountDeletion/localDevicePolicy"
            );
            await applyLocalDeletionPolicy({
              cachedUser: user,
              liveUser: live,
              liveMissingOrDeleted: !live || isLoginBlockedAccount(live),
            });
            await forceClearAllSessions();
            if (!bootStillCurrent()) return;
            setState((s) => ({ ...s, status: "signed_out" }));
            return;
          }

          if (__DEV__ && live.uid !== user.uid) {
            log.warn("dev session uid mismatch — clearing stale SecureStore session");
            await forceClearAllSessions();
            if (!bootStillCurrent()) return;
            setState((s) => ({ ...s, status: "signed_out" }));
            return;
          }

          if (live.updatedAt !== user.updatedAt || live.status !== user.status) {
            user = live;
            await sessionStore.save({ ...session, user });
          }

          if (!bootStillCurrent()) return;
          setState({
            status: "signed_in",
            session: { ...session, user },
            user,
            justCreated: false,
          });

          // Finish Auth=B / profile=A mobile rebind if a prior attempt was interrupted.
          if (backend === "firebase-production") {
            void import("@/services/auth/reconcilePendingMobileContactChange")
              .then(async (m) => {
                if (!bootStillCurrent()) return;
                const next = await m.reconcilePendingMobileContactChange(user);
                if (!next || !bootStillCurrent()) return;
                const nextSession = {
                  ...session,
                  user: next,
                };
                await sessionStore.save(nextSession);
                if (!bootStillCurrent()) return;
                setState({
                  status: "signed_in",
                  session: nextSession,
                  user: next,
                  justCreated: false,
                });
              })
              .catch((e) => {
                log.warn("pending mobile contact reconcile deferred", e);
              });
          }
        } else {
          if (!bootStillCurrent()) return;
          setState((s) => ({ ...s, status: "signed_out" }));
        }
      } catch (e) {
        log.error("boot failed", e);
        if (!bootStillCurrent()) return;
        setState((s) => ({ ...s, status: "signed_out" }));
      }
    })();
    void (async () => {
      const raced = await raceDeadline(restore, SESSION_RESTORE_DEADLINE_MS);
            if (!bootStillCurrent()) return;
      if (raced === "deadline") {
        log.warn("session_restore_deadline");
        setState((current) =>
          current.status === "loading"
            ? { status: "signed_out", session: null, user: null, justCreated: false }
            : current
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dbStatus]);

  const saveSession = useCallback(
    async (
      user: UserProfile,
      opts?: {
        preserveSignedInAt?: boolean;
        claim?: SessionClaim;
        isCurrent?: () => boolean;
      }
    ) => {
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
      const claim: SessionClaim = opts?.claim ?? {
        uid: user.uid,
        generation: currentAuthMutationGeneration(),
        epoch: currentSessionCommitEpoch(),
      };
      if (claim.uid !== user.uid) throw sessionChangedError();
      const owned = () =>
        sessionStillOwned(claim, readPublicationLive()) && (opts?.isCurrent?.() ?? true);
      const keyStarted = globalThis.performance?.now?.() ?? Date.now();
      await commitAfterLocalReadiness({
        claim,
        readLive: () => {
          const live = readPublicationLive();
          if (opts?.isCurrent && !opts.isCurrent()) return { ...live, uid: null };
          return live;
        },
        prepare: () => prepareLocalAccountKey(user.uid),
        save: async () => {
          if (!(await sessionStore.saveIfCurrent(session, owned))) {
            throw sessionChangedError();
          }
        },
      });
      markAuthStage("SESSION_PUBLISH", keyStarted);
      return session;
    },
    [state.session?.signedInAt, state.session?.lastActiveAt]
  );

  const startOtp = useCallback(async (phoneE164: PhoneE164, options?: { forceResend?: boolean }) => {
    bootAttemptRef.current += 1;
    try {
      return await getAuthService().startOtp(phoneE164, options);
    } catch (e) {
      throw toAppError(e);
    }
  }, []);

  const confirmOtp = useCallback(
    async (challenge: OtpChallenge, code: string, opts?: { deadlineAt?: number }) => {
      bootAttemptRef.current += 1;
      const epoch = beginSessionCommit();
      try {
        const { profile, isNewUser } = await getAuthService().confirmOtp(challenge, code);
        const claim: SessionClaim = {
          uid: profile.uid,
          generation: currentAuthMutationGeneration(),
          epoch,
        };
        const remaining =
          opts?.deadlineAt != null ? Math.max(0, opts.deadlineAt - Date.now()) : PHONE_SESSION_BOUND_MS;
        const sessionBudget = Math.min(PHONE_SESSION_BOUND_MS, remaining);
        const published = await raceOwnedPublication({
          budgetMs: sessionBudget,
          retireClaim: () => {
            beginSessionCommit();
          },
          run: async () => {
            if (state.user?.uid && state.user.uid !== profile.uid) {
              clearMasterDataSessionCache();
            }
            if (!sessionStillOwned(claim, readPublicationLive())) throw sessionChangedError();
            const session = await saveSession(profile, { claim });
            if (!sessionStillOwned(claim, readPublicationLive())) throw sessionChangedError();
            setState((current) => {
              if (!sessionStillOwned(claim, readPublicationLive())) return current;
              if (current.session && current.session.user.uid === profile.uid && currentSessionCommitEpoch() !== claim.epoch) {
                return current;
              }
              return {
                status: "signed_in",
                session,
                user: session.user,
                justCreated: isNewUser,
              };
            });
            void import("@/services/device/trustedDeviceRegistry").then((m) =>
              m.recordTrustedDeviceLogin(profile)
            );
            return profile;
          },
        });
        if (published.status === "unknown") {
          throw new AppError(
            "otp_send_failed",
            phoneAuthCopy("en").resultUnknown,
            undefined,
            { phoneAuthSettlement: "unknown", authPhase: "session" }
          );
        }
        return published.value;
      } catch (e) {
        if (e instanceof AppError && e.details?.phoneAuthSettlement === "unknown") throw e;
        throw toAppError(confirmFailureForOwnedEpoch({ ownedEpoch: epoch, currentEpoch: currentSessionCommitEpoch(), error: e }));
      }
    },
    [saveSession, state.user?.uid]
  );

  const signOut = useCallback(async () => {
    bootAttemptRef.current += 1;
    const signOutEpoch = beginSessionCommit();
    const uid = state.session?.user.uid;
    return runLocalDeviceSignOut({
      maskPrivateUi: () => {
        setState({
          status: "signed_out",
          session: null,
          user: null,
          justCreated: false,
        });
      },
      retireCloudAdmission: () => {
        retireNativeCallableAuthReady();
        retireJsAuthBridge();
      },
      cleanAuthSdks: async () => {
        try {
          await getAuthService().signOut();
        } catch (e) {
          log.warn("auth signOut error", e);
        }
      },
      clearLocalProfileCache: (ownedGeneration) =>
        clearPersistedProfileIfOwned(ownedGeneration, {
          prepare: async () => {
            const stillThisSignOut = () =>
              currentSessionCommitEpoch() === signOutEpoch && authRetirementOwns(ownedGeneration);
            if (!stillThisSignOut()) return;
            if (uid) {
              await clearAuthWrapperProgress(uid, stillThisSignOut);
              if (!stillThisSignOut()) return;
              clearTransientPendingEmailState(uid);
              clearLocalMockPendingEmailForUid(uid);
            }
            if (!stillThisSignOut()) return;
            clearSessionLastActiveTouch(uid);
            endFirstActionFreezeSession();
            clearMasterDataSessionCache();
            retainLocalAccountOnLogout(uid);
          },
          removePersistedProfile: async () => {
            if (currentSessionCommitEpoch() !== signOutEpoch || !authRetirementOwns(ownedGeneration)) return;
            await clearSessionForRetirement(ownedGeneration);
          },
        }).then(() => undefined),
    });
  }, [state.session?.user.uid]);

  const hardDevSignOut = useCallback(async () => {
    if (!__DEV__) return;
    const uid = state.session?.user.uid;
    if (uid) {
      await clearAuthWrapperProgress(uid);
      clearTransientPendingEmailState(uid);
      clearLocalMockPendingEmailForUid(uid);
    }
    clearSessionLastActiveTouch(uid);
    endFirstActionFreezeSession();
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
    async (profile: UserProfile, supplied?: SessionClaim, stillCurrent?: () => boolean) => {
      const epoch = supplied?.epoch ?? beginSessionCommit();
      const claim: SessionClaim = supplied ?? {
        uid: profile.uid,
        generation: currentAuthMutationGeneration(),
        epoch,
      };
      const stillOwned = () =>
        (stillCurrent?.() ?? true) && sessionStillOwned(claim, readPublicationLive());
      if (claim.uid !== profile.uid) throw sessionChangedError();
      if (!stillOwned()) throw sessionChangedError();
      if (getActiveBackend() === "firebase-production") {
        const bridge = await import("@/services/auth/jsAuthBridge");
        await bridge.ensureJsAuthSession();
        if (!stillOwned()) throw sessionChangedError();
      }
      if (!stillOwned()) throw sessionChangedError();
      const session = await saveSession(profile, { claim, isCurrent: stillOwned });
      if (!stillOwned()) throw sessionChangedError();
      setState((current) => {
        if (!stillOwned()) return current;
        if (current.session && current.session.user.uid === profile.uid && currentSessionCommitEpoch() !== claim.epoch) {
          return current;
        }
        return {
          status: "signed_in",
          session,
          user: session.user,
          justCreated: false,
        };
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
    async (
      patch: ProfilePatch,
      opts?: {
        /** Authoritative user when React session state has not committed yet. */
        user?: UserProfile;
        ownedGeneration?: number;
        ownedEpoch?: number;
        isCurrent?: () => boolean;
      }
    ): Promise<UserProfile> => {
      const current = opts?.user ?? state.session?.user;
      if (!current) throw toAppError(new Error("Not signed in."));
      const owned = opts?.ownedGeneration;
      const ownedEpoch = opts?.ownedEpoch ?? currentSessionCommitEpoch();
      const stillOwned = () =>
        (opts?.isCurrent?.() ?? true) && currentSessionCommitEpoch() === ownedEpoch && (owned == null ||
        (currentAuthMutationGeneration() === owned &&
          (sessionRef.current == null || sessionRef.current.user.uid === current.uid)));
      try {
        if (!stillOwned()) throw new Error("session_changed");
        const next = await getAuthService().updateProfile(current.uid, patch, {
          uid: current.uid,
          generation: owned ?? currentAuthMutationGeneration(),
          epoch: ownedEpoch,
          isCurrent: stillOwned,
        });
        if (!stillOwned()) throw new Error("session_changed");
        const session = await saveSession(next, {
          preserveSignedInAt: true,
          claim: {
            uid: current.uid,
            generation: owned ?? currentAuthMutationGeneration(),
            epoch: ownedEpoch,
          },
          isCurrent: stillOwned,
        });
        if (!stillOwned()) throw new Error("session_changed");
        setState((s) => {
          if (!stillOwned()) return s;
          if (s.session && s.session.user.uid !== current.uid) return s;
          return {
            ...s,
            status: "signed_in",
            session,
            user: session.user,
          };
        });
        return session.user;
      } catch (e) {
        throw toAppError(e);
      }
    },
    [state.session, saveSession]
  );

  const applyServerProfile = useCallback(
    async (
      profile: UserProfile,
      ownedGeneration?: number,
      readLiveUid?: () => string | null,
      ownedEpoch?: number
    ): Promise<UserProfile> => {
      const epoch = ownedEpoch ?? currentSessionCommitEpoch();
      const isCurrent = ownedGeneration == null && ownedEpoch == null ? undefined : () => {
        if (ownedGeneration != null && currentAuthMutationGeneration() !== ownedGeneration) return false;
        if (ownedEpoch != null && currentSessionCommitEpoch() !== ownedEpoch) return false;
        if (readLiveUid) {
          const liveUid = readLiveUid();
          if (!liveUid || liveUid !== profile.uid) return false;
          const sessionUid = sessionRef.current?.user.uid ?? null;
          if (sessionUid && sessionUid !== profile.uid) return false;
          return true;
        }
        return statusRef.current === "signed_in" && sessionRef.current?.user.uid === profile.uid;
      };
      const claim: SessionClaim = {
        uid: profile.uid,
        generation: ownedGeneration ?? currentAuthMutationGeneration(),
        epoch,
      };
      const session = await saveSession(profile, { preserveSignedInAt: true, claim, isCurrent });
      if (isCurrent && !isCurrent()) throw new Error("session_changed");
      setState((s) => {
        if (isCurrent && !isCurrent()) return s;
        if (ownedGeneration != null && currentAuthMutationGeneration() !== ownedGeneration) return s;
        if (currentSessionCommitEpoch() !== claim.epoch) return s;
        if (s.session && s.session.user.uid !== profile.uid) return s;
        if (readLiveUid) {
          const liveUid = readLiveUid();
          if (!liveUid || liveUid !== profile.uid) return s;
        }
        return {
          ...s,
          status: "signed_in",
          session,
          user: session.user,
        };
      });
      return session.user;
    },
    [saveSession]
  );

  const sessionRef = useRef(state.session);
  const statusRef = useRef(state.status);
  sessionRef.current = state.session;
  statusRef.current = state.status;

  const touchLastActive = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || statusRef.current !== "signed_in") return;
    const previousAt = current.user.lastActiveAt ?? current.lastActiveAt ?? 0;
    const claim = claimSessionLastActiveTouch({
      uid: current.user.uid,
      previousAt,
    });
    if (claim.now == null) return;
    const now = claim.now;

    markFirstActionFreeze("lastActiveAt_claimed", { previousAt });

    try {
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
      markFirstActionFreeze("lastActiveAt_written");
    } finally {
      releaseSessionLastActiveTouch(current.user.uid);
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
    beginFirstActionFreezeSession("auth_signed_in");
    markFirstActionFreeze("auth_signed_in_effect", {
      uidLen: state.session.user.uid.length,
    });
    const task = InteractionManager.runAfterInteractions(() => {
      markFirstActionFreeze("auth_after_interactions");
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
      applyServerProfile,
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
      applyServerProfile,
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
