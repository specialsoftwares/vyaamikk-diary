/**
 * Fixed public copy for recognised failures.
 * Message ids are stable so translations can be wired later.
 * publicMessage never returns backend text, stacks, callable names,
 * Firestore paths, or internal exception codes.
 */

export const PUBLIC_ERROR_MESSAGE_IDS = {
  network: "errors.network",
  invalid_otp: "errors.invalidOtp",
  otp_expired: "errors.otpExpired",
  too_many_attempts: "errors.tooManyAttempts",
  session_expired: "errors.sessionExpired",
  session_changed: "errors.sessionChanged",
  age_not_admitted: "errors.ageNotAdmitted",
  unknown: "errors.unknown",
} as const;

export type PublicErrorCode = keyof typeof PUBLIC_ERROR_MESSAGE_IDS;

export type PublicErrorMessageId = (typeof PUBLIC_ERROR_MESSAGE_IDS)[PublicErrorCode];

/** British English. Do not interpolate backend text into these sentences. */
export const PUBLIC_ERROR_COPY: Record<PublicErrorCode, string> = {
  network: "No internet connection. Please check your network and try again.",
  invalid_otp: "That code is incorrect. Please try again.",
  otp_expired: "That code has expired. Please request a new one.",
  too_many_attempts: "Too many attempts. Please wait a few minutes and try again.",
  session_expired: "Your session has expired. Please sign in again.",
  session_changed: "Your sign-in changed. Please start this step again.",
  age_not_admitted: "We could not save that yet. Check your connection and try again.",
  unknown: "Something went wrong. Please try again.",
};

export type PublicErrorEntry = {
  code: PublicErrorCode;
  messageId: PublicErrorMessageId;
  message: string;
};

export const PUBLIC_ERROR_CATALOGUE: readonly PublicErrorEntry[] = (
  Object.keys(PUBLIC_ERROR_MESSAGE_IDS) as PublicErrorCode[]
).map((code) => ({
  code,
  messageId: PUBLIC_ERROR_MESSAGE_IDS[code],
  message: PUBLIC_ERROR_COPY[code],
}));

const CODE_TO_PUBLIC: Record<string, PublicErrorCode> = {
  network: "network",
  "auth/network-request-failed": "network",
  "functions/unavailable": "network",
  unavailable: "network",
  NETWORK_ERROR: "network",
  invalid_otp: "invalid_otp",
  "auth/invalid-verification-code": "invalid_otp",
  "auth/invalid-verification-id": "invalid_otp",
  EMAIL_OTP_INVALID: "invalid_otp",
  otp_expired: "otp_expired",
  "auth/code-expired": "otp_expired",
  EMAIL_OTP_EXPIRED: "otp_expired",
  too_many_attempts: "too_many_attempts",
  "auth/too-many-requests": "too_many_attempts",
  "auth/quota-exceeded": "too_many_attempts",
  "functions/resource-exhausted": "too_many_attempts",
  EMAIL_OTP_LOCKED: "too_many_attempts",
  RATE_LIMITED: "too_many_attempts",
  session_expired: "session_expired",
  "auth/session-expired": "session_expired",
  "auth/user-token-expired": "session_expired",
  "functions/unauthenticated": "session_expired",
  unauthenticated: "session_expired",
  UNAUTHENTICATED: "session_expired",
  session_changed: "session_changed",
  age_not_admitted: "age_not_admitted",
};

const AGE_TOKEN = /(^|[^A-Za-z0-9_])age_not_admitted([^A-Za-z0-9_]|$)/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /\+?\d[\d\s()-]{8,}\d/;
const SECRET_RE = /AIza|Bearer|\beyJ/;
const PATH_OR_TRANSPORT_RE =
  /(?:\/Users\/|\/home\/|[A-Za-z]:\\|node_modules|https?:\/\/|\bfunctions\/|\bauth\/[a-z0-9-]+|\bfirebase\b)/i;
const CALLABLE_NAME_RE =
  /\b(resolveOrCreateUserByPhone|startEmailVerification|mintClientAuthToken|completeAccountReactivation|confirmVerifiedMobileContactChange|prepareAndroidBillingAccount|prepareIOSBillingAccount|validateAndActivateAndroid|validateAndActivateIOS)\b/;

