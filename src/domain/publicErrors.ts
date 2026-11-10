/**
 * Allowlisted public auth and account errors.
 * Reads typed codes only. It does not log, call the network, or copy Error.message.
 */

import { AUTH_USER_FACING_COPY } from "@/services/auth/authUserFacingCopy";

export type ErrorSurface = "phone" | "reactivation" | "account" | "api";
export type PublicAction = "none" | "retry" | "new_code" | "sign_in" | "support";

export type PublicError = Readonly<{
  title: string;
  message: string;
  action: PublicAction;
}>;

const GENERIC: PublicError = {
  title: "Something went wrong",
  message: "Something went wrong. Please try again later.",
  action: "retry",
};

const PERMISSION: PublicError = {
  title: "Not allowed",
  message: "You don't have permission to perform this action.",
  action: "none",
};

const SESSION_ENDED: PublicError = {
  title: "Please sign in again",
  message: "Your session has ended. Please sign in again to continue.",
  action: "sign_in",
};

const THROTTLED: PublicError = {
  title: "Please wait",
  message: AUTH_USER_FACING_COPY.tooManyRequests,
  action: "none",
};

const OFFLINE_PUBLIC: PublicError = {
  title: "You are offline",
  message:
    "You are offline. Check your connection and try again. Records already saved on this device stay on this device.",
  action: "retry",
};

const SERVICE_UNAVAILABLE: PublicError = {
  title: "Service unavailable",
  message: "This service is unavailable right now. Please try again later.",
  action: "retry",
};

const NETWORK: PublicError = {
  title: "Connection problem",
  message: AUTH_USER_FACING_COPY.network,
  action: "retry",
};

const BAD_CODE: PublicError = {
  title: "Check your code",
  message: AUTH_USER_FACING_COPY.invalidOtp,
  action: "none",
};

const EXPIRED: PublicError = {
  title: "Request a new code",
  message: AUTH_USER_FACING_COPY.expiredOtp,
  action: "new_code",
};

const SESSION_LOST: PublicError = {
  title: "Request a new code",
  message: AUTH_USER_FACING_COPY.sessionLost,
  action: "new_code",
};

const LOCAL_UNAVAILABLE: PublicError = {
  title: "Unable to open secure storage",
  message:
    "We couldn't access secure storage on this device. Close and reopen the app. If this continues, contact support before clearing app data.",
  action: "support",
};

const LOCAL_RECOVERY: PublicError = {
  title: "Your saved data needs attention",
  message:
    "We couldn't open your saved data. Contact support before clearing app data or reinstalling the app.",
  action: "support",
};

const APP_VERIFY_DEVICE: PublicError = {
  title: "Couldn't send the code",
  message:
    "Could not verify this app for phone sign-in on this device. On a physical phone use real SMS; for emulator development use a Firebase Console test phone number with test mode enabled.",
  action: "support",
};

const DEVICE_AUTH_CODES = new Set([
  "auth/app-not-authorized",
  "auth/invalid-app-credential",
  "auth/missing-client-identifier",
  "auth/missing-activity",
  "auth/internal-error",
]);

