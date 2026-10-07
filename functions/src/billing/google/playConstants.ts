/**
 * Canonical Google Play package + production-enablement gates (VYD-32).
 *
 * PLAY_BILLING_ENABLED defaults OFF. Production callables/RTDN stay
 * fail-closed until a later owner-authorized enablement. This file does not
 * create Play Console products, IAM, or Pub/Sub.
 *
 * Restricted tester activation: Internal-track membership and hiding the
 * purchase button are not backend restrictions. If PLAY_BILLING_ENABLED
 * were true, prepare/validate callables would otherwise serve every
 * authenticated caller. PLAY_BILLING_TESTER_UIDS is a fail-closed UID
 * allowlist used only after that enablement check. Empty/absent list
 * denies NEW grants. Already-owned same-uid token lifecycle is not gated
 * by allowlist membership. This module does not enable billing and does
 * not invent tester emails or UIDs.
 *
 * Owner supplies Firebase Auth UIDs privately. Do not commit them.
 * Input format (same env/secret name):
 *   CSV:  uid-a,uid-b
 *   JSON array: ["uid-a","uid-b"]
 *   JSON object: {"uids":["uid-a","uid-b"]}
 *     aliases: firebaseUids, testerUids, PLAY_BILLING_TESTER_UIDS
 * Google / Play emails are not UIDs and are rejected.
 */

import { BillingError } from "../errors";

export const CANONICAL_PLAY_PACKAGE_NAME = "com.specialsoftwares.vyaamikkdiary";

export const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";

export const PLAY_API_BASE =
  "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";

/** CSV or JSON Firebase Auth UIDs. Owner-named later; never invent values. */
export const PLAY_BILLING_TESTER_UIDS_ENV = "PLAY_BILLING_TESTER_UIDS";

const TESTER_UID_JSON_KEYS = [
  "uids",
  "firebaseUids",
  "testerUids",
  PLAY_BILLING_TESTER_UIDS_ENV,
] as const;

export function isPlayBillingEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.PLAY_BILLING_ENABLED === "true";
}

function malformedAllowlist(): never {
  throw new BillingError({
    clientCode: "internal_error",
    causeCode: "play_billing_tester_allowlist_malformed",
  });
}

function uidSetFromParts(parts: unknown[]): ReadonlySet<string> {
  const ids: string[] = [];
  for (const part of parts) {
    if (typeof part !== "string") malformedAllowlist();
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.includes("@")) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "play_billing_tester_allowlist_email_not_uid",
      });
    }
    ids.push(trimmed);
  }
  return new Set(ids);
}

function testerUidsFromJson(parsed: unknown): ReadonlySet<string> {
  if (typeof parsed === "string") {
    return uidSetFromParts([parsed]);
  }
  if (Array.isArray(parsed)) {
    return uidSetFromParts(parsed);
  }
  if (parsed == null || typeof parsed !== "object") {
    malformedAllowlist();
  }
  const rec = parsed as Record<string, unknown>;
  for (const key of TESTER_UID_JSON_KEYS) {
    if (!(key in rec)) continue;
    const value = rec[key];
    if (typeof value === "string") return uidSetFromParts([value]);
    if (Array.isArray(value)) return uidSetFromParts(value);
    malformedAllowlist();
  }
  // Unknown JSON object (including emails-only) → deny all.
  return new Set();
}

/**
 * Parse PLAY_BILLING_TESTER_UIDS. Empty/absent → empty set (deny all).
 * Malformed JSON or email-as-UID throws; do not treat that as an empty list.
 */
export function playBillingTesterUidAllowlist(
  env: NodeJS.ProcessEnv = process.env
): ReadonlySet<string> {
  const raw = env[PLAY_BILLING_TESTER_UIDS_ENV];
  if (typeof raw !== "string") return new Set();
  const trimmed = raw.trim();
  if (!trimmed) return new Set();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      malformedAllowlist();
    }
    return testerUidsFromJson(parsed);
  }
  return uidSetFromParts(trimmed.split(","));
}

export function isPlayBillingTesterAllowed(
  uid: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (typeof uid !== "string" || uid.length === 0) return false;
  return playBillingTesterUidAllowlist(env).has(uid);
}

/**
 * Fail-closed UID allowlist. Call only after isPlayBillingEnabled() is true.
 * Empty/absent PLAY_BILLING_TESTER_UIDS denies every caller.
 */
export function assertPlayBillingTesterAllowed(
  uid: string,
  env: NodeJS.ProcessEnv = process.env
): void {
  if (!isPlayBillingTesterAllowed(uid, env)) {
    throw new BillingError({
      clientCode: "not_entitled",
      causeCode: "play_billing_tester_not_allowlisted",
    });
  }
}

/**
 * Production adapters set enforce=true so RTDN/reconciliation cannot make
 * NEW grants. Callers skip this when the uid already owns this token.
 */
export function assertPlayBillingTesterAllowedIfEnforced(
  uid: string,
  enforce: boolean | undefined,
  env: NodeJS.ProcessEnv = process.env
): void {
  if (!enforce) return;
  assertPlayBillingTesterAllowed(uid, env);
}

export function playPackageNameFromEnv(
  env: NodeJS.ProcessEnv = process.env
): string {
  const configured = env.PLAY_PACKAGE_NAME;
  if (configured == null || configured === "") {
    return CANONICAL_PLAY_PACKAGE_NAME;
  }
  if (configured !== CANONICAL_PLAY_PACKAGE_NAME) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "play_package_name_mismatch",
    });
  }
  return CANONICAL_PLAY_PACKAGE_NAME;
}

export function billingKmsKeyNameFromEnv(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const name = env.BILLING_KMS_KEY_NAME;
  if (typeof name !== "string" || name.length === 0) return null;
  return name;
}
