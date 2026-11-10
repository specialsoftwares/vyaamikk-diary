/**
 * Production native phone OTP via @react-native-firebase/auth.
 *
 * Requires an Expo dev build / EAS build — NOT Expo Go.
 * Lazy-loaded so local-mock and shared-dev never evaluate this module at startup.
 *
 * Session design (survives Custom Tab / reCAPTCHA return):
 * - Prefer in-memory ConfirmationResult for confirm(code)
 * - Persist Firebase verificationId in SecureStore with TTL
 * - On Map miss after remount, rebuild credential via PhoneAuthProvider
 */

import { AppError } from "@/domain/errors";
import { env } from "@/config/env";
import type { PhoneE164 } from "@/domain/types";
import { normalizePhoneE164 } from "@/utils/mobileHash";
import { createLogger } from "@/utils/logger";

import type { OtpChallenge } from "./types";
import { applyFirebasePhoneAuthTestingSettingsIfAllowed } from "./firebasePhoneAuthTestMode";
import { createPhoneAuthNativeSlot, sendPermittedBySignal, type ActivityView } from "./phoneAuthNativeSlot";
import { phoneAuthFailureToAppError } from "./nativePhoneAuthErrors";
import {
  clearNativePhoneAuthSession,
  clearNativePhoneAuthSessionIfMatches,
  loadNativePhoneAuthSession,
  saveNativePhoneAuthSession,
} from "./nativePhoneAuthSession";
import {
  AUTH_PHONE_CHALLENGE_MISMATCH,
  emptyCodeConfirmAllowed,
  evaluatePostSendAutoVerification,
  phonesMatchE164,
  type PhoneChallengeAutoVerifyRecord,
} from "./phoneChallengeAuthInvariant";

const log = createLogger("auth/nativePhone");

const SESSION_TTL_MS = 10 * 60 * 1000;

type NativeConfirmation = import("@react-native-firebase/auth").ConfirmationResult;
type NativeAuthModule = {
  default: () => import("@react-native-firebase/auth").FirebaseAuthInstance;
  PhoneAuthProvider: typeof import("@react-native-firebase/auth").PhoneAuthProvider;
};

interface PendingSession {
  confirmation: NativeConfirmation | null;
  firebaseVerificationId: string;
  phoneE164: PhoneE164;
  expiresAt: number;
  attemptId: string;
  /** Epoch ms immediately before signInWithPhoneNumber. */
  startedAtMs: number;
  /** Native UID present before stale clear / send (normally null after clear). */
  preSendUid: string | null;
  autoVerify: PhoneChallengeAutoVerifyRecord | null;
  /** Send clock when this row was stored. A later retire makes it unadoptable. */
  sendGeneration?: number;
}

/** Keyed by Firebase verificationId (also used as OtpChallenge.verificationId). */
const pendingByVerificationId = new Map<string, PendingSession>();
let sendInFlight = false;
let sendLockGeneration = 0;
let confirmInFlightKey: string | null = null;
let confirmLockGeneration = 0;
let nativePhoneSendGeneration = 0;
let nativePhoneConfirmGeneration = 0;
let installedNativeModule: NativeAuthModule | null = null;
let installedPlatform: string | null = null;

type ActivityBridge = {
  currentActivitySignal: () => string;
  claimSendSlot: (generation: number) => string;
  recoverSendSlot: () => string;
  claimConfirmSlot: (generation: number) => string;
  recoverConfirmSlot: () => string;
  releaseSendSlot: (generation: number) => string;
  releaseConfirmSlot: (generation: number) => string;
  startPhoneVerification?: (phone: string, generation: number, forceResend: boolean) => Promise<{ verificationId: string }>;
  confirmPhoneVerification?: (id: string, code: string, phone: string, generation: number) => Promise<string>;
  updateVerifiedPhone?: (id: string, code: string, phone: string, expectedUid: string, generation: number) => Promise<string>;
  verificationProof?: (id: string) => string | null;
  retireSend?: (generation: number) => boolean;
  retireConfirm?: (generation: number) => boolean;
};

let installedActivityBridge: ActivityBridge | null = null;

/**
 * Test seam for the Android activity bridge. Production reads
 * NativeModules.PhoneAuthActivity, whose Kotlin method calls currentActivity.
 */
export function __installAndroidActivityBridgeForTests(next: ActivityBridge | null): void {
  installedActivityBridge = next;
}

export function createAndroidActivityBridge(activity: () => ActivityView): ActivityBridge {
  const slot = createPhoneAuthNativeSlot();
  return {
    currentActivitySignal: () => {
      const current = activity();
      if (!current?.id) return "missing";
      return `present:${current.id}`;
    },
    claimSendSlot: (generation) => slot.claim("send", generation, activity()),
    recoverSendSlot: () => slot.recover("send", activity()),
    claimConfirmSlot: (generation) => slot.claim("confirm", generation, activity()),
    recoverConfirmSlot: () => slot.recover("confirm", activity()),
    releaseSendSlot: (generation) => slot.release("send", generation),
    releaseConfirmSlot: (generation) => slot.release("confirm", generation),
  };
}

/**
 * Test seam. Production calls the installed module instead of requiring
 * @react-native-firebase/auth. Passing null restores the runtime module.
 */
export function __installNativePhoneAuthModuleForTests(
  next: { platform: string; module: NativeAuthModule } | null
): void {
  installedNativeModule = next?.module ?? null;
  installedPlatform = next?.platform ?? null;
}

function purgeExpiredSessions(): void {
  const now = Date.now();
  for (const [id, row] of pendingByVerificationId) {
    if (row.expiresAt <= now) pendingByVerificationId.delete(id);
  }
}