export function isUnsafePublicText(value: string): boolean {
  return (
    AGE_TOKEN.test(value) ||
    EMAIL_RE.test(value) ||
    PHONE_RE.test(value) ||
    SECRET_RE.test(value) ||
    PATH_OR_TRANSPORT_RE.test(value) ||
    CALLABLE_NAME_RE.test(value) ||
    value.includes("\n    at ")
  );
}

function readDataString(value: object, key: string): string | null {
  try {
    const desc = Object.getOwnPropertyDescriptor(value, key);
    if (!desc || typeof desc.get === "function") return null;
    return typeof desc.value === "string" && desc.value.length > 0 ? desc.value : null;
  } catch {
    return null;
  }
}

function readMessage(error: unknown): string {
  if (error instanceof Error) {
    try {
      return typeof error.message === "string" ? error.message : "";
    } catch {
      return "";
    }
  }
  if (error && typeof error === "object") {
    return readDataString(error, "message") ?? "";
  }
  return "";
}

function readCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const own = readDataString(error, "code");
  if (own) return own;
  if (error instanceof Error) {
    try {
      const code = (error as { code?: unknown }).code;
      return typeof code === "string" && code.length > 0 ? code : null;
    } catch {
      return null;
    }
  }
  return null;
}

function readNestedCode(error: object): string | null {
  try {
    const desc = Object.getOwnPropertyDescriptor(error, "details");
    if (!desc || typeof desc.get === "function" || !desc.value || typeof desc.value !== "object") {
      return null;
    }
    const details = desc.value as object;
    return readDataString(details, "code") ?? readDataString(details, "reason");
  } catch {
    return null;
  }
}

function classifyFromText(message: string): PublicErrorCode | null {
  const trimmed = message.trim();
  if (!trimmed) return null;
  const exact = CODE_TO_PUBLIC[trimmed];
  if (exact) return exact;
  // Exact ownership fence — must never present as session_expired while the
  // current account session is still successful.
  if (trimmed === "session_changed" || /\bsession_changed\b/.test(trimmed)) {
    return "session_changed";
  }
  if (AGE_TOKEN.test(trimmed)) return "age_not_admitted";
  if (
    /functions\/unauthenticated|auth\/session-expired|auth\/user-token-expired|\bUNAUTHENTICATED\b/.test(
      trimmed
    )
  ) {
    return "session_expired";
  }
  if (/auth\/code-expired|\bEMAIL_OTP_EXPIRED\b/.test(trimmed)) return "otp_expired";
  if (
    /auth\/invalid-verification-code|auth\/invalid-verification-id|\bEMAIL_OTP_INVALID\b/.test(
      trimmed
    )
  ) {
    return "invalid_otp";
  }
  if (
    /auth\/too-many-requests|auth\/quota-exceeded|functions\/resource-exhausted|\bEMAIL_OTP_LOCKED\b|\bRATE_LIMITED\b/.test(
      trimmed
    )
  ) {
    return "too_many_attempts";
  }
  if (/auth\/network-request-failed|functions\/unavailable|\bNETWORK_ERROR\b/.test(trimmed)) {
    return "network";
  }
  return null;
}

export function classifyPublicError(error: unknown): PublicErrorCode {
  try {
    const code = readCode(error);
    if (code && CODE_TO_PUBLIC[code]) return CODE_TO_PUBLIC[code];
    if (error && typeof error === "object") {
      const nested = readNestedCode(error);
      if (nested && CODE_TO_PUBLIC[nested]) return CODE_TO_PUBLIC[nested];
    }
    return classifyFromText(readMessage(error)) ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function publicMessageId(error: unknown): PublicErrorMessageId {
  return PUBLIC_ERROR_MESSAGE_IDS[classifyPublicError(error)];
}

export function publicMessage(error: unknown): string {
  try {
    return PUBLIC_ERROR_COPY[classifyPublicError(error)];
  } catch {
    return PUBLIC_ERROR_COPY.unknown;
  }
}
