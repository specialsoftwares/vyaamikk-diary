/**
 * Load App Store Server API / SignedDataVerifier configuration from env.
 *
 * Secrets (APPSTORE_PRIVATE_KEY, root CA material) are never logged or
 * returned. Production environment fails closed until product identifiers
 * are confirmed and every required field is present.
 */

import { Environment } from "@apple/app-store-server-library";

import { BillingError } from "../errors";
import {
  APP_STORE_ENABLE_ONLINE_CERTIFICATE_CHECKS,
  APP_STORE_PRODUCT_IDENTIFIERS_CONFIRMED,
  appAppleIdFromEnv,
  appStoreEnvironmentFromEnv,
  assertAppStoreLiveBillingAllowed,
  CANONICAL_IOS_BUNDLE_ID,
  isAppStoreBillingEnabled,
} from "./appleConstants";

export interface AppStoreRuntimeConfig {
  bundleId: typeof CANONICAL_IOS_BUNDLE_ID;
  environment: Environment;
  issuerId: string;
  keyId: string;
  privateKeyPem: string;
  rootCaDerCerts: Buffer[];
  appAppleId?: number;
  /**
   * Official SignedDataVerifier online certificate checks (OCSP).
   * Compile-time default is false. CI must stay false. Production go-live
   * must decide explicitly; this field is not flipped by env in VYD-33.
   */
  enableOnlineChecks: boolean;
}

function failClosed(causeCode: string): never {
  throw new BillingError({
    clientCode: "internal_error",
    causeCode,
  });
}

function nonEmpty(env: NodeJS.ProcessEnv, key: string): string {
  const raw = env[key];
  if (typeof raw !== "string" || raw.trim() === "") failClosed(`missing_${key.toLowerCase()}`);
  return raw.trim();
}

/**
 * APPSTORE_ROOT_CA_CERTS_BASE64: JSON array of base64 DER certificates, or a
 * single base64 DER blob. Never a URL — CI must not fetch Apple PKI.
 */
export function parseAppStoreRootCaCerts(raw: string | undefined): Buffer[] {
  if (typeof raw !== "string" || raw.trim() === "") {
    failClosed("missing_appstore_root_ca_certs");
  }
  const trimmed = raw.trim();
  let parts: string[];
  if (trimmed.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      failClosed("invalid_appstore_root_ca_certs");
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      failClosed("invalid_appstore_root_ca_certs");
    }
    parts = parsed.map((item) => {
      if (typeof item !== "string" || item.trim() === "") {
        failClosed("invalid_appstore_root_ca_certs");
      }
      return item.trim();
    });
  } else {
    parts = trimmed.split(/[\s,]+/).filter((s) => s.length > 0);
  }
  const certs = parts.map((b64) => {
    if (!/^[A-Za-z0-9+/]+=*$/.test(b64) && !/^[A-Za-z0-9_-]+=*$/.test(b64)) {
      failClosed("invalid_appstore_root_ca_certs");
    }
    const buf = Buffer.from(b64, "base64");
    if (buf.length < 64) failClosed("invalid_appstore_root_ca_certs");
    return buf;
  });
  if (certs.length === 0) failClosed("invalid_appstore_root_ca_certs");
  return certs;
}

function normalizePrivateKeyPem(raw: string): string {
  const pem = raw.replace(/\\n/g, "\n").trim();
  if (!pem.includes("BEGIN") || !pem.includes("PRIVATE KEY")) {
    failClosed("invalid_appstore_private_key");
  }
  return pem;
}

/**
 * Full runtime config required to talk to Apple (sandbox or production).
 * Production additionally requires a numeric appAppleId and confirmed
 * product identifiers.
 *
 * APPSTORE_BILLING_ENABLED=true cannot load live deps while financial-report
 * authority is unimplemented — even if product identifiers were confirmed.
 */
export function loadAppStoreRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env
): AppStoreRuntimeConfig {
  if (isAppStoreBillingEnabled(env)) {
    assertAppStoreLiveBillingAllowed();
  }
  const environment = appStoreEnvironmentFromEnv(env);
  if (environment === Environment.PRODUCTION && !APP_STORE_PRODUCT_IDENTIFIERS_CONFIRMED) {
    failClosed("appstore_product_ids_unconfirmed");
  }
  const issuerId = nonEmpty(env, "APPSTORE_ISSUER_ID");
  const keyId = nonEmpty(env, "APPSTORE_KEY_ID");
  const privateKeyPem = normalizePrivateKeyPem(nonEmpty(env, "APPSTORE_PRIVATE_KEY"));
  const rootCaDerCerts = parseAppStoreRootCaCerts(env.APPSTORE_ROOT_CA_CERTS_BASE64);
  const appAppleId = appAppleIdFromEnv(env);
  if (environment === Environment.PRODUCTION) {
    if (appAppleId == null) failClosed("missing_appstore_app_apple_id");
  }
  return {
    bundleId: CANONICAL_IOS_BUNDLE_ID,
    environment,
    issuerId,
    keyId,
    privateKeyPem,
    rootCaDerCerts,
    appAppleId,
    enableOnlineChecks: APP_STORE_ENABLE_ONLINE_CERTIFICATE_CHECKS,
  };
}
