/**
 * Bridges the native phone-auth session to the Firebase JS SDK.
 *
 * Production signs in with @react-native-firebase/auth (native), but
 * Firestore and Storage run on the firebase JS SDK, whose auth instance
 * never receives the native credential. Firestore/Storage rules require
 * request.auth.uid == uid, so without this bridge every direct client
 * Firestore/Storage operation is permission-denied in production.
 *
 * Flow: native OTP session → mintClientAuthToken callable (carries the
 * native ID token) → signInWithCustomToken on the JS SDK auth instance.
 * The JS session persists via AsyncStorage (see src/config/firebase.ts),
 * so this normally runs once per login, with a boot-time re-check.
 *
 * Never throws — callers treat a false return as "cloud writes may fail;
 * record layer will surface its own retryable error".
 */

import { signInWithCustomToken } from "firebase/auth";

import { getActiveBackend } from "@/config/env";
import { getFirebaseAuth } from "@/config/firebase";
import { createLogger } from "@/utils/logger";

const log = createLogger("auth/jsAuthBridge");

let inFlight: Promise<boolean> | null = null;

/** Native @react-native-firebase/auth uid, or null when not linked / signed out. */
export function getNativeAuthUid(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require("react-native") as { Platform: { OS: string } };
    if (Platform.OS === "web") return null;
  } catch {
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@react-native-firebase/auth") as {
      default: () => { currentUser: { uid: string } | null };
    };
    return mod.default().currentUser?.uid ?? null;
  } catch {
    return null;
  }
}

/** Safe snapshot for diagnostics — never includes tokens. */
export function getJsAuthBridgeSnapshot(): {
  nativeUidPresent: boolean;
  nativeUidSuffix: string | null;
  jsUidPresent: boolean;
  jsUidSuffix: string | null;
  uidsMatch: boolean | null;
} {
  const nativeUid = getNativeAuthUid();
  let jsUid: string | null = null;
  try {
    jsUid = getFirebaseAuth().currentUser?.uid ?? null;
  } catch {
    jsUid = null;
  }
  const nativeUidSuffix = nativeUid && nativeUid.length >= 6 ? nativeUid.slice(-6) : null;
  const jsUidSuffix = jsUid && jsUid.length >= 6 ? jsUid.slice(-6) : null;
  return {
    nativeUidPresent: Boolean(nativeUid),
    nativeUidSuffix,
    jsUidPresent: Boolean(jsUid),
    jsUidSuffix,
    uidsMatch: nativeUid && jsUid ? nativeUid === jsUid : null,
  };
}

async function establishJsAuthSession(): Promise<boolean> {
  const nativeUid = getNativeAuthUid();
  if (!nativeUid) {
    log.warn("ensureJsAuthSession: no native auth session to bridge", {
      ...getJsAuthBridgeSnapshot(),
    });
    return false;
  }

  const auth = getFirebaseAuth();
  if (auth.currentUser?.uid === nativeUid) return true;

  const { callMintClientAuthToken } = await import("./identityCallable");
  const { token } = await callMintClientAuthToken();
  const cred = await signInWithCustomToken(auth, token);
  if (cred.user.uid !== nativeUid) {
    log.error("ensureJsAuthSession: uid mismatch after custom-token sign-in", {
      ...getJsAuthBridgeSnapshot(),
    });
    await auth.signOut();
    return false;
  }
  log.info("ensureJsAuthSession: JS SDK session established", {
    ...getJsAuthBridgeSnapshot(),
  });
  return true;
}

/**
 * Ensure the JS SDK auth session matches the native production session.
 * No-op (true) outside firebase-production. Never throws.
 */
export async function ensureJsAuthSession(): Promise<boolean> {
  if (getActiveBackend() !== "firebase-production") return true;

  try {
    const auth = getFirebaseAuth();
    const nativeUid = getNativeAuthUid();
    if (nativeUid && auth.currentUser?.uid === nativeUid) return true;
  } catch (e) {
    log.warn("ensureJsAuthSession: firebase not available", e);
    return false;
  }

  if (!inFlight) {
    inFlight = establishJsAuthSession()
      .catch((e) => {
        const code =
          e && typeof e === "object" && "code" in e
            ? String((e as { code: string }).code)
            : "unknown";
        log.warn("ensureJsAuthSession failed", {
          code,
          ...getJsAuthBridgeSnapshot(),
        });
        return false;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/**
 * Production Firestore/Storage readiness: bridge must succeed.
 * Throws a structured AppError instead of allowing a raw permission-denied.
 */
export async function requireJsAuthSessionForFirestore(phase: string): Promise<void> {
  if (getActiveBackend() !== "firebase-production") return;
  const ok = await ensureJsAuthSession();
  if (ok) return;
  const { AppError } = await import("@/domain/errors");
  const snap = getJsAuthBridgeSnapshot();
  throw new AppError(
    "auth_failed",
    "Your phone sign-in succeeded, but secure cloud access is not ready yet. Please try again.",
    undefined,
    {
      authPhase: "post_auth",
      failureDomain: "firestore",
      diagnosticCode: "JS_AUTH_BRIDGE_FAILED",
      phase,
      nativeUidPresent: snap.nativeUidPresent,
      jsUidPresent: snap.jsUidPresent,
      uidsMatch: snap.uidsMatch,
      retryAccountSetup: true,
    }
  );
}