function runtimePlatform(): string {
  if (installedPlatform) return installedPlatform;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require("react-native") as { Platform: { OS: string } };
    return Platform.OS;
  } catch {
    return "node";
  }
}

function releaseSendLock(generation: number): void {
  try {
    activityBridge()?.releaseSendSlot(generation);
  } catch {
    // A failed release leaves the native slot held. The next send stays refused
    // until the operation actually settles. Activity replacement is not cancellation.
  }
  if (sendLockGeneration === generation) {
    sendInFlight = false;
    sendLockGeneration = 0;
  }
}

function releaseConfirmLock(generation: number): void {
  try {
    activityBridge()?.releaseConfirmSlot(generation);
  } catch {
    // Same as the send slot: failure keeps the native slot held.
  }
  if (confirmLockGeneration === generation) {
    confirmInFlightKey = null;
    confirmLockGeneration = 0;
  }
}

/** Drop a late native send without clearing a lock owned by a newer dispatch. */
export function retireDispatchedNativeSend(): void {
  const retired = nativePhoneSendGeneration;
  try { activityBridge()?.retireSend?.(retired); } catch { /* Native slot stays fail-closed. */ }
  nativePhoneSendGeneration += 1;
  for (const row of pendingByVerificationId.values()) {
    if (row.sendGeneration == null || row.sendGeneration === retired) {
      row.sendGeneration = retired;
    }
  }
}

/** Drop a late native confirm without clearing a lock owned by a newer dispatch. */
export function retireDispatchedNativeConfirm(): void {
  try { activityBridge()?.retireConfirm?.(nativePhoneConfirmGeneration); } catch { /* Keep the native slot held. */ }
  nativePhoneConfirmGeneration += 1;
}

/** A contact editor cannot retire a newer login confirmation. */
export function retireNativeVerifiedPhone(): void {
  if (confirmInFlightKey?.startsWith("contact:")) retireDispatchedNativeConfirm();
}

/**
 * Diagnostic only. Module presence is not an activity signal and does not
 * authorize signInWithPhoneNumber. The send and confirm gates use
 * PhoneAuthActivity.currentActivitySignal.
 */
export function probeAndroidAuthActivityState():
  | "present"
  | "missing"
  | "n/a"
  | "unknown" {
  const platform = runtimePlatform();
  if (platform !== "android") return "n/a";
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NativeModules } = require("react-native") as {
      NativeModules: Record<
        string,
        { getConstants?: () => Record<string, unknown>; getCurrentActivity?: () => unknown }
      >;
    };
    const authModule = NativeModules.RNFBAuthModule;
    if (authModule && typeof authModule.getCurrentActivity === "function") {
      return authModule.getCurrentActivity() == null ? "missing" : "present";
    }
    if (NativeModules.RNFBAppModule || NativeModules.RNFBAuthModule) {
      return "unknown";
    }
    return "missing";
  } catch {
    return "unknown";
  }
}

/**
 * Production reads NativeModules.PhoneAuthActivity. A test double, a missing
 * method, or the presence of RNFBAuthModule is not a current Activity.
 */
function activityBridge(): ActivityBridge | null {
  if (installedActivityBridge) return installedActivityBridge;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NativeModules } = require("react-native") as {
      NativeModules: { PhoneAuthActivity?: Partial<ActivityBridge> };
    };
    const native = NativeModules.PhoneAuthActivity;
    if (
      !native ||
      typeof native.currentActivitySignal !== "function" ||
      typeof native.claimSendSlot !== "function" ||
      typeof native.recoverSendSlot !== "function" ||
      typeof native.claimConfirmSlot !== "function" ||
      typeof native.recoverConfirmSlot !== "function" ||
      typeof native.releaseSendSlot !== "function" ||
      typeof native.releaseConfirmSlot !== "function" ||
      typeof native.startPhoneVerification !== "function" ||
      typeof native.confirmPhoneVerification !== "function" ||
      typeof native.updateVerifiedPhone !== "function" ||
      typeof native.verificationProof !== "function" ||
      typeof native.retireSend !== "function" ||
      typeof native.retireConfirm !== "function"
    ) {
      return null;
    }
    return native as ActivityBridge;
  } catch {
    return null;
  }
}

function androidActivitySignal(): string | null {
  const bridge = activityBridge();
  if (!bridge) return null;
  try {
    const signal = bridge.currentActivitySignal();
    return typeof signal === "string" ? signal : null;
  } catch {
    return null;
  }
}

/** Keep verified-phone mutations inside the same native gate as phone login. */
export async function updateNativeVerifiedPhone(input: {
  verificationId: string; code: string; phone: string; expectedUid: string;
  isCurrent: () => boolean;
  fallback: () => Promise<void>;
}): Promise<void> {
  if (!input.isCurrent()) throw new Error("session_changed");
  if (sendInFlight || confirmInFlightKey) throw new AppError("auth_failed", "Verification is still finishing. Go back and try again later.", undefined, { phoneAuthSettlement: "unknown" });
  const generation = ++nativePhoneConfirmGeneration;
  confirmLockGeneration = generation;
  confirmInFlightKey = `contact:${generation}`;
  const bridge = runtimePlatform() === "android" ? activityBridge() : null;
  try {
    if (runtimePlatform() === "android") {
      if (!bridge?.updateVerifiedPhone || !bridge.claimConfirmSlot(generation).startsWith("accepted:")) {
        throw new AppError("auth_failed", "Verification is still finishing. You can go back. If it does not finish, force stop the app in Android Settings and reopen it.", undefined, { phoneAuthSettlement: "unknown" });
      }
      if (!input.isCurrent() || generation !== nativePhoneConfirmGeneration) throw new Error("session_changed");
      await bridge.updateVerifiedPhone(input.verificationId, input.code, input.phone, input.expectedUid, generation);
    } else {
      if (!input.isCurrent()) throw new Error("session_changed");
      await input.fallback();
    }
    if (!input.isCurrent() || generation !== nativePhoneConfirmGeneration) throw new Error("session_changed");
  } finally {
    releaseConfirmLock(generation);
  }
}

