/**
 * Ensures @react-native-firebase/auth is ready before authenticated callables.
 *
 * Phone OTP may return a UserCredential while Functions still observes a brief
 * window without an attachable ID token. Force-refresh the token on the same
 * native [DEFAULT] app before httpsCallable.
 *
 * Never logs tokens, OTPs, phones, or verification IDs.
 */

import { AppError } from "@/domain/errors";
import { createLogger } from "@/utils/logger";

const log = createLogger("auth/nativeCallableAuthGate");

const READY_TIMEOUT_MS = 8_000;

export interface NativeCallableAuthReadySnapshot {
  uidPresent: boolean;
  uidSuffix: string;
  idTokenReady: boolean;
  authAppName: string;
  authProjectId: string;
  phoneNumberPresent: boolean;
}

type NativeUser = {
  uid: string;
  phoneNumber?: string | null;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
};

type NativeAuth = {
  currentUser: NativeUser | null;
  app?: { name?: string; options?: { projectId?: string } };
  onAuthStateChanged: (listener: (user: NativeUser | null) => void) => () => void;
};

function tryNativeAuth(): (() => NativeAuth) | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require("react-native") as { Platform: { OS: string } };
    if (Platform.OS === "web") return null;
  } catch {
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@react-native-firebase/auth") as { default: () => NativeAuth };
    if (typeof mod.default !== "function") return null;
    return mod.default;
  } catch {
    return null;
  }
}

function uidSuffix(uid: string): string {
  return uid.length >= 6 ? uid.slice(-6) : "??????";
}

function readAppMeta(auth: NativeAuth): { authAppName: string; authProjectId: string } {
  const authAppName = String(auth.app?.name ?? "[DEFAULT]");
  const authProjectId = String(auth.app?.options?.projectId ?? "");
  return { authAppName, authProjectId };
}

async function waitForCurrentUser(authFn: () => NativeAuth, timeoutMs: number): Promise<NativeUser | null> {
  const immediate = authFn().currentUser;
  if (immediate?.uid) return immediate;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (user: NativeUser | null) => {
      if (settled) return;
      settled = true;
      try {
        unsub();
      } catch {
        // ignore
      }
      resolve(user);
    };
    const unsub = authFn().onAuthStateChanged((user) => {
      if (user?.uid) finish(user);
    });
    setTimeout(() => finish(authFn().currentUser), timeoutMs);
  });
}

/**
 * Barrier before identity callables. Does not inject tokens into callable data.
 */
export async function ensureNativeAuthReadyForCallables(): Promise<NativeCallableAuthReadySnapshot> {
  const authFn = tryNativeAuth();
  if (!authFn) {
    throw new AppError(
      "auth_not_configured",
      "Native Firebase Auth is not available for account setup.",
      undefined,
      {
        authPhase: "post_auth",
        failureDomain: "auth",
        diagnosticCode: "NATIVE_AUTH_UNAVAILABLE",
        firebaseUserPresent: false,
        idTokenReady: false,
      }
    );
  }

  log.info("AUTH_STATE gate start", { phase: "ID_TOKEN_REQUEST_START" });
  const user = await waitForCurrentUser(authFn, READY_TIMEOUT_MS);
  const auth = authFn();
  const { authAppName, authProjectId } = readAppMeta(auth);

  if (!user?.uid) {
    log.warn("AUTH_STATE gate: no currentUser", {
      phase: "AUTH_CREDENTIAL_UID_PRESENT",
      firebaseUserPresent: false,
      authAppName,
      authProjectIdPresent: Boolean(authProjectId),
    });
    throw new AppError(
      "auth_failed",
      "Your sign-in was not ready yet. Please try again.",
      undefined,
      {
        authPhase: "post_auth",
        failureDomain: "auth",
        diagnosticCode: "NATIVE_USER_MISSING_AFTER_OTP",
        firebaseUserPresent: false,
        idTokenReady: false,
        authAppName,
        authProjectIdPresent: Boolean(authProjectId),
      }
    );
  }

  let idTokenReady = false;
  try {
    const token = await user.getIdToken(true);
    idTokenReady = typeof token === "string" && token.length > 20;
  } catch (e) {
    log.warn("getIdToken failed", {
      phase: "ID_TOKEN_REQUEST_SUCCESS",
      idTokenReady: false,
      uidSuffix: uidSuffix(user.uid),
    });
    throw new AppError(
      "auth_failed",
      "Your sign-in was verified, but we could not refresh the session token. Please try again.",
      e,
      {
        authPhase: "post_auth",
        failureDomain: "auth",
        diagnosticCode: "ID_TOKEN_REFRESH_FAILED",
        firebaseUserPresent: true,
        idTokenReady: false,
        authAppName,
        authProjectIdPresent: Boolean(authProjectId),
        uidSuffix: uidSuffix(user.uid),
      }
    );
  }

  if (!idTokenReady) {
    throw new AppError(
      "auth_failed",
      "Your sign-in was verified, but the session token was empty. Please try again.",
      undefined,
      {
        authPhase: "post_auth",
        failureDomain: "auth",
        diagnosticCode: "ID_TOKEN_EMPTY",
        firebaseUserPresent: true,
        idTokenReady: false,
        authAppName,
        authProjectIdPresent: Boolean(authProjectId),
        uidSuffix: uidSuffix(user.uid),
      }
    );
  }

  const snap: NativeCallableAuthReadySnapshot = {
    uidPresent: true,
    uidSuffix: uidSuffix(user.uid),
    idTokenReady: true,
    authAppName,
    authProjectId,
    phoneNumberPresent: Boolean(user.phoneNumber),
  };

  log.info("AUTH_STATE gate ready", {
    phase: "ID_TOKEN_REQUEST_SUCCESS",
    uidSuffix: snap.uidSuffix,
    idTokenReady: true,
    authAppName,
    authProjectIdPresent: Boolean(authProjectId),
    phoneNumberPresent: snap.phoneNumberPresent,
  });

  return snap;
}

/** Test helper — pure timeout constant. */
export function __nativeCallableAuthReadyTimeoutMs(): number {
  return READY_TIMEOUT_MS;
}
