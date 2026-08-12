/**
 * Native Firebase phone rebind for purpose `contact_change`.
 *
 * Uses RNFirebase Auth (@react-native-firebase/auth@24.1.0):
 *   auth().verifyPhoneNumber(B)  — SMS challenge WITHOUT signing in
 *   PhoneAuthProvider.credential(verificationId, code)
 *   currentUser.updatePhoneNumber(credential) — updates CURRENT uid only
 *
 * MUST NOT call signInWithPhoneNumber / signInWithCredential / clearStaleNativeAuth
 * (those are login/registration paths).
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
import { getNativeAuthPhoneE164, getNativeAuthUid, probeAndroidAuthActivityState } from "./nativePhoneAuth";

const log = createLogger("auth/nativePhoneContactChange");

export const NATIVE_CONTACT_CHANGE_PURPOSE = "contact_change" as const;

const SESSION_TTL_MS = 10 * 60 * 1000;

type NativeAuthModule = {
  default: () => {
    currentUser: {
      uid: string;
      phoneNumber?: string | null;
      updatePhoneNumber: (credential: {
        providerId: string;
        token: string;
        secret: string;
      }) => Promise<void>;
      getIdToken: (forceRefresh?: boolean) => Promise<string>;
    } | null;
    verifyPhoneNumber: (
      phoneNumber: string,
      autoVerifyTimeoutOrForceResend?: number | boolean,
      forceResend?: boolean
    ) => {
      on: (
        event: "state_changed",
        observer: (snapshot: PhoneAuthSnapshot) => void,
        errorCb?: (error: unknown) => void
      ) => { then?: unknown };
    };
    settings: { appVerificationDisabledForTesting?: boolean; forceRecaptchaFlowForTesting?: boolean };
  };
  PhoneAuthProvider: {
    credential: (
      verificationId: string,
      code: string
    ) => { providerId: string; token: string; secret: string };
  };
  PhoneAuthState?: {
    CODE_SENT: string;
    AUTO_VERIFIED: string;
    AUTO_VERIFY_TIMEOUT: string;
    ERROR: string;
  };
};

interface PhoneAuthSnapshot {
  state: "sent" | "timeout" | "verified" | "error";
  verificationId: string;
  code: string | null;
  error: unknown | null;
}

interface ContactChangePendingSession {
  firebaseVerificationId: string;
  phoneE164: PhoneE164;
  expiresAt: number;
  attemptId: string;
  purpose: typeof NATIVE_CONTACT_CHANGE_PURPOSE;
  /** Android auto-verify code — memory only, never persisted. */
  autoCode: string | null;
  expectedUid: string;
}

const pendingByVerificationId = new Map<string, ContactChangePendingSession>();
let sendInFlight = false;
let confirmInFlightKey: string | null = null;

function runtimePlatform(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require("react-native") as { Platform: { OS: string } };
    return Platform.OS;
  } catch {
    return "node";
  }
}

function tryNativeAuthModule(): NativeAuthModule | null {
  const platform = runtimePlatform();
  if (platform === "web" || platform === "node") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@react-native-firebase/auth") as NativeAuthModule;
    if (typeof mod.default !== "function") return null;
    if (typeof mod.PhoneAuthProvider?.credential !== "function") return null;
    return mod;
  } catch {
    return null;
  }
}

function phoneSuffix(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.length >= 4 ? d.slice(-4) : "????";
}

function assertNativeAvailable(): NativeAuthModule {
  if (env.isProduction && runtimePlatform() === "web") {
    throw new AppError(
      "auth_not_configured",
      "Verified mobile change is not available on web in production builds."
    );
  }
  const mod = tryNativeAuthModule();
  if (!mod) {
    throw new AppError(
      "auth_not_configured",
      "Native Firebase Phone Auth is not available. Install a development/EAS build — Expo Go cannot rebind a production mobile number."
    );
  }
  return mod;
}

function purgeExpired(): void {
  const now = Date.now();
  for (const [id, row] of pendingByVerificationId) {
    if (row.expiresAt <= now) pendingByVerificationId.delete(id);
  }
}

/**
 * Start SMS verification for candidate B without signing out or creating a session.
 */
