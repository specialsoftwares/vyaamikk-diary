/**
 * Safe diagnostic contract for production logs and crash reports.
 *
 * Production output uses fixed event codes, allowlisted metadata, and
 * classified errors. Unknown/free-form text is never printed.
 * This module must not throw into application control flow.
 */

export const SAFE_REDACTED = "[redacted]" as const;
export const SAFE_UNCLASSIFIED_EVENT = "unclassified" as const;
export const SAFE_GENERIC_SUMMARY = "diagnostic_event" as const;
export const SAFE_FALLBACK_SCOPE = "app" as const;
export const SAFE_DIAGNOSTIC_FAILED = "diagnostic_failed" as const;

export type SafeErrorClass =
  | "unauthenticated"
  | "permission"
  | "unavailable"
  | "invalid"
  | "conflict"
  | "unknown";

export type SafeMetaValue = string | number | boolean;

const MAX_DEPTH = 4;
const MAX_KEYS = 24;
const MAX_STRING = 64;
const MAX_ABS_NUMBER = 1_000_000_000;

const ALLOWED_SCOPES = new Set([
  "accountDeletion/cancel",
  "accountDeletion/complete",
  "accountDeletion/finalize",
  "accountDeletion/firebase",
  "accountDeletion/localDevice",
  "accountDeletion/pending",
  "accountDeletion/purgeLocal",
  "accountDeletion/retired",
  "auth/emailIndexFirestore",
  "auth/firebase",
  "auth/flowGate",
  "auth/identityCallable",
  "auth/jsAuthBridge",
  "auth/localMockEmailOtp",
  "auth/mock",
  "auth/mockRegistry",
  "auth/nativeCallableAuthGate",
  "auth/nativePhone",
  "auth/nativePhoneContactChange",
  "auth/perf",
  "auth/reconcilePendingMobile",
  "auth/shared-dev",
  "cashPaid/photo",
  "cashPaid/photoStorage",
  "customerCredit/firebase",
  "customerCredit/mock",
  "customerCredit/photo",
  "customerCredit/reminders",
  "devReset/firebase",
  "devReset/localAll",
  "devReset/localTargeted",
  "devReset/purgeExtras",
  "device/trusted",
  "diary/localFirst",
  "hooks/businessInsights",
  "insights/businessInsight",
  "insights/fyRecap",
  "insights/movement",
  "insights/sync",
  "letterhead/docs-firebase",
  "letterhead/docs-mock",
  "letterhead/firebase",
  "letterhead/mock",
  "letterhead/storageMigration",
  "localDb",
  "location",
  "notifications",
  "pdf",
  "pincode",
  "professionalPack/mock",
  "profileLogo",
  "purchaseOrder/firebase",
  "purchaseOrder/mock",
  "save/diag",
  "save/persistentLock",
  "screens/edit",
  "settings/locationFootprints",
  "startup/errorBoundary",
  "startup/globalHandlers",
  "state/auth",
  "state/sync",
  "statutory",
  "storage/user",
  "sync",
  "useFormAutosave",
]);

const ALLOWED_CONTEXTS = new Set(["ErrorBoundary", "startup", "app"]);

const MESSAGE_EVENTS: Record<string, { event: string; summary: string }> = {
  "init failed": { event: "localdb_init_failed", summary: "local database init failed" },
  "boot failed": { event: "auth_boot_failed", summary: "auth boot failed" },
  "uncaught startup/runtime error": {
    event: "startup_uncaught",
    summary: "uncaught startup error",
  },
  "uncaught render error": {
    event: "startup_uncaught_render",
    summary: "uncaught render error",
  },
  "pdf generate failed": { event: "pdf_generate_failed", summary: "pdf generate failed" },
  "pdf share failed": { event: "pdf_share_failed", summary: "pdf share failed" },
  "autosave failed": { event: "form_autosave_failed", summary: "autosave failed" },
  "ErrorUtils install failed": {
    event: "startup_errorutils_install_failed",
    summary: "error handler install failed",
  },
  "unhandledrejection install failed": {
    event: "startup_rejection_install_failed",
    summary: "rejection handler install failed",
  },
  "trusted device record failed": {
    event: "device_trusted_record_failed",
    summary: "trusted device record failed",
  },
};

