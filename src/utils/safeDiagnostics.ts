/**
 * Safe diagnostic contract for production logs and crash reports.
 *
 * Production output uses fixed event codes, allowlisted metadata, and
 * classified errors. Unknown/free-form text is never printed.
 * This module must not throw into application control flow.
 */

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
  "auth/reactivation",
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

type MessageMapping = { event: string; summary: string };

const MESSAGE_EVENTS = new Map<string, MessageMapping>([
  ["init failed", { event: "localdb_init_failed", summary: "local database init failed" }],
  ["boot failed", { event: "auth_boot_failed", summary: "auth boot failed" }],
  [
    "uncaught startup/runtime error",
    { event: "startup_uncaught", summary: "uncaught startup error" },
  ],
  [
    "uncaught render error",
    { event: "startup_uncaught_render", summary: "uncaught render error" },
  ],
  ["pdf generate failed", { event: "pdf_generate_failed", summary: "pdf generate failed" }],
  ["pdf share failed", { event: "pdf_share_failed", summary: "pdf share failed" }],
  ["autosave failed", { event: "form_autosave_failed", summary: "autosave failed" }],
  [
    "ErrorUtils install failed",
    { event: "startup_errorutils_install_failed", summary: "error handler install failed" },
  ],
  [
    "unhandledrejection install failed",
    {
      event: "startup_rejection_install_failed",
      summary: "rejection handler install failed",
    },
  ],
  [
    "trusted device record failed",
    { event: "device_trusted_record_failed", summary: "trusted device record failed" },
  ],
  [
    "reactivation verification",
    { event: "reactivation_verification", summary: "reactivation verification" },
  ],
]);

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
  "STARTUP_DEADLINE",
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
  "unknown",
  "rejected",
  "stale",
  "local_failed",
]);

const REACTIVATION_STAGES = new Set([
  "handler",
  "account",
  "callable",
  "session",
  "navigation",
  "cleanup",
]);

const ERROR_CLASSES = new Set<SafeErrorClass>([
  "unauthenticated",
  "permission",
  "unavailable",
  "invalid",
  "conflict",
  "unknown",
]);

const ERROR_NAMES = new Set(["AppError", "StartupError", "Error"]);

const ALLOWED_REGIONS = new Set(["asia-south1"]);

type FieldSpec = (value: unknown) => SafeMetaValue | undefined;

const META_FIELDS = new Map<string, FieldSpec>([
  [
    "code",
    (v) =>
      asAllowedString(v, STARTUP_ERROR_CODES) ??
      asAllowedString(v, APP_ERROR_CODES) ??
      asAllowedString(v, FIREBASE_AUTH_CODES),
  ],
  ["stage", (v) => asAllowedString(v, STARTUP_STAGES)],
  ["kind", (v) => asAllowedString(v, ALLOWED_KINDS)],
  ["reactivationStage", (v) => asAllowedString(v, REACTIVATION_STAGES)],
  [
    "attemptId",
    (v) => (typeof v === "string" && /^[0-9a-f]{16}$/.test(v) ? v : undefined),
  ],
  ["op", (v) => asAllowedString(v, ALLOWED_OPS)],
  ["callableName", (v) => asAllowedString(v, ALLOWED_CALLABLES)],
  ["functionsRegion", (v) => asAllowedString(v, ALLOWED_REGIONS)],
  ["firebaseAuthCode", (v) => asAllowedString(v, FIREBASE_AUTH_CODES)],
  [
    "errorCode",
    (v) => asAllowedString(v, STARTUP_ERROR_CODES) ?? asAllowedString(v, APP_ERROR_CODES),
  ],
  ["errorClass", (v) => asAllowedString(v, ERROR_CLASSES)],
  ["retryable", (v) => asBoolean(v)],
  ["recoverable", (v) => asBoolean(v)],
  ["available", (v) => asBoolean(v)],
  ["androidActivity", (v) => asBoolean(v)],
  ["nativeUidPresent", (v) => asBoolean(v)],
  ["jsUidPresent", (v) => asBoolean(v)],
  ["uidsMatch", (v) => asBoolean(v)],
  ["count", (v) => asBoundedInt(v, 0, 1_000_000)],
  ["ms", (v) => asBoundedInt(v, 0, MAX_ABS_NUMBER)],
  ["e164Length", (v) => asBoundedInt(v, 0, 16)],
]);

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

