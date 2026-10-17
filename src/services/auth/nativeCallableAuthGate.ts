/**
 * Ensures @react-native-firebase/auth is ready before authenticated callables.
 *
 * Phone OTP may return a UserCredential while Functions still observes a brief
 * window without an attachable ID token. The gate reads the SDK-cached token
 * first. A forced refresh runs only for an explicit invalidation, or once when
 * that cached read is empty or hits a recoverable token error.
 *
 * Never logs tokens, OTPs, phones, or verification IDs.
 */

import { AppError } from "@/domain/errors";
import { createLogger } from "@/utils/logger";
import { beginPerfAttempt, recordPerfSpan } from "./authFlowPerf";
import { readNativeIdToken } from "./idTokenRefresh";

const log = createLogger("auth/nativeCallableAuthGate");

const READY_TIMEOUT_MS = 8_000;

type ReadyOptions = { forceRefresh?: boolean };

let authReadyGeneration = 0;
let inflightReady: {
  uid: string;
  generation: number;
  force: boolean;
  promise: Promise<NativeCallableAuthReadySnapshot>;
} | null = null;

/** Drops an in-flight readiness promise after sign-out or session replacement. */
export function retireNativeCallableAuthReady(): void {
  authReadyGeneration += 1;
  inflightReady = null;
}

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

let nativeAuthOverride: (() => NativeAuth) | null | undefined;

/** Test-only auth port. Pass undefined to restore the production lookup. */
export function __setNativeAuthForTests(auth: (() => NativeAuth) | null | undefined): void {
  nativeAuthOverride = auth;
  retireNativeCallableAuthReady();
}

function tryNativeAuth(): (() => NativeAuth) | null {
  if (nativeAuthOverride !== undefined) return nativeAuthOverride;
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

function retiredAuthReady(): AppError {
  return new AppError(
    "auth_failed",
    "Your sign-in was not ready yet. Please try again.",
    undefined,
    {
      authPhase: "post_auth",
      failureDomain: "auth",
      diagnosticCode: "ID_TOKEN_READY_RETIRED",
      firebaseUserPresent: false,
      idTokenReady: false,
    }
  );
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
export async function ensureNativeAuthReadyForCallables(
  options?: ReadyOptions
): Promise<NativeCallableAuthReadySnapshot> {
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

  const force = options?.forceRefresh === true;
  const generation = authReadyGeneration;
  if (
    inflightReady &&
    inflightReady.uid === user.uid &&
    inflightReady.generation === generation &&
    inflightReady.force === force
  ) {
    return inflightReady.promise;
  }

  const promise = finishNativeAuthReady({
    user,
    authFn,
    authAppName,
    authProjectId,
    force,
    generation,
  });
  inflightReady = { uid: user.uid, generation, force, promise };
  const release = () => {
    if (inflightReady?.promise === promise) inflightReady = null;
  };
  void promise.then(release, release);
  return promise;
}

async function finishNativeAuthReady(input: {
  user: NativeUser;
  authFn: () => NativeAuth;
  authAppName: string;
  authProjectId: string;
  force: boolean;
  generation: number;
}): Promise<NativeCallableAuthReadySnapshot> {
  const { user, authFn, authAppName, authProjectId, force, generation } = input;
  const started = globalThis.performance?.now?.() ?? Date.now();
  const attempt = beginPerfAttempt("token_gate");
  if (generation !== authReadyGeneration) {
    throw retiredAuthReady();
  }

  let forced = force;
  try {
    const read = await readNativeIdToken(user, { explicitInvalidation: force });
    forced = read.forced;
    if (read.token.length <= 20) {
      throw new Error("id_token_empty");
    }
  } catch (e) {
    const empty = e instanceof Error && e.message === "id_token_empty";
    recordPerfSpan({
      ...attempt,
      stage: forced ? "token_forced" : "token_cached",
      runtime: "native",
      durationMs: (globalThis.performance?.now?.() ?? Date.now()) - started,
      outcome: generation === authReadyGeneration ? "error" : "retired",
    });
    if (!empty) {
      log.warn("getIdToken failed", {
        phase: "ID_TOKEN_REQUEST_SUCCESS",
        idTokenReady: false,
        uidSuffix: uidSuffix(user.uid),
      });
    }
    throw new AppError(
      "auth_failed",
      empty
        ? "Your sign-in was verified, but the session token was empty. Please try again."
        : "Your sign-in was verified, but we could not refresh the session token. Please try again.",
      empty ? undefined : e,
      {
        authPhase: "post_auth",
        failureDomain: "auth",
        diagnosticCode: empty ? "ID_TOKEN_EMPTY" : "ID_TOKEN_REFRESH_FAILED",
        firebaseUserPresent: true,
        idTokenReady: false,
        authAppName,
        authProjectIdPresent: Boolean(authProjectId),
        uidSuffix: uidSuffix(user.uid),
      }
    );
  }

  if (generation !== authReadyGeneration || authFn().currentUser?.uid !== user.uid) {
    recordPerfSpan({
      ...attempt,
      stage: forced ? "token_forced" : "token_cached",
      runtime: "native",
      durationMs: (globalThis.performance?.now?.() ?? Date.now()) - started,
      outcome: "retired",
    });
    throw retiredAuthReady();
  }

  recordPerfSpan({
    ...attempt,
    stage: forced ? "token_forced" : "token_cached",
    runtime: "native",
    durationMs: (globalThis.performance?.now?.() ?? Date.now()) - started,
    outcome: "ok",
  });
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
  try {
    const { authPerfMark } = await import("./authFlowPerf");
    authPerfMark("V4_id_token_ready");
  } catch {
    // Perf probe must never block identity.
  }

  return snap;
}

/** Test helper — pure timeout constant. */
export function __nativeCallableAuthReadyTimeoutMs(): number {
  return READY_TIMEOUT_MS;
}
