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
 * denies all callers. This module does not enable billing and does not
 * invent tester emails or UIDs. RTDN / reconciliation are not gated here
 * (Pub/Sub still unwired live; residual if those paths are later enabled).
 */

import { BillingError } from "../errors";

export const CANONICAL_PLAY_PACKAGE_NAME = "com.specialsoftwares.vyaamikkdiary";

export const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";

export const PLAY_API_BASE =
  "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";

/** Comma-separated Firebase Auth UIDs. Owner-named later; never invent values. */
export const PLAY_BILLING_TESTER_UIDS_ENV = "PLAY_BILLING_TESTER_UIDS";

export function isPlayBillingEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.PLAY_BILLING_ENABLED === "true";
}

export function playBillingTesterUidAllowlist(
  env: NodeJS.ProcessEnv = process.env
): ReadonlySet<string> {
  const raw = env[PLAY_BILLING_TESTER_UIDS_ENV];
  if (typeof raw !== "string") return new Set();
  const ids = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return new Set(ids);
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