const CALLABLE_FAILED_RE = /^callable ([A-Za-z][A-Za-z0-9_]{1,63}) failed$/;

const ALLOWED_CALLABLES = new Set([
  "completeAccountReactivation",
  "confirmVerifiedMobileContactChange",
  "mintClientAuthToken",
  "prepareAndroidBillingAccount",
  "prepareIOSBillingAccount",
  "resolveOrCreateUserByPhone",
  "startEmailVerification",
  "validateAndActivateAndroid",
  "validateAndActivateIOS",
]);

const STARTUP_STAGES = new Set([
  "BOOT",
  "CONFIG_LOADED",
  "RUNTIME_RESOLVED",
  "NATIVE_FIREBASE_READY",
  "JS_FIREBASE_READY",
  "LOCAL_DB_OPENED",
  "LOCAL_DB_MIGRATED",
  "AUTH_HYDRATED",
  "SYNC_READY",
  "ROUTER_READY",
]);

const STARTUP_ERROR_CODES = new Set([
  "ENV_RESOLUTION_FAILED",
  "RUNTIME_ISOLATION_FAILED",
  "PRODUCTION_CONFIG_INVALID",
  "LOCAL_MOCK_FORBIDDEN",
  "FIREBASE_JS_MISSING",
  "FIREBASE_JS_INIT_FAILED",
  "FIREBASE_NATIVE_MISSING",
  "FIREBASE_PROJECT_MISMATCH",
  "LOCAL_DB_OPEN_FAILED",
  "LOCAL_DB_MIGRATE_FAILED",
  "PROVIDER_TREE_INVALID",
  "UNCAUGHT_JS_ERROR",
  "UNKNOWN",
]);

const APP_ERROR_CODES = new Set([
  "network",
  "invalid_phone",
  "invalid_otp",
  "otp_expired",
  "otp_send_failed",
  "auth_failed",
  "too_many_attempts",
  "auth_not_configured",
  "session_expired",
  "not_found",
  "permission_denied",
  "account_pending_deletion",
  "email_already_linked",
  "email_pending_deletion",
  "email_otp_cooldown",
  "save_failed",
  "delete_failed",
  "offline_read_only",
  "quota_exhausted",
  "quota_state_invalid",
  "unknown",
]);

const FIREBASE_AUTH_CODES = new Set([
  "auth/invalid-phone-number",
  "auth/too-many-requests",
  "auth/invalid-verification-code",
  "auth/session-expired",
  "auth/network-request-failed",
  "auth/user-disabled",
  "auth/internal-error",
  "auth/invalid-email",
  "auth/missing-verification-id",
  "auth/code-expired",
]);

const ALLOWED_OPS = new Set([
  "init",
  "boot",
  "save",
  "sync",
  "purchase",
  "restore",
  "delete",
  "retry",
]);

const ALLOWED_KINDS = new Set([
  "failed",
  "unavailable",
  "retryable",
  "cancelled",
  "verified",
  "already_in_flight",
]);

const TOKEN_RE = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const ATTEMPT_RE = /^[A-Za-z0-9_-]{1,64}$/;
const UID_SUFFIX_RE = /^[A-Za-z0-9]{4,8}$/;
const E164_PREFIX_RE = /^\+\d{1,3}$/;
const PHONE_SUFFIX_RE = /^\d{2,4}$/;
const REGION_RE = /^[a-z]+-[a-z]+[0-9]$/;

type FieldSpec = (value: unknown) => SafeMetaValue | undefined;

