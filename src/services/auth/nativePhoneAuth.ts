/**
 * Production native phone OTP via @react-native-firebase/auth.
 *
 * Requires an Expo dev build / EAS build — NOT Expo Go.
 * Lazy-loaded so local-mock and shared-dev never evaluate this module at startup.
 */

import { AppError } from "@/domain/errors";
import { env } from "@/config/env";
import type { PhoneE164 } from "@/domain/types";
import { normalizePhoneE164 } from "@/utils/mobileHash";
import { createLogger } from "@/utils/logger";

import type { OtpChallenge } from "./types";

const log = createLogger("auth/nativePhone");

const SESSION_TTL_MS = 10 * 60 * 1000;

type NativeConfirmation = import("@react-native-firebase/auth").ConfirmationResult;

interface PendingSession {
  confirmation: NativeConfirmation;
  phoneE164: PhoneE164;
  expiresAt: number;
}

const pendingBySessionId = new Map<string, PendingSession>();

function purgeExpiredSessions(): void {
  const now = Date.now();
  for (const [id, row] of pendingBySessionId) {
    if (row.expiresAt <= now) pendingBySessionId.delete(id);
  }
}

function newSessionId(): string {
  return `rnfb_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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

/** Lazy require — returns null when native module is not linked (Expo Go, web). */
function tryNativeAuth():
  | (() => import("@react-native-firebase/auth").FirebaseAuthInstance)
  | null {
  const platform = runtimePlatform();
  if (platform === "web" || platform === "node") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@react-native-firebase/auth") as {
      default: () => import("@react-native-firebase/auth").FirebaseAuthInstance;
    };
    return mod.default;
  } catch {
    return null;
  }
}

export function isNativePhoneAuthAvailable(): boolean {
  return tryNativeAuth() != null;
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

/**
 * Start native phone verification. Returns an OtpChallenge whose verificationId
 * is an opaque session key (not the raw Firebase verificationId).
 */
export async function startNativePhoneOtp(phoneE164: PhoneE164): Promise<OtpChallenge> {
  assertProductionNativeOtp();
  const nativeAuth = tryNativeAuth();
  if (!nativeAuth) {
    throw new AppError("auth_not_configured", "Native phone auth module is not linked.");
  }

  const phone = normalizePhoneE164(phoneE164);
  purgeExpiredSessions();

  log.info("startNativePhoneOtp");

  let confirmation: NativeConfirmation;
  try {
    confirmation = await nativeAuth().signInWithPhoneNumber(phone);
  } catch (e) {
    log.error("signInWithPhoneNumber failed", e);
    throw new AppError(
      "otp_send_failed",
      "Could not send the verification code. Check the number and try again."
    );
  }

  const sessionId = newSessionId();
  pendingBySessionId.set(sessionId, {
    confirmation,
    phoneE164: phone,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });

  return {
    verificationId: sessionId,
    phoneE164: phone,
    devCodeHint: null,
  };
}

/**
 * Confirm OTP and return Firebase Auth UID. Never logs the code.
 */
export async function confirmNativePhoneOtp(
  challenge: OtpChallenge,
  code: string
): Promise<string> {
  assertProductionNativeOtp();
  purgeExpiredSessions();

  const trimmed = code.trim();
  if (!/^\d{4,8}$/.test(trimmed)) {
    throw new AppError("invalid_otp", "Enter the verification code from SMS.");
  }

  const row = pendingBySessionId.get(challenge.verificationId);
  if (!row) {
    throw new AppError(
      "otp_expired",
      "Verification session expired. Request a new code."
    );
  }
  if (row.phoneE164 !== normalizePhoneE164(challenge.phoneE164)) {
    throw new AppError("invalid_otp", "Phone number mismatch. Request a new code.");
  }

  try {
    const cred = await row.confirmation.confirm(trimmed);
    pendingBySessionId.delete(challenge.verificationId);
    const uid = cred.user?.uid;
    if (!uid) {
      throw new AppError("auth_failed", "Sign-in succeeded but no user id was returned.");
    }
    log.info("confirmNativePhoneOtp ok");
    return uid;
  } catch (e) {
    log.warn("confirmNativePhoneOtp failed", e);
    if (e instanceof AppError) throw e;
    throw new AppError("invalid_otp", "Incorrect or expired verification code.");
  }
}

/** Sign out native Firebase Auth (best-effort). */
export async function signOutNativePhoneAuth(): Promise<void> {
  const nativeAuth = tryNativeAuth();
  if (!nativeAuth) return;
  try {
    await nativeAuth().signOut();
  } catch (e) {
    log.warn("native signOut failed", e);
  }
}

/** Test helper — clears in-memory confirmation cache. */
export function __clearNativePhoneSessions(): void {
  pendingBySessionId.clear();
}
