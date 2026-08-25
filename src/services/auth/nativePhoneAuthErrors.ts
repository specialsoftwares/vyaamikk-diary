/**
 * Preserve RNFirebase / Firebase Auth phone-OTP error codes for beta diagnostics.
 * Never put tokens, OTPs, or credentials in messages.
 */

import { AppError, type AppErrorCode } from "@/domain/errors";
import { AUTH_USER_FACING_COPY } from "./authUserFacingCopy";

/** Firebase Auth codes we explicitly surface in the beta UI. */
export const KNOWN_PHONE_AUTH_CODES = [
  "auth/app-not-authorized",
  "auth/invalid-app-credential",
  "auth/missing-client-identifier",
  "auth/invalid-phone-number",
  "auth/too-many-requests",
  "auth/quota-exceeded",
  "auth/network-request-failed",
  "auth/missing-activity",
  "auth/operation-not-allowed",
  "auth/internal-error",
] as const;

export type KnownPhoneAuthCode = (typeof KNOWN_PHONE_AUTH_CODES)[number];

export type PhoneAuthPhase = "send" | "confirm";

export interface NativePhoneAuthFailure {
  firebaseAuthCode: string;
  knownCode: KnownPhoneAuthCode | "auth/unknown";
  exceptionName: string;
  redactedMessage: string;
  userMessage: string;
  appErrorCode: AppErrorCode;
}

const SECRETISH =
  /\b(AIza[0-9A-Za-z_-]{10,}|Bearer\s+\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+|password|secret|api[_-]?key|otp|token|sessionInfo|verificationId)\b/gi;
const SECRET_ASSIGN =
  /\b(otp|token|api[_-]?key|password|secret|sessionInfo|verificationId)\s*[:=]\s*\S+/gi;

export function redactPhoneAuthMessage(raw: string, maxLen = 220): string {
  let s = String(raw || "Unknown native auth error");
  s = s.replace(SECRET_ASSIGN, "$1=[redacted]");
  s = s.replace(SECRETISH, "[redacted]");
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > maxLen) s = `${s.slice(0, maxLen - 1)}…`;
  return s || "Unknown native auth error";
}

function readStringProp(obj: object, key: string): string | null {
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Extract Firebase Auth code from RNFirebase / native exceptions.
 * Prefer explicit `code` fields; fall back to `[auth/…]` in the message.
 */
export function extractFirebaseAuthCode(error: unknown): string {
  if (!error || typeof error !== "object") {
    if (typeof error === "string") {
      const m = error.match(/\[?(auth\/[a-z0-9-]+)\]?/i);
      if (m) return m[1].toLowerCase();
    }
    return "auth/unknown";
  }
  const obj = error as object;
  const direct =
    readStringProp(obj, "code") ||
    readStringProp(obj, "errorCode") ||
    readStringProp(obj, "nativeErrorCode");
  if (direct) {
    const normalized = direct.startsWith("auth/")
      ? direct.toLowerCase()
      : `auth/${direct.replace(/^auth\//i, "").toLowerCase()}`;
    return normalized;
  }
  const message =
    readStringProp(obj, "message") ||
    readStringProp(obj, "nativeErrorMessage") ||
    "";
  const bracket = message.match(/\[(auth\/[a-z0-9-]+)\]/i);
  if (bracket) return bracket[1].toLowerCase();
  const bare = message.match(/\b(auth\/[a-z0-9-]+)\b/i);
  if (bare) return bare[1].toLowerCase();
  return "auth/unknown";
}

export function extractExceptionName(error: unknown): string {
  if (error instanceof Error && error.name) return error.name;
  if (error && typeof error === "object") {
    const n = readStringProp(error as object, "name");
    if (n) return n;
    const ctor = (error as { constructor?: { name?: string } }).constructor?.name;
    if (ctor) return ctor;
  }
  return "Error";
}

export function extractRawMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    return (
      readStringProp(error as object, "message") ||
      readStringProp(error as object, "nativeErrorMessage") ||
      String(error)
    );
  }
  return String(error ?? "Unknown error");
}

function isKnownCode(code: string): code is KnownPhoneAuthCode {
  return (KNOWN_PHONE_AUTH_CODES as readonly string[]).includes(code);
}

export function mapPhoneAuthFailure(
  error: unknown,
  phase: PhoneAuthPhase
): NativePhoneAuthFailure {
  const firebaseAuthCode = extractFirebaseAuthCode(error);
  const knownCode = isKnownCode(firebaseAuthCode)
    ? firebaseAuthCode
    : ("auth/unknown" as const);
  const exceptionName = extractExceptionName(error);
  const redactedMessage = redactPhoneAuthMessage(extractRawMessage(error));

  let appErrorCode: AppErrorCode = phase === "send" ? "otp_send_failed" : "invalid_otp";
  let userMessage: string =
    phase === "send" ? AUTH_USER_FACING_COPY.sendFailed : AUTH_USER_FACING_COPY.invalidOtp;

  switch (knownCode === "auth/unknown" ? firebaseAuthCode : knownCode) {
    case "auth/invalid-phone-number":
      appErrorCode = "invalid_phone";
      userMessage = "Please enter a valid 10-digit mobile number.";
      break;
    case "auth/invalid-verification-code":
    case "auth/invalid-verification-id":
      appErrorCode = "invalid_otp";
      userMessage =
        phase === "confirm"
          ? AUTH_USER_FACING_COPY.invalidOtp
          : "Could not start verification. Please request a new code.";
      break;
    case "auth/code-expired":
    case "auth/session-expired":
      appErrorCode = "otp_expired";
      userMessage = AUTH_USER_FACING_COPY.expiredOtp;
      break;
    case "auth/too-many-requests":
    case "auth/quota-exceeded":
      appErrorCode = "too_many_attempts";
      userMessage = AUTH_USER_FACING_COPY.tooManyRequests;
      break;
    case "auth/network-request-failed":
      appErrorCode = "network";
      userMessage = AUTH_USER_FACING_COPY.network;
      break;
    case "auth/operation-not-allowed":
      appErrorCode = "auth_not_configured";
      userMessage =
        "Phone sign-in is not enabled for this Firebase project. Contact support.";
      break;
    case "auth/app-not-authorized":
    case "auth/invalid-app-credential":
    case "auth/missing-client-identifier":
    case "auth/missing-activity":
    case "auth/internal-error":
      appErrorCode = phase === "send" ? "otp_send_failed" : "auth_failed";
      if (phase === "send") {
        userMessage =
          "Could not verify this app for phone sign-in on this device. On a physical phone use real SMS; for emulator development use a Firebase Console test phone number with test mode enabled.";
      } else {
        userMessage = "Sign-in failed. Please try again.";
      }
      break;
    default:
      break;
  }

  return {
    firebaseAuthCode,
    knownCode,
    exceptionName,
    redactedMessage,
    userMessage,
    appErrorCode,
  };
}