/**
 * Query unresolved native work. Activity replacement never cancels a Firebase
 * credential task. Only actual native completion makes another attempt safe.
 */
export function recoverUnsettledNativeSend(): "recovered" | "held" | "idle" | "unavailable" {
  const bridge = activityBridge();
  if (!bridge) return sendInFlight ? "unavailable" : "idle";
  let result = "";
  try {
    result = bridge.recoverSendSlot();
  } catch {
    return "unavailable";
  }
  if (result === "recovered") {
    nativePhoneSendGeneration += 1;
    sendInFlight = false;
    sendLockGeneration = 0;
    return "recovered";
  }
  if (result === "held") return "held";
  return "idle";
}

export function recoverUnsettledNativeConfirm(): "recovered" | "held" | "idle" | "unavailable" {
  const bridge = activityBridge();
  if (!bridge) return confirmInFlightKey ? "unavailable" : "idle";
  let result = "";
  try {
    result = bridge.recoverConfirmSlot();
  } catch {
    return "unavailable";
  }
  if (result === "recovered") {
    nativePhoneConfirmGeneration += 1;
    confirmInFlightKey = null;
    confirmLockGeneration = 0;
    return "recovered";
  }
  if (result === "held") return "held";
  return "idle";
}

function tryNativeAuthModule(): NativeAuthModule | null {
  if (installedNativeModule) return installedNativeModule;
  const platform = runtimePlatform();
  if (platform === "web" || platform === "node") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@react-native-firebase/auth") as NativeAuthModule;
    if (typeof mod.default !== "function") return null;
    return mod;
  } catch {
    return null;
  }
}

/**
 * Optional Firebase Console fictional-number support (emulator / isolated
 * development-client sessions only). Gated by firebasePhoneAuthTestMode —
 * never applied for ordinary real-number login or preview/production.
 */
function applyOptionalFirebaseTestPhoneSettings(mod: NativeAuthModule): void {
  if (runtimePlatform() !== "android") return;
  try {
    const result = applyFirebasePhoneAuthTestingSettingsIfAllowed(
      mod.default().settings
    );
    if (result.applied) {
      log.info("firebase phone auth test mode settings applied", {
        appVerificationDisabledForTesting: result.appVerificationDisabledForTesting,
        forceRecaptchaFlowForTesting: result.forceRecaptchaFlowForTesting,
        reason: result.reason,
      });
    }
  } catch (e) {
    log.warn("firebase phone auth test mode settings unavailable", {
      errorName: e instanceof Error ? e.name : "unknown",
    });
  }
}

export function isNativePhoneAuthAvailable(): boolean {
  return tryNativeAuthModule() != null;
}

function assertProductionNativeOtp(): void {
  if (!env.isProduction) return;
  if (runtimePlatform() === "web") {
    throw new AppError(
      "auth_not_configured",
      "Phone sign-in is not available on web in production builds."
    );
  }
  if (!isNativePhoneAuthAvailable()) {
    throw new AppError(
      "auth_not_configured",
      "Native Firebase Phone Auth is not available. Install a dev/EAS build with @react-native-firebase/auth linked — Expo Go cannot send real OTP."
    );
  }
}

function phoneSuffix(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.length >= 4 ? d.slice(-4) : "????";
}

/** Native Firebase Auth UID if already signed in (instant / auto verification). */
export function getNativeAuthUid(): string | null {
  const mod = tryNativeAuthModule();
  if (!mod) return null;
  try {
    return mod.default().currentUser?.uid ?? null;
  } catch {
    return null;
  }
}

/** Native Firebase Auth phoneNumber (E.164) or null. */
export function getNativeAuthPhoneE164(): string | null {
  const mod = tryNativeAuthModule();
  if (!mod) return null;
  try {
    const phone = mod.default().currentUser?.phoneNumber;
    if (typeof phone !== "string" || !phone.trim()) return null;
    return normalizePhoneE164(phone);
  } catch {
    return null;
  }
}

export type NativeAuthStateSnapshot = {
  uid: string | null;
  phoneE164: string | null;
  userPresent: boolean;
};

export function snapshotNativeAuthState(): NativeAuthStateSnapshot {
  const uid = getNativeAuthUid();
  const phoneE164 = getNativeAuthPhoneE164();
  return { uid, phoneE164, userPresent: Boolean(uid) };
}

/**
 * Fresh phone-auth entry: clear any native session left from a prior login so it
 * cannot satisfy a new challenge. Uses the existing native signOut path.
 */
export async function clearStaleNativeAuthForFreshChallenge(): Promise<void> {
  const snap = snapshotNativeAuthState();
  if (!snap.userPresent) return;
  log.info("clearing stale native auth before fresh phone challenge", {
    preSendUidSuffix: snap.uid ? snap.uid.slice(-6) : null,
    preSendPhoneSuffix: snap.phoneE164 ? phoneSuffix(snap.phoneE164) : null,
  });
  await signOutNativePhoneAuth(() => true, false);
}