const CATALOGUE: Readonly<Record<string, PublicError>> = {
  network: NETWORK,
  "auth/network-request-failed": NETWORK,
  invalid_phone: {
    title: "Check your number",
    message: "Please enter a valid 10-digit mobile number.",
    action: "none",
  },
  invalid_otp: BAD_CODE,
  "auth/invalid-verification-code": BAD_CODE,
  otp_expired: EXPIRED,
  "auth/code-expired": EXPIRED,
  "auth/session-expired": EXPIRED,
  otp_send_failed: {
    title: "Couldn't send the code",
    message: AUTH_USER_FACING_COPY.sendFailed,
    action: "retry",
  },
  auth_failed: {
    title: "Sign-in failed",
    message: "Sign-in failed. Please try again.",
    action: "retry",
  },
  auth_not_configured: {
    title: "Sign-in unavailable",
    message: "Login service is not configured for this build.",
    action: "support",
  },
  "auth/operation-not-allowed": {
    title: "Sign-in unavailable",
    message: "Phone sign-in is not enabled for this Firebase project. Contact support.",
    action: "support",
  },
  session_expired: SESSION_ENDED,
  "functions/unauthenticated": SESSION_ENDED,
  unauthenticated: SESSION_ENDED,
  UNAUTHENTICATED: SESSION_ENDED,
  "auth/user-token-expired": SESSION_ENDED,
  session_changed: {
    title: "Sign-in changed",
    message: "Your sign-in changed. Please start this step again.",
    action: "sign_in",
  },
  too_many_attempts: THROTTLED,
  "auth/too-many-requests": THROTTLED,
  "functions/resource-exhausted": THROTTLED,
  "resource-exhausted": THROTTLED,
  not_found: {
    title: "Not found",
    message: "We couldn't find that entry.",
    action: "none",
  },
  permission_denied: PERMISSION,
  "permission-denied": PERMISSION,
  "functions/permission-denied": PERMISSION,
  account_pending_deletion: {
    title: "Account deletion is in progress",
    message: "This account is scheduled for deletion.",
    action: "support",
  },
  email_already_linked: {
    title: "Email already used",
    message: "That email is already used by an account.",
    action: "none",
  },
  email_pending_deletion: {
    title: "Email unavailable",
    message: "That email belongs to an account that is scheduled for deletion.",
    action: "support",
  },
  email_otp_cooldown: {
    title: "Please wait",
    message: "Resend is not available yet.",
    action: "none",
  },
  save_failed: {
    title: "Couldn't save",
    message: "Couldn't save right now. Please try again.",
    action: "retry",
  },
  delete_failed: {
    title: "Couldn't delete",
    message: "Couldn't delete right now. Please try again.",
    action: "retry",
  },
  offline: OFFLINE_PUBLIC,
  offline_read_only: {
    title: "Connection problem",
    message:
      "You can view existing records, but creating, editing, deleting, PDF generation, sharing, and sync are unavailable until you reconnect and this device is re-validated.",
    action: "retry",
  },
  unavailable: SERVICE_UNAVAILABLE,
  "functions/unavailable": SERVICE_UNAVAILABLE,
  "functions/deadline-exceeded": SERVICE_UNAVAILABLE,
  quota_exhausted: {
    title: "Monthly limit reached",
    message: "Monthly record limit reached. This save was not completed.",
    action: "none",
  },
  quota_state_invalid: {
    title: "Couldn't save",
    message: "Couldn't save right now. Please try again.",
    action: "retry",
  },
  secure_store_unavailable: LOCAL_UNAVAILABLE,
  secure_store_module_unavailable: LOCAL_UNAVAILABLE,
  secure_store_read_failed: LOCAL_UNAVAILABLE,
  secure_store_write_failed: LOCAL_UNAVAILABLE,
  secure_store_readback_failed: LOCAL_UNAVAILABLE,
  secure_random_unavailable: LOCAL_UNAVAILABLE,
  key_missing: LOCAL_RECOVERY,
  key_corrupt: LOCAL_RECOVERY,
  key_conflict: LOCAL_RECOVERY,
  migration_incomplete: LOCAL_RECOVERY,
};

const REACTIVATION: Readonly<Record<string, PublicError>> = {
  no_verified_email: {
    title: "Contact support",
    message: "We couldn't confirm an email for this account. Contact support for help.",
    action: "support",
  },
  expired: {
    title: "Request a new code",
    message: "That code has expired. Request a new one.",
    action: "new_code",
  },
  superseded: {
    title: "Request a new code",
    message: "That code is no longer valid. Use the latest email.",
    action: "new_code",
  },
  cooldown: {
    title: "Please wait",
    message: "Resend is not available yet.",
    action: "none",
  },
  rate_limited: {
    title: "Please wait",
    message: "Too many attempts. Wait and request a new code.",
    action: "none",
  },
  attempts_exhausted: {
    title: "Please wait",
    message: "Too many attempts. Wait and request a new code.",
    action: "none",
  },
  invalid_code: BAD_CODE,
  ineligible: {
    title: "Contact support",
    message: "This account cannot be reactivated from the app. Contact support.",
    action: "support",
  },
  purge_underway: {
    title: "Contact support",
    message: "This account cannot be reactivated from the app. Contact support.",
    action: "support",
  },
  provider_unavailable: {
    title: "Couldn't send the code",
    message: "The email could not be sent. Try again when you are online.",
    action: "retry",
  },
};

