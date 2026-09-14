/**
 * Canonical iOS App Store identifiers + production-enablement gates (VYD-33).
 *
 * APPSTORE_BILLING_ENABLED defaults OFF. Product identifiers in the Phase A
 * catalog remain provisional until App Store Connect confirmation — a
 * production go-live gate, not something this phase flips.
 *
 * Bundle id is the compile-time constant `CANONICAL_IOS_BUNDLE_ID`. There is
 * no `APPSTORE_BUNDLE_ID` env alias.
 */

import { Environment } from "@apple/app-store-server-library";

import { BillingError } from "../errors";

export const CANONICAL_IOS_BUNDLE_ID = "com.specialsoftwares.vyaamikkdiary";

/**
 * HARD GO-LIVE GATE. The nine iOS product ids in `products.ts` are
 * provisional. Production App Store billing must not enable until the owner
 * confirms the live App Store Connect identifiers.
 *
 * APP STORE PRODUCT IDS MUST BE CONFIRMED BEFORE PRODUCTION ENABLEMENT.
 */
export const APP_STORE_PRODUCT_IDENTIFIERS_CONFIRMED = false;

export function isAppStoreBillingEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.APPSTORE_BILLING_ENABLED === "true";
}

export function appStoreEnvironmentFromEnv(
  env: NodeJS.ProcessEnv = process.env
): Environment {
  const raw = (env.APPSTORE_ENVIRONMENT ?? "sandbox").trim().toLowerCase();
  if (raw === "" || raw === "sandbox") return Environment.SANDBOX;
  if (raw === "production") return Environment.PRODUCTION;
  throw new BillingError({
    clientCode: "internal_error",
    causeCode: "invalid_appstore_environment",
  });
}

export function appAppleIdFromEnv(
  env: NodeJS.ProcessEnv = process.env
): number | undefined {
  const raw = env.APPSTORE_APP_APPLE_ID;
  if (raw == null || raw === "") return undefined;
  if (!/^[1-9][0-9]{0,17}$/.test(raw)) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "invalid_app_apple_id",
    });
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "invalid_app_apple_id",
    });
  }
  return n;
}