export function phoneAuthFailureToAppError(
  error: unknown,
  phase: PhoneAuthPhase,
  extra?: Record<string, string | number | boolean | null>
): AppError {
  const mapped = mapPhoneAuthFailure(error, phase);
  return new AppError(mapped.appErrorCode, mapped.userMessage, error, {
    firebaseAuthCode: mapped.firebaseAuthCode,
    knownPhoneAuthCode: mapped.knownCode,
    exceptionName: mapped.exceptionName,
    redactedNativeMessage: mapped.redactedMessage,
    phoneAuthPhase: phase,
    ...extra,
  });
}

/** Safe on-screen diagnostic id (never a token). */
export function phoneAuthDiagnosticId(error: unknown): string | null {
  if (!(error instanceof AppError) || !error.details) return null;
  const code = error.details.firebaseAuthCode;
  return typeof code === "string" && code.startsWith("auth/") ? code : null;
}

/**
 * Production on-screen failure text for OTP send/confirm.
 * Never includes Firebase codes, exception class, activity, or raw phone.
 */
export function formatPhoneAuthDisplayMessage(error: unknown): string {
  if (!(error instanceof AppError)) {
    return mapPhoneAuthFailure(error, "send").userMessage;
  }
  return userFacingMessageFromAppError(error);
}

function userFacingMessageFromAppError(error: AppError): string {
  return error.message || "Could not send the verification code. Check the number and try again.";
}

export function formatPhoneAuthCopyDiagnostics(error: unknown): string {
  if (!(error instanceof AppError)) {
    const mapped = mapPhoneAuthFailure(error, "send");
    return [
      "Vyaamikk Diary — Phone Auth Diagnostics",
      `failureDomain=auth`,
      `firebaseAuthCode=${mapped.firebaseAuthCode}`,
      `exceptionName=${mapped.exceptionName}`,
      `redactedMessage=${mapped.redactedMessage}`,
    ].join("\n");
  }
  const d = error.details ?? {};
  const failureDomain =
    typeof d.failureDomain === "string" && d.failureDomain
      ? d.failureDomain
      : typeof d.functionsErrorCode === "string"
        ? "functions"
        : typeof d.firebaseAuthCode === "string"
          ? "auth"
          : "app";
  const lines = [
    "Vyaamikk Diary — Phone Auth Diagnostics",
    `appErrorCode=${error.code}`,
    `failureDomain=${failureDomain}`,
    `phase=${String(d.authPhase ?? d.phoneAuthPhase ?? "")}`,
    `diagnosticCode=${String(d.diagnosticCode ?? "")}`,
  ];
  if (failureDomain === "functions" || typeof d.functionsErrorCode === "string") {
    lines.push(`functionsCode=${String(d.functionsErrorCode ?? "")}`);
    lines.push(`functionName=${String(d.callableName ?? "")}`);
    lines.push(`functionsRegion=${String(d.functionsRegion ?? "")}`);
    lines.push(`firebaseUserPresent=${String(d.firebaseUserPresent ?? "")}`);
    lines.push(`idTokenReady=${String(d.idTokenReady ?? "")}`);
    lines.push(`authAppName=${String(d.authAppName ?? "")}`);
    lines.push(`functionsAppName=${String(d.functionsAppName ?? "")}`);
    lines.push(`sameFirebaseApp=${String(d.sameFirebaseApp ?? "")}`);
  } else if (typeof d.firebaseAuthCode === "string") {
    lines.push(`firebaseAuthCode=${d.firebaseAuthCode}`);
    if (typeof d.knownPhoneAuthCode === "string") {
      lines.push(`knownPhoneAuthCode=${d.knownPhoneAuthCode}`);
    }
    if (typeof d.exceptionName === "string" && d.exceptionName) {
      lines.push(`exceptionName=${d.exceptionName}`);
    }
    if (typeof d.phoneE164Sent === "string" && d.phoneE164Sent) {
      const digits = d.phoneE164Sent.replace(/\D/g, "");
      lines.push(`phoneSuffix=${digits.slice(-4) || "????"}`);
    }
    if (typeof d.androidActivity === "string" && d.androidActivity) {
      lines.push(`androidActivity=${d.androidActivity}`);
    }
  } else if (typeof d.exceptionName === "string" && d.exceptionName) {
    lines.push(`exceptionName=${d.exceptionName}`);
  }
  lines.push(
    `redactedMessage=${String(d.redactedNativeMessage ?? redactPhoneAuthMessage(error.message))}`
  );
  return lines.join("\n");
}
