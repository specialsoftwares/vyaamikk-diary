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
import {
  currentAuthMutationGeneration,
  enqueueAuthMutation,
  noteNativeAuthIdentity,
} from "./authSessionFence";
import { beginPerfAttempt, recordPerfSpan } from "./authFlowPerf";

const log = createLogger("auth/jsAuthBridge");

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

export type JsAuthBridgePorts = {
  getNativeUid: () => string | null;
  getJsUid: () => string | null;
  mint: () => Promise<string>;
  signIn: (token: string) => Promise<string>;
  signOutJs: () => Promise<void>;
  /** When the JS uid already matches, false forces a fresh custom token. */
  admissionCurrent?: () => Promise<boolean>;
};

/**
 * One serialized bridge attempt. Mint and custom-token exchange are skipped
 * when logout or a newer identity moved the generation during an await.
 * A stale exchange that already signed in is undone only while that JS user
 * is still current.
 */
export async function bridgeNativeSession(ports: JsAuthBridgePorts): Promise<boolean> {
  return enqueueAuthMutation(async () => {
    const nativeUid = ports.getNativeUid();
    noteNativeAuthIdentity(nativeUid);
    const generationAtStart = currentAuthMutationGeneration();
    if (!nativeUid || currentAuthMutationGeneration() !== generationAtStart) return false;

    if (ports.getJsUid() === nativeUid) {
      const fresh = ports.admissionCurrent ? await ports.admissionCurrent() : true;
      if (
        currentAuthMutationGeneration() !== generationAtStart ||
        ports.getNativeUid() !== nativeUid
      ) {
        return false;
      }
      if (fresh) return true;
    }

    const token = await ports.mint();
    if (
      currentAuthMutationGeneration() !== generationAtStart ||
      ports.getNativeUid() !== nativeUid
    ) {
      return false;
    }

    const signedInUid = await ports.signIn(token);
    const stale =
      currentAuthMutationGeneration() !== generationAtStart ||
      ports.getNativeUid() !== nativeUid ||
      signedInUid !== nativeUid;
    if (stale) {
      if (ports.getJsUid() === signedInUid) {
        try {
          await ports.signOutJs();
        } catch {
          // The attempt is still rejected. A newer queued login is left alone
          // because sign-out runs only while this uid is current.
        }
      }
      return false;
    }
    if (ports.admissionCurrent && !(await ports.admissionCurrent())) return false;
    return true;
  });
}

/** A positive claim is current only when it equals the authority watermark. */
export function claimMatchesAuthorityWatermark(claim: unknown, authorityWatermark: number | null): boolean {
  if (authorityWatermark == null || !Number.isSafeInteger(authorityWatermark) || authorityWatermark < 1) return false;
  return claim === authorityWatermark;
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
  const reuseStarted = globalThis.performance?.now?.() ?? Date.now();
  const established = await bridgeNativeSession({
    getNativeUid: getNativeAuthUid,
    getJsUid: () => auth.currentUser?.uid ?? null,
    mint: async () => {
      const { callMintClientAuthToken } = await import("./identityCallable");
      const { token } = await callMintClientAuthToken();
      return token;
    },
    admissionCurrent: async () => {
      if (process.env.EXPO_PUBLIC_RESTORE_ADMISSION_REFRESH !== "true") return true;
      const user = auth.currentUser;
      if (!user) return false;
      const token = await user.getIdTokenResult(false);
      const { callReadRestoreAuthorityWatermark } = await import("./identityCallable");
      const { decidePublishedAdmission } = await import("./publishedAuthority");
      let published: Awaited<ReturnType<typeof callReadRestoreAuthorityWatermark>> | { state: "closed" } | { state: "unavailable"; reason: string };
      try {
        published = await callReadRestoreAuthorityWatermark();
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        published = message.includes("restore_fence_closed")
          ? { state: "closed" }
          : { state: "unavailable", reason: "unreadable" };
      }
      const decision = decidePublishedAdmission({
        sessionUid: user.uid,
        claimUid: user.uid,
        claim: token.claims.authorityWatermark,
        published,
        attempts: 0,
      });
      return decision === "fresh" || decision === "unconfigured";
    },
    signIn: async (token) => {
      const cred = await signInWithCustomToken(auth, token);
      return cred.user.uid;
    },
    signOutJs: () => auth.signOut(),
  });
  const attempt = beginPerfAttempt("js_bridge");
  recordPerfSpan({
    ...attempt,
    stage: established && auth.currentUser?.uid === nativeUid ? "bridge_reuse" : "bridge_mint",
    runtime: "js",
    durationMs: (globalThis.performance?.now?.() ?? Date.now()) - reuseStarted,
    outcome: established ? "ok" : "error",
  });
  if (!established) return false;
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
    noteNativeAuthIdentity(getNativeAuthUid());
    return await establishJsAuthSession();
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "unknown";
    log.warn("ensureJsAuthSession failed", {
      code,
      ...getJsAuthBridgeSnapshot(),
    });
    return false;
  }
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
