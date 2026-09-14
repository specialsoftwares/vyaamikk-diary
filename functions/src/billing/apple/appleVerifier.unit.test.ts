/**
 * Official Apple SignedDataVerifier vectors + production constructor gates.
 * Run as part of npm run test:billing-apple
 */
import assert from "node:assert/strict";

import { Environment, SignedDataVerifier, VerificationException, VerificationStatus } from "@apple/app-store-server-library";

import { BillingError } from "../errors";
import { CANONICAL_IOS_BUNDLE_ID } from "./appleConstants";
import { loadAppStoreRuntimeConfig } from "./appleConfig";
import { createAppleSignedDataVerifier } from "./appleVerifier";
import {
  APPLE_OFFICIAL_TEST_CA_DER,
  IOS_PRODUCT_PROFESSIONAL_MONTHLY,
  readOfficialAppleFixture,
  signAppleJws,
  transactionPayload,
  vyaamikkSandboxVerifier,
  VYAAMIKK_TEST_ROOT_DER,
} from "./appleTestJws";

async function officialVerifier(env: Environment, bundleId: string, appAppleId?: number) {
  return new SignedDataVerifier(
    [APPLE_OFFICIAL_TEST_CA_DER],
    false,
    env,
    bundleId,
    appAppleId
  );
}

async function main() {
{
  const verifier = await officialVerifier(Environment.SANDBOX, "com.example", 1234);
  const tx = await verifier.verifyAndDecodeTransaction(readOfficialAppleFixture("transactionInfo"));
  assert.equal(tx.environment, Environment.SANDBOX);
  const renewal = await verifier.verifyAndDecodeRenewalInfo(readOfficialAppleFixture("renewalInfo"));
  assert.equal(renewal.environment, Environment.SANDBOX);
  const notification = await verifier.verifyAndDecodeNotification(
    readOfficialAppleFixture("testNotification")
  );
  assert.equal(notification.notificationType, "TEST");
}

{
  const verifier = await officialVerifier(Environment.SANDBOX, "com.example", 1234);
  await assert.rejects(
    verifier.verifyAndDecodeNotification(readOfficialAppleFixture("missingX5CHeaderClaim")),
    (e: unknown) => e instanceof VerificationException && e.status === VerificationStatus.INVALID_CERTIFICATE
  );
  await assert.rejects(
    verifier.verifyAndDecodeNotification(readOfficialAppleFixture("wrongBundleId")),
    (e: unknown) => e instanceof VerificationException && e.status === VerificationStatus.INVALID_APP_IDENTIFIER
  );
}

{
  const verifier = await officialVerifier(Environment.PRODUCTION, "com.example", 1234);
  await assert.rejects(
    verifier.verifyAndDecodeNotification(readOfficialAppleFixture("testNotification")),
    (e: unknown) => e instanceof VerificationException && e.status === VerificationStatus.INVALID_ENVIRONMENT
  );
}

{
  const verifier = await officialVerifier(Environment.SANDBOX, "com.example.x", 1234);
  await assert.rejects(
    verifier.verifyAndDecodeTransaction(readOfficialAppleFixture("transactionInfo")),
    (e: unknown) => e instanceof VerificationException && e.status === VerificationStatus.INVALID_APP_IDENTIFIER
  );
}

assert.throws(
  () =>
    new SignedDataVerifier(
      [APPLE_OFFICIAL_TEST_CA_DER],
      false,
      Environment.PRODUCTION,
      "com.example"
    ),
  (e: unknown) => e instanceof Error && String(e.message).includes("appAppleId")
);

assert.throws(
  () =>
    createAppleSignedDataVerifier({
      rootCaDerCerts: [VYAAMIKK_TEST_ROOT_DER],
      environment: Environment.PRODUCTION,
      bundleId: CANONICAL_IOS_BUNDLE_ID,
    }),
  (e: unknown) => e instanceof BillingError && e.causeCode === "missing_appstore_app_apple_id"
);

{
  const verifier = vyaamikkSandboxVerifier();
  const decoded = await verifier.verifyAndDecodeTransaction(
    signAppleJws(transactionPayload({ productId: IOS_PRODUCT_PROFESSIONAL_MONTHLY }))
  );
  assert.equal(decoded.bundleId, CANONICAL_IOS_BUNDLE_ID);
  assert.equal(decoded.productId, IOS_PRODUCT_PROFESSIONAL_MONTHLY);
}

{
  const verifier = vyaamikkSandboxVerifier();
  const jws = signAppleJws(transactionPayload());
  const tampered = jws.slice(0, -4) + "abcd";
  await assert.rejects(
    verifier.verifyAndDecodeTransaction(tampered),
    (e: unknown) => e instanceof BillingError && e.causeCode === "apple_jws_verification_failed"
  );
}

{
  const verifier = vyaamikkSandboxVerifier();
  await assert.rejects(
    verifier.verifyAndDecodeTransaction(
      signAppleJws(transactionPayload({ bundleId: "com.example.wrong" }))
    ),
    (e: unknown) => e instanceof BillingError && e.causeCode === "apple_app_identifier_mismatch"
  );
}

{
  const production = createAppleSignedDataVerifier({
    rootCaDerCerts: [VYAAMIKK_TEST_ROOT_DER],
    environment: Environment.PRODUCTION,
    bundleId: CANONICAL_IOS_BUNDLE_ID,
    appAppleId: 99,
    enableOnlineChecks: false,
  });
  await assert.rejects(
    production.verifyAndDecodeTransaction(signAppleJws(transactionPayload())),
    (e: unknown) => e instanceof BillingError && e.causeCode === "apple_environment_mismatch"
  );
}

assert.throws(
  () =>
    loadAppStoreRuntimeConfig({
      APPSTORE_BILLING_ENABLED: "true",
      APPSTORE_ENVIRONMENT: "sandbox",
      APPSTORE_ISSUER_ID: "iss",
      APPSTORE_KEY_ID: "key",
      APPSTORE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nM\n-----END PRIVATE KEY-----",
      APPSTORE_ROOT_CA_CERTS_BASE64: Buffer.alloc(80).toString("base64"),
    }),
  (e: unknown) => e instanceof BillingError && e.causeCode === "appstore_financial_authority_unimplemented"
);

assert.throws(
  () =>
    loadAppStoreRuntimeConfig({
      APPSTORE_ENVIRONMENT: "production",
      APPSTORE_ISSUER_ID: "iss",
      APPSTORE_KEY_ID: "key",
      APPSTORE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nM\n-----END PRIVATE KEY-----",
      APPSTORE_ROOT_CA_CERTS_BASE64: Buffer.alloc(80).toString("base64"),
      APPSTORE_APP_APPLE_ID: "1234",
    }),
  (e: unknown) => e instanceof BillingError && e.causeCode === "appstore_product_ids_unconfirmed"
);

console.log("appleVerifier.unit.test.ts: ok");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