/**
 * Subscribe to native auth state for challenge-scoped post-send instant verification.
 * Listener receives uid + phone (never used for mount-time stale short-circuit alone).
 */
export function subscribeNativeAuthState(
  listener: (uid: string | null, phoneE164: string | null) => void
): () => void {
  const mod = tryNativeAuthModule();
  if (!mod) return () => undefined;
  try {
    let removeProofListener: () => void = () => undefined;
    if (runtimePlatform() === "android" && !installedNativeModule) {
      const { DeviceEventEmitter } = require("react-native") as {
        DeviceEventEmitter: { addListener: (event: string, fn: () => void) => { remove: () => void } };
      };
      const subscription = DeviceEventEmitter.addListener("VydPhoneVerificationCompleted", () => {
        listener(getNativeAuthUid(), getNativeAuthPhoneE164());
      });
      removeProofListener = () => subscription.remove();
    }
    const unsubscribe = mod.default().onAuthStateChanged((user) => {
      let phone: string | null = null;
      if (typeof user?.phoneNumber === "string" && user.phoneNumber.trim()) {
        try {
          phone = normalizePhoneE164(user.phoneNumber);
        } catch {
          phone = null;
        }
      }
      listener(user?.uid ?? null, phone);
    });
    return () => { unsubscribe(); removeProofListener(); };
  } catch {
    return () => undefined;
  }
}

/**
 * Observe whether the current native user proves THIS pending challenge
 * (post-send instant verification). Marks the session when eligible.
 */
export function observePostSendAuthForChallenge(
  challenge: OtpChallenge
): PhoneChallengeAutoVerifyRecord | null {
  const row = pendingByVerificationId.get(challenge.verificationId);
  if (!row) return null;
  if (row.sendGeneration != null && row.sendGeneration !== nativePhoneSendGeneration) return null;
  if (row.autoVerify) return row.autoVerify;
  if (runtimePlatform() === "android") {
    // An auth-state observer cannot identify which credential operation caused
    // currentUser to change. Only the native callback owner can attest to it.
    const encoded = activityBridge()?.verificationProof?.(row.firebaseVerificationId);
    if (!encoded) return null;
    try {
      const proof = JSON.parse(encoded) as { verificationId?: string; uid?: string; phone?: string };
      if (proof.verificationId !== row.firebaseVerificationId ||
          proof.uid !== getNativeAuthUid() || !phonesMatchE164(proof.phone, row.phoneE164)) return null;
    } catch { return null; }
  }

  const evaluated = evaluatePostSendAutoVerification({
    challenge: {
      attemptId: row.attemptId,
      verificationId: row.firebaseVerificationId,
      phoneE164: row.phoneE164,
      startedAtMs: row.startedAtMs,
    },
    preSendUid: row.preSendUid,
    currentUid: getNativeAuthUid(),
    currentPhoneE164: getNativeAuthPhoneE164(),
    observedAtMs: Date.now(),
  });
  if (!evaluated) return null;
  row.autoVerify = evaluated;
  log.info("post-send auto-verification recorded", {
    attemptId: row.attemptId,
    phoneSuffix: phoneSuffix(row.phoneE164),
    uidSuffix: evaluated.authenticatedUid.slice(-6),
  });
  return evaluated;
}

export function isChallengeAutoVerified(challenge: OtpChallenge): boolean {
  const row = pendingByVerificationId.get(challenge.verificationId);
  return Boolean(row?.autoVerify);
}

/**
 * Start native phone verification.
 * OtpChallenge.verificationId is the Firebase verificationId (resumable).
 */