const META_FIELDS: Record<string, FieldSpec> = {
  event: (v) => token(v),
  code: (v) =>
    asAllowedString(v, STARTUP_ERROR_CODES) ??
    asAllowedString(v, APP_ERROR_CODES) ??
    token(v),
  stage: (v) => asAllowedString(v, STARTUP_STAGES),
  kind: (v) => asAllowedString(v, ALLOWED_KINDS),
  op: (v) => asAllowedString(v, ALLOWED_OPS),
  attemptId: (v) => matchString(v, ATTEMPT_RE),
  callableName: (v) => asAllowedString(v, ALLOWED_CALLABLES),
  functionsRegion: (v) => matchString(v, REGION_RE),
  firebaseAuthCode: (v) => asAllowedString(v, FIREBASE_AUTH_CODES),
  errorCode: (v) => asAllowedString(v, STARTUP_ERROR_CODES) ?? asAllowedString(v, APP_ERROR_CODES),
  errorClass: (v) =>
    asAllowedString(
      v,
      new Set(["unauthenticated", "permission", "unavailable", "invalid", "conflict", "unknown"])
    ),
  retryable: (v) => asBoolean(v),
  recoverable: (v) => asBoolean(v),
  available: (v) => asBoolean(v),
  androidActivity: (v) => asBoolean(v),
  nativeUidPresent: (v) => asBoolean(v),
  jsUidPresent: (v) => asBoolean(v),
  uidsMatch: (v) => asBoolean(v),
  count: (v) => asBoundedInt(v, 0, 1_000_000),
  ms: (v) => asBoundedInt(v, 0, MAX_ABS_NUMBER),
  e164Length: (v) => asBoundedInt(v, 0, 16),
  e164Prefix: (v) => matchString(v, E164_PREFIX_RE),
  phoneSuffix: (v) => matchString(v, PHONE_SUFFIX_RE),
  uidSuffix: (v) => matchString(v, UID_SUFFIX_RE),
};

function token(value: unknown): string | undefined {
  return matchString(value, TOKEN_RE);
}

function matchString(value: unknown, re: RegExp): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value.length === 0 || value.length > MAX_STRING) return undefined;
  return re.test(value) ? value : undefined;
}