export async function startNativePhoneContactChangeOtp(
  newPhoneE164: PhoneE164,
  opts?: { forceResend?: boolean }
): Promise<OtpChallenge> {
  const mod = assertNativeAvailable();
  const currentUid = getNativeAuthUid();
  if (!currentUid) {
    throw new AppError(
      "auth_failed",
      "You must stay signed in to change your verified mobile number."
    );
  }

  if (sendInFlight) {
    throw new AppError(
      "otp_send_failed",
      "A verification code is already being sent. Please wait a moment."
    );
  }

  const phone = normalizePhoneE164(newPhoneE164);
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new AppError("invalid_phone", "Please enter a valid 10-digit mobile number.", undefined, {
      firebaseAuthCode: "auth/invalid-phone-number",
      purpose: NATIVE_CONTACT_CHANGE_PURPOSE,
    });
  }

  const currentPhone = getNativeAuthPhoneE164();
  if (currentPhone && currentPhone === phone) {
    throw new AppError(
      "invalid_phone",
      "Enter a different mobile number than your current verified number."
    );
  }

  purgeExpired();
  const attemptId = `chg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const androidActivity = probeAndroidAuthActivityState();
  log.info("startNativePhoneContactChangeOtp", {
    attemptId,
    purpose: NATIVE_CONTACT_CHANGE_PURPOSE,
    phoneSuffix: phoneSuffix(phone),
    uidSuffix: currentUid.slice(-6),
    androidActivity,
    // Never clear/sign-out current user for contact_change.
    currentUserPreserved: true,
  });

  sendInFlight = true;
  try {
    try {
      applyFirebasePhoneAuthTestingSettingsIfAllowed(mod.default().settings);
    } catch {
      // optional
    }

    const snapshot = await new Promise<PhoneAuthSnapshot>((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };
      try {
        mod
          .default()
          .verifyPhoneNumber(phone, 60, Boolean(opts?.forceResend))
          .on(
            "state_changed",
            (snap) => {
              if (snap.state === "error") {
                settle(() => reject(snap.error ?? new Error("Phone verification failed.")));
                return;
              }
              if (
                snap.state === "sent" ||
                snap.state === "timeout" ||
                snap.state === "verified"
              ) {
                if (!snap.verificationId) {
                  settle(() =>
                    reject(
                      new AppError(
                        "otp_send_failed",
                        "Could not start phone verification. Please try again."
                      )
                    )
                  );
                  return;
                }
                settle(() => resolve(snap));
              }
            },
            (err) => settle(() => reject(err))
          );
      } catch (e) {
        settle(() => reject(e));
      }
    });

    const expiresAt = Date.now() + SESSION_TTL_MS;
    pendingByVerificationId.clear();
    pendingByVerificationId.set(snapshot.verificationId, {
      firebaseVerificationId: snapshot.verificationId,
      phoneE164: phone,
      expiresAt,
      attemptId,
      purpose: NATIVE_CONTACT_CHANGE_PURPOSE,
      autoCode:
        snapshot.state === "verified" && typeof snapshot.code === "string" && snapshot.code
          ? snapshot.code
          : null,
      expectedUid: currentUid,
    });
    await saveNativePhoneAuthSession({
      firebaseVerificationId: snapshot.verificationId,
      phoneE164: phone,
      expiresAt,
      attemptId,
    });

    log.info("contact_change challenge ready", {
      attemptId,
      purpose: NATIVE_CONTACT_CHANGE_PURPOSE,
      verificationIdPresent: true,
      autoVerified: snapshot.state === "verified",
      phoneSuffix: phoneSuffix(phone),
    });

    return {
      verificationId: snapshot.verificationId,
      phoneE164: phone,
      devCodeHint: null,
      expiresAt,
      resendAvailableAt: Date.now() + 30_000,
    };
  } catch (e) {
    const mapped = phoneAuthFailureToAppError(e, "send", {
      phoneE164Sent: phone,
      androidActivity,
      attemptId,
    });
    log.error("verifyPhoneNumber (contact_change) failed", {
      attemptId,
      purpose: NATIVE_CONTACT_CHANGE_PURPOSE,
      firebaseAuthCode: mapped.details?.firebaseAuthCode,
    });
    throw mapped;
  } finally {
    sendInFlight = false;
  }
}

/**
 * Confirm OTP and update the CURRENT Firebase Auth user's phone to B.
 * Does not call resolveOrCreateUserByPhone. Returns the same UID.
 */
export async function confirmNativePhoneContactChangeUpdate(
  challenge: OtpChallenge,
  code: string
): Promise<{ uid: string; phoneE164: PhoneE164 }> {
  const mod = assertNativeAvailable();
  purgeExpired();

  const phone = normalizePhoneE164(challenge.phoneE164);
  const trimmed = code.trim();
  const inflightKey = `${challenge.verificationId}:${trimmed || "auto"}`;
  if (confirmInFlightKey === inflightKey) {
    throw new AppError(
      "otp_send_failed",
      "Verification is already in progress. Please wait a moment."
    );
  }

  let row = pendingByVerificationId.get(challenge.verificationId);
  if (!row) {
    const persisted = await loadNativePhoneAuthSession();
    if (
      persisted &&
      persisted.firebaseVerificationId === challenge.verificationId &&
      persisted.phoneE164 === phone
    ) {
      const uid = getNativeAuthUid();
      if (!uid) {
        throw new AppError("auth_failed", "You must stay signed in to finish this change.");
      }
      row = {
        firebaseVerificationId: persisted.firebaseVerificationId,
        phoneE164: persisted.phoneE164,
        expiresAt: persisted.expiresAt,
        attemptId: persisted.attemptId,
        purpose: NATIVE_CONTACT_CHANGE_PURPOSE,
        autoCode: null,
        expectedUid: uid,
      };
      pendingByVerificationId.set(persisted.firebaseVerificationId, row);
    }
  }

  if (!row || row.purpose !== NATIVE_CONTACT_CHANGE_PURPOSE) {
    throw new AppError(
      "invalid_otp",
      "This verification challenge is no longer valid. Request a new code.",
      undefined,
      { purpose: NATIVE_CONTACT_CHANGE_PURPOSE }
    );
  }
  if (row.expiresAt <= Date.now()) {
    pendingByVerificationId.delete(challenge.verificationId);
    throw new AppError("otp_expired", "This code has expired. Request a new one.");
  }

  const currentUid = getNativeAuthUid();
  if (!currentUid || currentUid !== row.expectedUid) {
    throw new AppError(
      "auth_failed",
      "Your signed-in session changed during mobile verification. Sign in again and retry."
    );
  }

  const effectiveCode = trimmed || row.autoCode || "";
  if (!effectiveCode) {
    throw new AppError("invalid_otp", "Enter the 6-digit verification code.");
  }

  confirmInFlightKey = inflightKey;
  try {
    const user = mod.default().currentUser;
    if (!user || user.uid !== currentUid) {
      throw new AppError("auth_failed", "You must stay signed in to finish this change.");
    }

    const credential = mod.PhoneAuthProvider.credential(
      row.firebaseVerificationId,
      effectiveCode
    );
    log.info("updatePhoneNumber start", {
      attemptId: row.attemptId,
      purpose: NATIVE_CONTACT_CHANGE_PURPOSE,
      uidSuffix: currentUid.slice(-6),
      phoneSuffix: phoneSuffix(phone),
    });
    await user.updatePhoneNumber(credential);

    const afterUid = getNativeAuthUid();
    const afterPhone = getNativeAuthPhoneE164();
    if (!afterUid || afterUid !== currentUid) {
      throw new AppError(
        "auth_failed",
        "Mobile update could not preserve your account. No server change was applied."
      );
    }
    if (!afterPhone || afterPhone !== phone) {
      throw new AppError(
        "auth_failed",
        "Mobile update did not complete. Your previous verified number remains active on the server."
      );
    }

    // Force-refresh ID token so callables see phone_number = B.
    await user.getIdToken(true);

    pendingByVerificationId.delete(challenge.verificationId);
    await clearNativePhoneAuthSession();

    log.info("updatePhoneNumber success", {
      attemptId: row.attemptId,
      purpose: NATIVE_CONTACT_CHANGE_PURPOSE,
      uidSuffix: afterUid.slice(-6),
      phoneSuffix: phoneSuffix(afterPhone),
    });

    return { uid: afterUid, phoneE164: afterPhone };
  } catch (e) {
    if (e instanceof AppError) throw e;
    const mapped = phoneAuthFailureToAppError(e, "confirm", {
      phoneE164Sent: phone,
      attemptId: row.attemptId,
    });
    // Map credential-already-in-use to the same safe collision message.
    const codeStr = String(mapped.details?.firebaseAuthCode ?? "");
    if (
      codeStr.includes("credential-already-in-use") ||
      codeStr.includes("account-exists")
    ) {
      throw new AppError(
        "permission_denied",
        "This mobile number is already linked to a Vyaamikk account. Please continue with that account or contact support.",
        e,
        { ...mapped.details, purpose: NATIVE_CONTACT_CHANGE_PURPOSE }
      );
    }
    throw mapped;
  } finally {
    confirmInFlightKey = null;
  }
}

/** Test helper — clears in-memory contact-change challenges. */
export function resetNativePhoneContactChangeForTests(): void {
  pendingByVerificationId.clear();
  sendInFlight = false;
  confirmInFlightKey = null;
}
