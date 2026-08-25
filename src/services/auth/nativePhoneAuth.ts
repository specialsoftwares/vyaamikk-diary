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
import { phoneAuthFailureToAppError } from "./nativePhoneAuthErrors";
import {
  clearNativePhoneAuthSession,
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
}

/** Keyed by Firebase verificationId (also used as OtpChallenge.verificationId). */
const pendingByVerificationId = new Map<string, PendingSession>();
let sendInFlight = false;
let confirmInFlightKey: string | null = null;

function purgeExpiredSessions(): void {
  const now = Date.now();
  for (const [id, row] of pendingByVerificationId) {
    if (row.expiresAt <= now) pendingByVerificationId.delete(id);
  }
}

function runtimePlatform(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require("react-native") as { Platform: { OS: string } };
    return Platform.OS;
  } catch {
    return "node";
  }
}

/**
 * RNFirebase Phone Auth on Android requires a current Activity for the
 * Play Integrity / reCAPTCHA fallback. Activity is resolved inside the
 * native module via getCurrentActivity(); we only probe best-effort here
 * for diagnostics (cannot inject Activity into classic signInWithPhoneNumber).
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
      NativeModules: Record<string, { getConstants?: () => Record<string, unknown> }>;
    };
    if (NativeModules.RNFBAppModule || NativeModules.RNFBAuthModule) {
      return "unknown";
    }
    return "missing";
  } catch {
    return "unknown";
  }
}

function tryNativeAuthModule(): NativeAuthModule | null {
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
  await signOutNativePhoneAuth();
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
    return mod.default().onAuthStateChanged((user) => {
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
  if (row.autoVerify) return row.autoVerify;

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
export async function startNativePhoneOtp(phoneE164: PhoneE164): Promise<OtpChallenge> {
  assertProductionNativeOtp();
  const mod = tryNativeAuthModule();
  if (!mod) {
    throw new AppError("auth_not_configured", "Native phone auth module is not linked.");
  }
  if (sendInFlight) {
    throw new AppError(
      "otp_send_failed",
      "A verification code is already being sent. Please wait a moment."
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

  purgeExpiredSessions();
  // Fresh challenge must not inherit a prior native session as "verified".
  // Capture preSendUid ONLY after this clear — successful fresh flow ⇒ null.
  await clearStaleNativeAuthForFreshChallenge();
  const preSend = snapshotNativeAuthState();
  const startedAtMs = Date.now();
  const androidActivity = probeAndroidAuthActivityState();
  const attemptId = `send_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  log.info("startNativePhoneOtp", {
    attemptId,
    e164Length: phone.length,
    e164Prefix: phone.slice(0, 3),
    phoneSuffix: phoneSuffix(phone),
    androidActivity,
    preSendUserPresent: preSend.userPresent,
  });

  sendInFlight = true;
  let confirmation: NativeConfirmation;
  try {
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
    confirmation = await mod.default().signInWithPhoneNumber(firebaseSendPhoneE164);
  } catch (e) {
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
    sendInFlight = false;
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
  // Atomically supersede any prior attempt (resend / retry).
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
  };
  pendingByVerificationId.set(firebaseVerificationId, row);
  await saveNativePhoneAuthSession({
    firebaseVerificationId,
    phoneE164: phone,
    expiresAt,
    attemptId,
  });

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

  let row = pendingByVerificationId.get(challenge.verificationId);
  if (!row) {
    const persisted = await loadNativePhoneAuthSession();
    if (
      persisted &&
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
    await clearNativePhoneAuthSession();
    throw new AppError(
      "otp_expired",
      "OTP expired. Please request a new code.",
      undefined,
      { firebaseAuthCode: "auth/code-expired", phoneAuthPhase: "confirm" }
    );
  }

  // Empty code = auto/instant path only (challenge-scoped marker required).
  if (!trimmed) {
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
    await clearNativePhoneAuthSession();
    log.info("confirmNativePhoneOtp auto-verify ok", {
      attemptId: row.attemptId,
      phoneSuffix: phoneSuffix(phone),
    });
    return uid;
  }

  if (!/^\d{4,8}$/.test(trimmed)) {
    throw new AppError("invalid_otp", "Enter the verification code from SMS.");
  }

  const confirmKey = `${challenge.verificationId}:${trimmed.length}`;
  if (confirmInFlightKey === confirmKey) {
    throw new AppError(
      "invalid_otp",
      "Verification is already in progress. Please wait."
    );
  }

  confirmInFlightKey = confirmKey;
  try {
    let uid: string;
    if (row.confirmation) {
      const cred = await row.confirmation.confirm(trimmed);
      uid = cred.user?.uid ?? "";
      if (!uid) {
        throw new AppError("auth_failed", "Sign-in succeeded but no user id was returned.");
      }
    } else {
      uid = await signInWithVerificationCode(mod, row.firebaseVerificationId, trimmed);
    }

    // Manual confirm must still bind to the challenge phone.
    if (!phonesMatchE164(getNativeAuthPhoneE164(), phone)) {
      throw challengePhoneMismatchError(phone);
    }

    pendingByVerificationId.delete(row.firebaseVerificationId);
    await clearNativePhoneAuthSession();
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
    confirmInFlightKey = null;
  }
}

/** Sign out native Firebase Auth (best-effort). */
export async function signOutNativePhoneAuth(): Promise<void> {
  const mod = tryNativeAuthModule();
  if (!mod) return;
  try {
    await mod.default().signOut();
  } catch (e) {
    log.warn("native signOut failed", e);
  }
  pendingByVerificationId.clear();
  await clearNativePhoneAuthSession();
}

/** Test helper — clears in-memory confirmation cache (not SecureStore). */
export function __clearNativePhoneSessions(): void {
  pendingByVerificationId.clear();
  sendInFlight = false;
  confirmInFlightKey = null;
}

/** Test helper — inject a pending session for invariant unit coverage. */
export function __seedPendingSessionForTests(row: PendingSession): void {
  pendingByVerificationId.set(row.firebaseVerificationId, row);
}

export type { PendingSession as NativePhonePendingSession };