export async function startNativePhoneOtp(
  phoneE164: PhoneE164,
  options?: { forceResend?: boolean }
): Promise<OtpChallenge> {
  assertProductionNativeOtp();
  const mod = tryNativeAuthModule();
  if (!mod) {
    throw new AppError("auth_not_configured", "Native phone auth module is not linked.");
  }
  if (runtimePlatform() === "android") recoverUnsettledNativeSend();
  if (sendInFlight || confirmInFlightKey) {
    throw new AppError(
      "otp_send_failed",
      "Verification is still finishing. You can go back. If it does not finish, force stop the app in Android Settings and reopen it.",
      undefined, { phoneAuthSettlement: "unknown", diagnosticCode: "PHONE_NATIVE_HELD" }
    );
  }

  const phone = normalizePhoneE164(phoneE164);
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new AppError(
      "invalid_phone",
      "Please enter a valid 10-digit mobile number.",
      undefined,
      { phoneE164Sent: phone, firebaseAuthCode: "auth/invalid-phone-number" }
    );
  }

  // The duplicate check above is synchronous. Take the lock before any await so a
  // second tap cannot pass that check while this send is still preparing.
  // A dispatched signInWithPhoneNumber cannot be cancelled. Retiring the clock
  // drops a late identity. A native credential task stays held until it settles;
  // replacing an Activity does not make its mutation safe to overlap.
  const sendGeneration = ++nativePhoneSendGeneration;
  sendLockGeneration = sendGeneration;
  sendInFlight = true;
  const startedAtMs = Date.now();
  const authInstance = mod.default();
  const attemptId = `send_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const androidSignal = runtimePlatform() === "android" ? androidActivitySignal() : "n/a";
  const androidActivity = sendPermittedBySignal(androidSignal)
    ? "present"
    : androidSignal === "missing"
      ? "missing"
      : runtimePlatform() === "android"
        ? "unavailable"
        : "n/a";
  if (runtimePlatform() === "android" && !sendPermittedBySignal(androidSignal)) {
    releaseSendLock(sendGeneration);
    throw phoneAuthFailureToAppError(
      {
        code: "auth/missing-activity",
        message: "Current activity is null.",
        name: "Error",
      },
      "send",
      { androidActivity, attemptId }
    );
  }
  const sendClaim =
    runtimePlatform() === "android" ? activityBridge()?.claimSendSlot(sendGeneration) ?? "refused:missing" : "accepted:n/a";
  if (runtimePlatform() === "android" && !sendClaim.startsWith("accepted:")) {
    releaseSendLock(sendGeneration);
    throw new AppError(
      "otp_send_failed",
      sendClaim === "refused:in_flight"
        ? "Verification is still finishing. You can go back. If it does not finish, force stop the app in Android Settings and reopen it."
        : "Phone verification needs the sign-in screen to be open. Go back and try again.",
      undefined,
      { androidActivity, attemptId, ...(sendClaim === "refused:in_flight" ? { phoneAuthSettlement: "unknown" } : {}), diagnosticCode: sendClaim === "refused:in_flight" ? "PHONE_NATIVE_HELD" : "PHONE_ACTIVITY_MISSING" }
    );
  }
  let preSend = snapshotNativeAuthState();
  let confirmation: NativeConfirmation;
  try {
    purgeExpiredSessions();
    // Fresh challenge must not inherit a prior native session as "verified".
    // Capture preSendUid ONLY after this clear — successful fresh flow ⇒ null.
    await clearStaleNativeAuthForFreshChallenge();
    if (sendGeneration !== nativePhoneSendGeneration) {
      throw new AppError("otp_send_failed", "This verification request is no longer current.", undefined,
        { diagnosticCode: "PHONE_SEND_SUPERSEDED", authPhase: "send" });
    }
    if (runtimePlatform() === "android" && androidActivitySignal() !== androidSignal) {
      throw phoneAuthFailureToAppError({ code: "auth/missing-activity" }, "send", { androidActivity: "missing" });
    }
    preSend = snapshotNativeAuthState();
    log.info("startNativePhoneOtp", {
      attemptId,
      e164Length: phone.length,
      e164Prefix: phone.slice(0, 3),
      phoneSuffix: phoneSuffix(phone),
      androidActivity,
      preSendUserPresent: preSend.userPresent,
    });
    applyOptionalFirebaseTestPhoneSettings(mod);
    // Call-boundary capture: the exact argument passed to RNFirebase (not reconstructed later).
    const firebaseSendPhoneE164 = phone;
    log.info("signInWithPhoneNumber call boundary", {
      attemptId,
      firebaseSendPhoneSuffix: phoneSuffix(firebaseSendPhoneE164),
      e164Length: firebaseSendPhoneE164.length,
      e164Prefix: firebaseSendPhoneE164.slice(0, 3),
      androidActivity,
    });
    // A null Activity can return without settling this promise. The SDK's
    // auto-retrieval window is not the authentication deadline; the attempt
    // controller bounds the visible wait and drops a late result.
    const ownedNative = runtimePlatform() === "android" ? activityBridge() : null;
    if (ownedNative?.startPhoneVerification) {
      const sent = await ownedNative.startPhoneVerification(firebaseSendPhoneE164, sendGeneration, Boolean(options?.forceResend));
      // Android confirms through the same native owner; never RNFirebase's
      // separate ConfirmationResult.confirm/global-currentUser shortcut.
      confirmation = { verificationId: sent.verificationId } as NativeConfirmation;
    } else if (runtimePlatform() === "android" && !installedNativeModule) {
      throw new AppError("auth_not_configured", "Install the updated app to sign in.");
    } else {
      // iOS uses the existing adapter. Host-only injected RNFirebase boundaries
      // retain coverage of controller races; they do not prove Android callbacks.
      confirmation = await authInstance.signInWithPhoneNumber(firebaseSendPhoneE164, Boolean(options?.forceResend));
    }
  } catch (e) {
    if (e instanceof AppError) throw e;
    const mapped = phoneAuthFailureToAppError(e, "send", {
      phoneE164Sent: phone,
      androidActivity,
      attemptId,
    });
    log.error("signInWithPhoneNumber failed", {
      attemptId,
      firebaseAuthCode: mapped.details?.firebaseAuthCode,
      androidActivity,
      firebaseSendPhoneSuffix: phoneSuffix(phone),
    });
    throw mapped;
  } finally {
    releaseSendLock(sendGeneration);
  }

  if (sendGeneration !== nativePhoneSendGeneration) {
    throw new AppError(
      "otp_send_failed",
      "This verification request is no longer current.",
      undefined,
      { attemptId, diagnosticCode: "PHONE_SEND_SUPERSEDED", authPhase: "send" }
    );
  }

  const firebaseVerificationId = confirmation.verificationId;
  if (!firebaseVerificationId || typeof firebaseVerificationId !== "string") {
    throw new AppError(
      "otp_send_failed",
      "Could not start phone verification. Please try again.",
      undefined,
      { attemptId, firebaseAuthCode: "auth/internal-error" }
    );
  }

  const expiresAt = Date.now() + SESSION_TTL_MS;
  if (sendGeneration !== nativePhoneSendGeneration) {
    throw new AppError(
      "otp_send_failed",
      "This verification request is no longer current.",
      undefined,
      { attemptId, diagnosticCode: "PHONE_SEND_SUPERSEDED", authPhase: "send" }
    );
  }
  // Atomically supersede any prior attempt (resend / retry) only while this send still owns it.
  pendingByVerificationId.clear();
  const row: PendingSession = {
    confirmation,
    firebaseVerificationId,
    phoneE164: phone,
    expiresAt,
    attemptId,
    startedAtMs,
    preSendUid: preSend.uid,
    autoVerify: null,
    sendGeneration,
  };
  pendingByVerificationId.set(firebaseVerificationId, row);
  await saveNativePhoneAuthSession(
    {
      firebaseVerificationId,
      phoneE164: phone,
      expiresAt,
      attemptId,
      purpose: "phone_login",
    },
    () => sendGeneration === nativePhoneSendGeneration
  );
  if (sendGeneration !== nativePhoneSendGeneration) {
    pendingByVerificationId.delete(firebaseVerificationId);
    throw new AppError(
      "otp_send_failed",
      "This verification request is no longer current.",
      undefined,
      { attemptId, diagnosticCode: "PHONE_SEND_SUPERSEDED", authPhase: "send" }
    );
  }

  // Instant verification may complete during signInWithPhoneNumber (post-send).
  observePostSendAuthForChallenge({
    verificationId: firebaseVerificationId,
    phoneE164: phone,
    expiresAt,
    resendAvailableAt: Date.now() + 30_000,
    devCodeHint: null,
  });

  log.info("startNativePhoneOtp session stored", {
    attemptId,
    verificationIdPresent: true,
    phoneSuffix: phoneSuffix(phone),
    autoVerified: Boolean(row.autoVerify),
  });

  return {
    verificationId: firebaseVerificationId,
    phoneE164: phone,
    devCodeHint: null,
    expiresAt,
    resendAvailableAt: Date.now() + 30_000,
  };
}

async function signInWithVerificationCode(
  mod: NativeAuthModule,
  firebaseVerificationId: string,
  code: string
): Promise<string> {
  const credential = mod.PhoneAuthProvider.credential(firebaseVerificationId, code);
  const cred = await mod.default().signInWithCredential(credential);
  const uid = cred.user?.uid;
  if (!uid) {
    throw new AppError("auth_failed", "Sign-in succeeded but no user id was returned.");
  }
  return uid;
}

function challengePhoneMismatchError(phone: PhoneE164): AppError {
  return new AppError(
    "auth_failed",
    "This device signed in with a different mobile number than the one being verified. Sign out and start again.",
    undefined,
    {
      authPhase: "confirm",
      diagnosticCode: AUTH_PHONE_CHALLENGE_MISMATCH,
      phoneSuffix: phoneSuffix(phone),
      failureDomain: "auth",
    }
  );
}

function assertAuthenticatedPhoneMatchesChallenge(phone: PhoneE164): string {
  const uid = getNativeAuthUid();
  const authPhone = getNativeAuthPhoneE164();
  if (!uid) {
    throw new AppError("auth_failed", "Phone sign-in did not complete. Enter the SMS code.");
  }
  if (!phonesMatchE164(authPhone, phone)) {
    throw challengePhoneMismatchError(phone);
  }
  return uid;
}

/**
 * Confirm OTP and return Firebase Auth UID. Never logs the code.
 * Survives remount by using SecureStore-backed Firebase verificationId.
 *
 * Empty code is allowed ONLY when a post-send auto-verify marker exists for
 * THIS challenge (genuine Firebase instant verification). A pre-existing UID
 * alone is never sufficient.
 */
export async function confirmNativePhoneOtp(
  challenge: OtpChallenge,
  code: string
): Promise<string> {
  assertProductionNativeOtp();
  const mod = tryNativeAuthModule();
  if (!mod) {
    throw new AppError("auth_not_configured", "Native phone auth module is not linked.");
  }
  purgeExpiredSessions();

  const phone = normalizePhoneE164(challenge.phoneE164);
  const trimmed = code.trim();

  const openingSendGeneration = nativePhoneSendGeneration;
  const openingConfirmGeneration = nativePhoneConfirmGeneration;
  let row = pendingByVerificationId.get(challenge.verificationId);
  if (!row) {
    const persisted = await loadNativePhoneAuthSession();
    if (openingSendGeneration !== nativePhoneSendGeneration || openingConfirmGeneration !== nativePhoneConfirmGeneration) {
      throw new AppError("otp_send_failed", "This verification request is no longer current.", undefined, { diagnosticCode: "PHONE_CONFIRM_SUPERSEDED" });
    }
    if (
      persisted &&
      persisted.purpose !== "contact_change" &&
      persisted.firebaseVerificationId === challenge.verificationId &&
      persisted.phoneE164 === phone
    ) {
      row = {
        confirmation: null,
        firebaseVerificationId: persisted.firebaseVerificationId,
        phoneE164: persisted.phoneE164,
        expiresAt: persisted.expiresAt,
        attemptId: persisted.attemptId,
        startedAtMs: Date.now() - SESSION_TTL_MS,
        preSendUid: null,
        autoVerify: null,
        sendGeneration: openingSendGeneration,
      };
      pendingByVerificationId.set(persisted.firebaseVerificationId, row);
      log.info("confirmNativePhoneOtp restored SecureStore session", {
        attemptId: persisted.attemptId,
        verificationIdPresent: true,
        phoneSuffix: phoneSuffix(phone),
      });
    }
  }

  if (!row) {
    throw new AppError(
      "otp_expired",
      "Verification session was lost after leaving the app. Please request a new code.",
      undefined,
      {
        firebaseAuthCode: "auth/session-expired",
        knownPhoneAuthCode: "auth/unknown",
        phoneAuthPhase: "confirm",
        verificationIdPresent: false,
        phoneSuffix: phoneSuffix(phone),
      }
    );
  }

  if (row.phoneE164 !== phone) {
    throw new AppError("invalid_otp", "Phone number mismatch. Request a new code.");
  }
  if (row.expiresAt <= Date.now()) {
    pendingByVerificationId.delete(row.firebaseVerificationId);
    await clearNativePhoneAuthSessionIfMatches({
      firebaseVerificationId: row.firebaseVerificationId,
      phoneE164: row.phoneE164,
      attemptId: row.attemptId,
    });
    throw new AppError(
      "otp_expired",
      "OTP expired. Please request a new code.",
      undefined,
      { firebaseAuthCode: "auth/code-expired", phoneAuthPhase: "confirm" }
    );
  }

  // Empty code = auto/instant path only (challenge-scoped marker required).
  if (!trimmed) {
    if (row.sendGeneration != null && row.sendGeneration !== nativePhoneSendGeneration) {
      throw new AppError(
        "otp_send_failed",
        "This verification request is no longer current.",
        undefined,
        { attemptId: row.attemptId, diagnosticCode: "PHONE_SEND_SUPERSEDED", authPhase: "confirm" }
      );
    }
    observePostSendAuthForChallenge(challenge);
    const allowed = emptyCodeConfirmAllowed({
      challengeVerificationId: challenge.verificationId,
      challengePhoneE164: phone,
      challengeAttemptId: row.attemptId,
      marker: row.autoVerify,
      currentUid: getNativeAuthUid(),
      currentPhoneE164: getNativeAuthPhoneE164(),
    });
    if (!allowed) {
      throw new AppError(
        "invalid_otp",
        "Enter the verification code from SMS.",
        undefined,
        {
          authPhase: "confirm",
          diagnosticCode: "EMPTY_CODE_WITHOUT_AUTO_VERIFY",
          phoneSuffix: phoneSuffix(phone),
        }
      );
    }
    const uid = assertAuthenticatedPhoneMatchesChallenge(phone);
    pendingByVerificationId.delete(row.firebaseVerificationId);
    await clearNativePhoneAuthSessionIfMatches({ firebaseVerificationId: row.firebaseVerificationId, phoneE164: row.phoneE164, attemptId: row.attemptId });
    if (openingSendGeneration !== nativePhoneSendGeneration || openingConfirmGeneration !== nativePhoneConfirmGeneration || getNativeAuthUid() !== uid) {
      throw new AppError("otp_send_failed", "This verification request is no longer current.", undefined, { diagnosticCode: "PHONE_CONFIRM_SUPERSEDED" });
    }
    log.info("confirmNativePhoneOtp auto-verify ok", {
      attemptId: row.attemptId,
      phoneSuffix: phoneSuffix(phone),
    });
    return uid;
  }

  if (!/^\d{4,8}$/.test(trimmed)) {
    throw new AppError("invalid_otp", "Enter the verification code from SMS.");
  }

  if (
    row.sendGeneration != null &&
    row.sendGeneration !== nativePhoneSendGeneration
  ) {
    throw new AppError(
      "otp_send_failed",
      "This verification request is no longer current.",
      undefined,
      { attemptId: row.attemptId, diagnosticCode: "PHONE_SEND_SUPERSEDED", authPhase: "confirm" }
    );
  }

  if (runtimePlatform() === "android") recoverUnsettledNativeConfirm();

  const confirmKey = `${challenge.verificationId}:${trimmed.length}`;
  if (confirmInFlightKey || sendInFlight) {
    throw new AppError(
      "invalid_otp",
      "Verification is already in progress. Please wait."
    );
  }
  if (runtimePlatform() === "android" && !sendPermittedBySignal(androidActivitySignal())) {
    throw phoneAuthFailureToAppError(
      {
        code: "auth/missing-activity",
        message: "Current activity is null.",
        name: "Error",
      },
      "confirm",
      { androidActivity: "missing", attemptId: row.attemptId }
    );
  }

  const confirmGeneration = ++nativePhoneConfirmGeneration;
  confirmLockGeneration = confirmGeneration;
  confirmInFlightKey = confirmKey;
  const confirmClaim =
    runtimePlatform() === "android"
      ? activityBridge()?.claimConfirmSlot(confirmGeneration) ?? "refused:missing"
      : "accepted:n/a";
  if (runtimePlatform() === "android" && !confirmClaim.startsWith("accepted:")) {
    releaseConfirmLock(confirmGeneration);
    throw new AppError(
      "invalid_otp",
      confirmClaim === "refused:in_flight"
        ? "Verification is still finishing. You can go back. If it does not finish, force stop the app in Android Settings and reopen it."
        : "Phone verification needs the sign-in screen to be open. Go back and try again.",
      undefined,
      {
        attemptId: row.attemptId,
        ...(confirmClaim === "refused:in_flight" ? { phoneAuthSettlement: "unknown" } : {}),
        diagnosticCode: confirmClaim === "refused:in_flight" ? "PHONE_NATIVE_HELD" : "PHONE_ACTIVITY_MISSING",
        authPhase: "confirm",
      }
    );
  }
  try {
    let uid: string;
    const ownedNative = runtimePlatform() === "android" ? activityBridge() : null;
    if (ownedNative?.confirmPhoneVerification) {
      uid = await ownedNative.confirmPhoneVerification(row.firebaseVerificationId, trimmed, phone, confirmGeneration);
    } else if (runtimePlatform() === "android" && !installedNativeModule) {
      throw new AppError("auth_not_configured", "Install the updated app to sign in.");
    } else if (row.confirmation) {
      const cred = await row.confirmation.confirm(trimmed);
      uid = cred.user?.uid ?? "";
      if (!uid) {
        throw new AppError("auth_failed", "Sign-in succeeded but no user id was returned.");
      }
    } else {
      uid = await signInWithVerificationCode(mod, row.firebaseVerificationId, trimmed);
    }

    if (confirmGeneration !== nativePhoneConfirmGeneration) {
      throw new AppError(
        "otp_send_failed",
        "This verification request is no longer current.",
        undefined,
        {
          attemptId: row.attemptId,
          diagnosticCode: "PHONE_CONFIRM_SUPERSEDED",
          authPhase: "confirm",
        }
      );
    }

    // Manual confirm must still bind to the challenge phone.
    if (!phonesMatchE164(getNativeAuthPhoneE164(), phone)) {
      throw challengePhoneMismatchError(phone);
    }

    pendingByVerificationId.delete(row.firebaseVerificationId);
    await clearNativePhoneAuthSessionIfMatches({
      firebaseVerificationId: row.firebaseVerificationId,
      phoneE164: row.phoneE164,
      attemptId: row.attemptId,
    });
    if (confirmGeneration !== nativePhoneConfirmGeneration) {
      throw new AppError(
        "otp_send_failed",
        "This verification request is no longer current.",
        undefined,
        {
          attemptId: row.attemptId,
          diagnosticCode: "PHONE_CONFIRM_SUPERSEDED",
          authPhase: "confirm",
        }
      );
    }
    log.info("confirmNativePhoneOtp ok", {
      attemptId: row.attemptId,
      phoneSuffix: phoneSuffix(phone),
    });
    return uid;
  } catch (e) {
    log.warn("confirmNativePhoneOtp failed", {
      attemptId: row.attemptId,
      verificationIdPresent: true,
      firebaseAuthCode: phoneAuthFailureToAppError(e, "confirm").details?.firebaseAuthCode,
      phoneSuffix: phoneSuffix(phone),
    });
    if (e instanceof AppError) throw e;
    throw phoneAuthFailureToAppError(e, "confirm", {
      androidActivity: probeAndroidAuthActivityState(),
      attemptId: row.attemptId,
    });
  } finally {
    releaseConfirmLock(confirmGeneration);
  }
}

/** Sign out native Firebase Auth (best-effort). */
export async function signOutNativePhoneAuth(
  isCurrent: () => boolean = () => true,
  retireOperations = true
): Promise<boolean> {
  if (!isCurrent()) return false;
  if (retireOperations) {
    retireDispatchedNativeSend();
    retireDispatchedNativeConfirm();
  }
  const mod = tryNativeAuthModule();
  if (!mod) return false;
  try {
    if (!isCurrent()) return false;
    await mod.default().signOut();
  } catch (e) {
    log.warn("native signOut failed", e);
    if (!isCurrent()) return false;
    pendingByVerificationId.clear();
    await clearNativePhoneAuthSession(isCurrent);
    return false;
  }
  if (!isCurrent()) return false;
  pendingByVerificationId.clear();
  await clearNativePhoneAuthSession(isCurrent);
  return isCurrent();
}

/**
 * Reattach a saved verification to memory after relaunch. Does not send,
 * and does not replace a different challenge already held in memory.
 * Returns false when the saved row is missing, expired, or a different phone.
 */
export async function restorePendingPhoneSessionForResume(
  verificationId: string,
  phoneE164: string
): Promise<boolean> {
  const openingSendGeneration = nativePhoneSendGeneration;
  const openingConfirmGeneration = nativePhoneConfirmGeneration;
  purgeExpiredSessions();
  const phone = normalizePhoneE164(phoneE164);
  for (const id of pendingByVerificationId.keys()) {
    if (id !== verificationId) return false;
  }
  const existing = pendingByVerificationId.get(verificationId);
  if (existing?.sendGeneration != null && existing.sendGeneration !== nativePhoneSendGeneration) {
    // Do not re-authorize a retired in-memory attempt from its persisted copy.
    return false;
  }
  if (
    existing &&
    phonesMatchE164(existing.phoneE164, phone) &&
    existing.expiresAt > Date.now()
  ) {
    return true;
  }
  const persisted = await loadNativePhoneAuthSession();
  if (openingSendGeneration !== nativePhoneSendGeneration || openingConfirmGeneration !== nativePhoneConfirmGeneration) return false;
  for (const id of pendingByVerificationId.keys()) {
    if (id !== verificationId) return false;
  }
  if (
    !persisted ||
    persisted.purpose === "contact_change" ||
    persisted.firebaseVerificationId !== verificationId ||
    !phonesMatchE164(persisted.phoneE164, phone) ||
    persisted.expiresAt <= Date.now()
  ) {
    return false;
  }
  pendingByVerificationId.set(verificationId, {
    confirmation: null,
    firebaseVerificationId: persisted.firebaseVerificationId,
    phoneE164: persisted.phoneE164,
    expiresAt: persisted.expiresAt,
    attemptId: persisted.attemptId,
    startedAtMs: persisted.savedAt,
    preSendUid: null,
    autoVerify: null,
    sendGeneration: openingSendGeneration,
  });
  return true;
}

/** Test helper — clears in-memory confirmation cache (not SecureStore). */
export function __clearNativePhoneSessions(): void {
  pendingByVerificationId.clear();
  sendInFlight = false;
  sendLockGeneration = 0;
  confirmInFlightKey = null;
  confirmLockGeneration = 0;
  nativePhoneSendGeneration = 0;
  nativePhoneConfirmGeneration = 0;
}

/** Test helper — inject a pending session for invariant unit coverage. */
export function __seedPendingSessionForTests(row: PendingSession): void {
  pendingByVerificationId.set(row.firebaseVerificationId, row);
}

export type { PendingSession as NativePhonePendingSession };