function asAllowedString(value: unknown, allowed: Set<string>): string | undefined {
  if (typeof value !== "string") return undefined;
  return allowed.has(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asBoundedInt(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    return undefined;
  }
  if (value < min || value > max) return undefined;
  return value;
}

function isErrorLike(value: unknown): value is { name?: unknown; code?: unknown } {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function readOwn(value: object, key: string): unknown {
  try {
    const desc = Object.getOwnPropertyDescriptor(value, key);
    if (!desc) return undefined;
    if (desc.get) return desc.get.call(value);
    return desc.value;
  } catch {
    return undefined;
  }
}

export function classifyScope(scope: string): string {
  try {
    if (ALLOWED_SCOPES.has(scope)) return scope;
    return SAFE_FALLBACK_SCOPE;
  } catch {
    return SAFE_FALLBACK_SCOPE;
  }
}

export function classifyContext(context: string | undefined): string | undefined {
  try {
    if (context == null) return undefined;
    if (ALLOWED_CONTEXTS.has(context)) return context;
    return "app";
  } catch {
    return "app";
  }
}

export function classifyLogMessage(message: string): { event: string; summary: string } {
  try {
    const mapped = MESSAGE_EVENTS[message];
    if (mapped) return mapped;
    const callable = CALLABLE_FAILED_RE.exec(message);
    if (callable && ALLOWED_CALLABLES.has(callable[1]!)) {
      return { event: "identity_callable_failed", summary: "identity callable failed" };
    }
    return { event: SAFE_UNCLASSIFIED_EVENT, summary: SAFE_GENERIC_SUMMARY };
  } catch {
    return { event: SAFE_DIAGNOSTIC_FAILED, summary: SAFE_DIAGNOSTIC_FAILED };
  }
}

export function classifyError(error: unknown): {
  class: SafeErrorClass;
  code: string | null;
  name: string;
} {
  try {
    if (!isErrorLike(error)) {
      return { class: "unknown", code: null, name: "Error" };
    }
    const rawName = readOwn(error, "name");
    const rawCode = readOwn(error, "code");
    const name =
      rawName === "AppError" || rawName === "StartupError" || rawName === "Error"
        ? rawName
        : "Error";
    if (typeof rawCode === "string" && APP_ERROR_CODES.has(rawCode)) {
      return { class: classForAppCode(rawCode), code: rawCode, name };
    }
    if (typeof rawCode === "string" && STARTUP_ERROR_CODES.has(rawCode)) {
      return { class: "unknown", code: rawCode, name };
    }
    if (typeof rawCode === "string" && FIREBASE_AUTH_CODES.has(rawCode)) {
      return { class: classForFirebaseAuth(rawCode), code: rawCode, name };
    }
    if (typeof rawCode === "string" && rawCode.includes("unauthenticated")) {
      return { class: "unauthenticated", code: null, name };
    }
    if (typeof rawCode === "string" && rawCode.includes("permission")) {
      return { class: "permission", code: null, name };
    }
    return { class: "unknown", code: null, name };
  } catch {
    return { class: "unknown", code: null, name: "Error" };
  }
}

function classForAppCode(code: string): SafeErrorClass {
  switch (code) {
    case "session_expired":
    case "auth_failed":
    case "auth_not_configured":
      return "unauthenticated";
    case "permission_denied":
      return "permission";
    case "network":
    case "otp_send_failed":
    case "offline_read_only":
      return "unavailable";
    case "invalid_phone":
    case "invalid_otp":
    case "otp_expired":
    case "too_many_attempts":
      return "invalid";
    case "email_already_linked":
    case "quota_exhausted":
      return "conflict";
    default:
      return "unknown";
  }
}

function classForFirebaseAuth(code: string): SafeErrorClass {
  if (code === "auth/network-request-failed") return "unavailable";
  if (code === "auth/session-expired" || code === "auth/user-disabled") {
    return "unauthenticated";
  }
  if (
    code === "auth/invalid-phone-number" ||
    code === "auth/invalid-verification-code" ||
    code === "auth/invalid-email" ||
    code === "auth/too-many-requests"
  ) {
    return "invalid";
  }
  return "unknown";
}

export function createSafeDiagnosticError(error: unknown, context?: string): Error {
  const classified = classifyError(error);
  const safeContext = classifyContext(context) ?? "app";
  const safe = new Error(`diagnostic:${classified.class}`);
  safe.name = "SafeDiagnosticError";
  safe.stack = `SafeDiagnosticError: diagnostic:${classified.class}\n    at recordError (${safeContext})`;
  return safe;
}

function sanitizePlainObject(
  value: object,
  depth: number,
  seen: WeakSet<object>
): Record<string, SafeMetaValue> {
  const out: Record<string, SafeMetaValue> = {};
  let keys: string[] = [];
  try {
    keys = Object.keys(value).slice(0, MAX_KEYS);
  } catch {
    return out;
  }
  for (const key of keys) {
    const spec = META_FIELDS[key];
    if (!spec) continue;
    const read = readOwn(value, key);
    if (read !== undefined && typeof read === "object" && read !== null) {
      continue;
    }
    const validated = spec(read);
    if (validated !== undefined) out[key] = validated;
  }
  void depth;
  void seen;
  return out;
}

export function sanitizeLogMetadata(data: unknown): Record<string, SafeMetaValue> | undefined {
  try {
    return sanitizeLogMetadataInner(data);
  } catch {
    return { event: SAFE_DIAGNOSTIC_FAILED };
  }
}

function sanitizeLogMetadataInner(data: unknown): Record<string, SafeMetaValue> | undefined {
  if (data === undefined) return undefined;
  const seen = new WeakSet<object>();
  if (data instanceof Error) {
    const classified = classifyError(data);
    const out: Record<string, SafeMetaValue> = {
      errorClass: classified.class,
      name: classified.name,
    };
    if (classified.code) out.code = classified.code;
    return out;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return undefined;
  }
  if (seen.has(data)) return { event: SAFE_UNCLASSIFIED_EVENT };
  seen.add(data);
  const out = sanitizePlainObject(data, 0, seen);
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Bounded walk used only to prove cycles/getters cannot throw.
 * Never used to print arbitrary values.
 */
export function inspectWithoutThrowing(value: unknown): "ok" | "failed" {
  try {
    const seen = new WeakSet<object>();
    const walk = (next: unknown, depth: number): void => {
      if (depth > MAX_DEPTH) return;
      if (next == null || typeof next !== "object") return;
      if (seen.has(next)) return;
      seen.add(next);
      let keys: string[] = [];
      try {
        keys = Object.keys(next).slice(0, MAX_KEYS);
      } catch {
        return;
      }
      for (const key of keys) {
        const read = readOwn(next, key);
        walk(read, depth + 1);
      }
    };
    walk(value, 0);
    return "ok";
  } catch {
    return "failed";
  }
}
