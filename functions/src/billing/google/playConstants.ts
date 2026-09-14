/**
 * Canonical Google Play package + production-enablement gates (VYD-32).
 *
 * PLAY_BILLING_ENABLED defaults OFF. Production callables/RTDN stay
 * fail-closed until a later owner-authorized enablement. This file does not
 * create Play Console products, IAM, or Pub/Sub.
 */

import { BillingError } from "../errors";

export const CANONICAL_PLAY_PACKAGE_NAME = "com.specialsoftwares.vyaamikkdiary";

export const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";

export const PLAY_API_BASE =
  "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";

export function isPlayBillingEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.PLAY_BILLING_ENABLED === "true";
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