function isSafePrimitive(value: unknown): value is SafeMetaValue {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

/**
 * Own data descriptors only. Never invoke getters, toJSON, toString, or valueOf.
 */
function readDataOwn(value: object, key: string): unknown {
  try {
    const desc = Object.getOwnPropertyDescriptor(value, key);
    if (!desc) return undefined;
    if (typeof desc.get === "function" || typeof desc.set === "function") return undefined;
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
    if (typeof message !== "string") {
      return { event: SAFE_UNCLASSIFIED_EVENT, summary: SAFE_GENERIC_SUMMARY };
    }
    const mapped = MESSAGE_EVENTS.get(message);
    if (mapped) return { event: mapped.event, summary: mapped.summary };
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
    if (typeof error !== "object" || error == null) {
      return { class: "unknown", code: null, name: "Error" };
    }
    const rawName = readDataOwn(error, "name");
    const rawCode = readDataOwn(error, "code");
    const name = typeof rawName === "string" && ERROR_NAMES.has(rawName) ? rawName : "Error";
    if (typeof rawCode === "string" && APP_ERROR_CODES.has(rawCode)) {
      return { class: classForAppCode(rawCode), code: rawCode, name };
    }
    if (typeof rawCode === "string" && STARTUP_ERROR_CODES.has(rawCode)) {
      return { class: "unknown", code: rawCode, name };
    }
    if (typeof rawCode === "string" && FIREBASE_AUTH_CODES.has(rawCode)) {
      return { class: classForFirebaseAuth(rawCode), code: rawCode, name };
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

const FRAME_DENY =
  /@|AIza|Bearer|\beyJ|age_not_admitted|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\+?\d[\d\s()-]{8,}\d|\d{8,}/i;

const LABEL_RE = /^[A-Za-z][A-Za-z0-9_./-]{0,63}$/;
const CORRELATION_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;
const CODE_TOKEN_RE = /^[A-Za-z0-9_./-]{1,64}$/;

function isSafeLabel(value: string): boolean {
  if (!LABEL_RE.test(value)) return false;
  if (value.includes("..") || value.includes("@") || value.includes("\\")) return false;
  if (/(^|\/)(Users|home|node_modules)(\/|$)/.test(value)) return false;
  if (FRAME_DENY.test(value)) return false;
  return true;
}

function allowDiagnosticLabel(context: string | undefined): string {
  try {
    if (typeof context !== "string") return "app";
    if (
      (ALLOWED_CONTEXTS.has(context) ||
        ALLOWED_OPS.has(context) ||
        ALLOWED_SCOPES.has(context)) &&
      isSafeLabel(context)
    ) {
      return context;
    }
    return "app";
  } catch {
    return "app";
  }
}

function safeCodeToken(code: string | null): string {
  if (
    code &&
    code !== "age_not_admitted" &&
    CODE_TOKEN_RE.test(code) &&
    !code.includes("..") &&
    !FRAME_DENY.test(code)
  ) {
    return code;
  }
  return "unknown";
}

function newCorrelationId(): string {
  try {
    const bytes = new Uint8Array(16);
    const cryptoObj = globalThis.crypto;
    if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
      cryptoObj.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    const alphabet = "abcdefghjkmnpqrstuvwxyz";
    let id = "c";
    for (let i = 0; i < 20; i += 1) {
      id += alphabet[(bytes[i % bytes.length] ?? 0) % alphabet.length];
    }
    return id;
  } catch {
    return "cfallbackcorrelationid";
  }
}

function acceptCorrelationId(passed: string | undefined): string {
  if (
    typeof passed === "string" &&
    CORRELATION_RE.test(passed) &&
    !passed.includes("@") &&
    !passed.includes("/") &&
    !FRAME_DENY.test(passed)
  ) {
    return passed;
  }
  return newCorrelationId();
}

function readStack(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  try {
    const desc = Object.getOwnPropertyDescriptor(error, "stack");
    if (desc && typeof desc.get !== "function" && typeof desc.value === "string") {
      return desc.value;
    }
    if (error instanceof Error) {
      const stack = error.stack;
      return typeof stack === "string" ? stack : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function normaliseFrame(line: string): string | null {
  if (!/^\s*at\s+\S/.test(line)) return null;
  if (line.includes("node_modules") || FRAME_DENY.test(line)) return null;
  let next = line.replace(/\/Users\/[^/\s]+/g, "");
  next = next.replace(/\/home\/[^/\s]+/g, "");
  next = next.replace(/[A-Za-z]:\\Users\\[^\\\s]+/g, "");
  next = next.replace(/\?[^)\s]*/g, "");
  if (next.includes("node_modules") || /\/Users\/|\/home\//.test(next) || FRAME_DENY.test(next)) {
    return null;
  }
  if (!/(?:^|[^\w.-])(src|app)\//.test(next)) return null;
  return `    ${next.trim()}`;
}

function buildSafeStack(
  originalStack: string | undefined,
  errorClass: string,
  code: string,
  context: string,
  correlationId: string
): string {
  const header = `SafeDiagnosticError: diagnostic:${errorClass}`;
  const meta = `    code=${code} context=${context} correlation=${correlationId}`;
  const frames: string[] = [];
  if (typeof originalStack === "string") {
    for (const line of originalStack.split("\n")) {
      const kept = normaliseFrame(line);
      if (!kept) continue;
      frames.push(kept);
      if (frames.length >= 12) break;
    }
  }
  if (frames.length === 0) {
    frames.push(`    at ${code} (${context})`);
  }
  return [header, meta, ...frames].join("\n");
}

export type SafeDiagnosticError = Error & {
  code: string;
  context: string;
  correlationId: string;
};

export function createSafeDiagnosticError(
  error: unknown,
  context?: string,
  correlationId?: string
): SafeDiagnosticError {
  try {
    const classified = classifyError(error);
    const safeContext = allowDiagnosticLabel(context);
    const code = safeCodeToken(classified.code);
    const correlation = acceptCorrelationId(correlationId);
    const safe = new Error(`diagnostic:${classified.class}`) as SafeDiagnosticError;
    safe.name = "SafeDiagnosticError";
    safe.code = code;
    safe.context = safeContext;
    safe.correlationId = correlation;
    safe.stack = buildSafeStack(readStack(error), classified.class, code, safeContext, correlation);
    return safe;
  } catch {
    const safe = new Error("diagnostic:unknown") as SafeDiagnosticError;
    safe.name = "SafeDiagnosticError";
    safe.code = "unknown";
    safe.context = "app";
    safe.correlationId = "cfallbackcorrelationid";
    safe.stack = "SafeDiagnosticError: diagnostic:unknown\n    code=unknown context=app correlation=cfallbackcorrelationid\n    at unknown (app)";
    return safe;
  }
}

function sanitizePlainObject(value: object): Record<string, SafeMetaValue> {
  const out: Record<string, SafeMetaValue> = Object.create(null);
  for (const [key, spec] of META_FIELDS) {
    const read = readDataOwn(value, key);
    if (read === undefined) continue;
    if (typeof read === "object" && read !== null) continue;
    const validated = spec(read);
    if (validated !== undefined && isSafePrimitive(validated)) {
      out[key] = validated;
    }
  }
  return out;
}

export function sanitizeLogMetadata(data: unknown): Record<string, SafeMetaValue> | undefined {
  try {
    if (data === undefined) return undefined;
    if (data instanceof Error) {
      const classified = classifyError(data);
      const out: Record<string, SafeMetaValue> = Object.create(null);
      out.errorClass = classified.class;
      out.name = classified.name;
      if (classified.code) out.code = classified.code;
      return out;
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return undefined;
    }
    const out = sanitizePlainObject(data);
    return Object.keys(out).length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}