function own(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function lookup(
  table: Readonly<Record<string, PublicError>>,
  value: unknown
): PublicError | undefined {
  if (typeof value !== "string") return undefined;
  return Object.prototype.hasOwnProperty.call(table, value) ? table[value] : undefined;
}

export function toPublicError(error: unknown, surface: ErrorSurface = "api"): PublicError {
  const seen = new Set<object>();
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!current || typeof current !== "object" || seen.has(current)) break;
    seen.add(current);

    const details = own(current, "details");
    if (own(current, "code") === "otp_expired" && own(details, "verificationIdPresent") === false) {
      return SESSION_LOST;
    }
    const nestedReason = own(details, "reason");
    if (nestedReason === "session_changed" || nestedReason === "session_expired") {
      const session = lookup(CATALOGUE, nestedReason);
      if (session) return session;
    }
    if (surface === "reactivation") {
      const specific = lookup(REACTIVATION, own(details, "code"));
      if (specific) return specific;
    }
    if (
      own(details, "phoneAuthPhase") === "send" &&
      DEVICE_AUTH_CODES.has(String(own(details, "firebaseAuthCode")))
    ) {
      return APP_VERIFY_DEVICE;
    }
    const firebaseCode = own(details, "firebaseAuthCode");
    const specific =
      lookup(CATALOGUE, firebaseCode) ??
      lookup(CATALOGUE, own(current, "code")) ??
      lookup(CATALOGUE, own(current, "reason"));
    if (specific) return specific;
    current = own(current, "cause");
  }
  return GENERIC;
}

const KNOWN_PUBLIC_MESSAGES: ReadonlySet<string> = new Set([
  ...Object.values(CATALOGUE).map((entry) => entry.message),
  ...Object.values(REACTIVATION).map((entry) => entry.message),
  GENERIC.message,
  SESSION_LOST.message,
  APP_VERIFY_DEVICE.message,
  NETWORK.message,
  BAD_CODE.message,
  EXPIRED.message,
  LOCAL_UNAVAILABLE.message,
  LOCAL_RECOVERY.message,
]);

/** True when a string is an exact catalogue sentence. */
export function isKnownPublicMessage(value: string): boolean {
  return KNOWN_PUBLIC_MESSAGES.has(value);
}

/**
 * True when text must not be shown. This does not log the value.
 * A stack, transport code, contact, token, or filesystem path is unsafe.
 */
export function isUnsafePublicText(value: string): boolean {
  if (!value) return false;
  if (value.includes("functions/")) return true;
  if (value.includes("\n")) return true;
  if (/\bat\s+\S+\s*\(/.test(value)) return true;
  if (/auth\/[a-z0-9-]+/i.test(value)) return true;
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(value)) return true;
  if (/\/Users\/|\/home\/|node_modules|AIza|Bearer|\beyJ\b/i.test(value)) return true;
  if (/\bfirebase\b/i.test(value)) return true;
  if (/\+?\d[\d\s()-]{8,}\d/.test(value)) return true;
  return false;
}

/**
 * Public sentence for a failure. Known codes use the catalogue.
 * Unknown failures use the generic sentence. Error.message is never returned.
 */
export function presentPublicError(error: unknown, surface: ErrorSurface = "api"): string {
  try {
    if (typeof error === "string") {
      if (isKnownPublicMessage(error) && !isUnsafePublicText(error)) return error;
      return GENERIC.message;
    }
    const message = toPublicError(error, surface).message;
    if (!message || isUnsafePublicText(message) || !isKnownPublicMessage(message)) {
      return GENERIC.message;
    }
    return message;
  } catch {
    return GENERIC.message;
  }
}

/**
 * A string already stored by a screen. Catalogue sentences pass through.
 * Leaks are replaced. Any other stored text uses the screen's existing fallback
 * so a raw exception is not shown.
 */
export function displayStoredError(stored: string, fallback: string): string {
  if (isUnsafePublicText(stored) || isUnsafePublicText(fallback)) {
    return presentPublicError(stored);
  }
  if (isKnownPublicMessage(stored)) return stored;
  return fallback;
}
