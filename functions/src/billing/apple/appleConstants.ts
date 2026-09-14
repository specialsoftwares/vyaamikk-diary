/**
 * Canonical iOS App Store identifiers + production-enablement gates (VYD-33).
 *
 * APPSTORE_BILLING_ENABLED defaults OFF. Product identifiers in the Phase A
 * catalog remain provisional until App Store Connect confirmation — a
 * production go-live gate, not something this phase flips.
 *
 * Confirming product identifiers alone MUST NOT make Apple billing live.
 * App Store Connect financial/accounting reporting authority is a second
 * hard gate: Apple JWS price/currency is verified store-transaction metadata,
 * not Vyaamikk's revenue / GST source of record.
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

/**
 * HARD GO-LIVE GATE. Apple documents JWSTransactionDecodedPayload.price /
 * currency as not for revenue reconciliation or recognition. App Store
 * Connect financial reporting is the accounting source of record.
 *
 * This phase does not implement that reporting path. Flipping
 * APPSTORE_BILLING_ENABLED=true while this remains false fails closed:
 * `appstore_financial_authority_unimplemented`.
 *
 * VYD-40 Apple tax-document posting must not be production-enabled until
 * this gate is true.
 */
export const APP_STORE_FINANCIAL_REPORTING_AUTHORITY_IMPLEMENTED = false;

/**
 * SignedDataVerifier `enableOnlineChecks` (OCSP / network certificate
 * status). Default and CI: false. Turning this on is an explicit production
 * security/availability decision at go-live, not a VYD-33 CI requirement.
 */
export const APP_STORE_ENABLE_ONLINE_CERTIFICATE_CHECKS = false;

export function isAppStoreBillingEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.APPSTORE_BILLING_ENABLED === "true";
}

/**
 * Mechanical production enablement lock. APPSTORE_BILLING_ENABLED=true must
 * not construct live Apple deps while financial-report authority is absent.
 * Product-id confirmation is a separate required gate.
 */
export function assertAppStoreLiveBillingAllowed(): void {
  if (!APP_STORE_FINANCIAL_REPORTING_AUTHORITY_IMPLEMENTED) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "appstore_financial_authority_unimplemented",
    });
  }
  if (!APP_STORE_PRODUCT_IDENTIFIERS_CONFIRMED) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "appstore_product_ids_unconfirmed",
    });
  }
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
