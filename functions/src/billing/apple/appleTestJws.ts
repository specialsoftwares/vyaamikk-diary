/**
 * Offline JWS signer for VYD-33 tests.
 *
 * Uses the local Vyaamikk test PKI (see official-fixtures/PROVENANCE.md).
 * Signatures are verified by the real Apple SignedDataVerifier.
 */

import { createPrivateKey, createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  AutoRenewStatus,
  Environment,
  InAppOwnershipType,
  NotificationTypeV2,
  Status,
  TransactionReason,
  Type,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  type StatusResponse,
} from "@apple/app-store-server-library";

import { CANONICAL_IOS_BUNDLE_ID } from "./appleConstants";
import { createAppleSignedDataVerifier, type AppleSignedDataVerifier } from "./appleVerifier";

const FIXTURES = join(dirname(__filename), "official-fixtures");
const PKI = join(FIXTURES, "vyaamikk-test-pki");

export const VYAAMIKK_TEST_ROOT_DER = readFileSync(join(PKI, "root.der"));
export const APPLE_OFFICIAL_TEST_CA_DER = readFileSync(join(FIXTURES, "certs", "testCA.der"));

const LEAF_KEY = createPrivateKey(readFileSync(join(PKI, "leaf.p8")));
const X5C = [
  readFileSync(join(PKI, "leaf.der")).toString("base64"),
  readFileSync(join(PKI, "intermediate.der")).toString("base64"),
  readFileSync(join(PKI, "root.der")).toString("base64"),
];

function b64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

export function signAppleJws(payload: Record<string, unknown>): string {
  const header = { alg: "ES256", typ: "JWT", x5c: X5C };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = createSign("SHA256").update(data).sign({
    key: LEAF_KEY,
    dsaEncoding: "ieee-p1363",
  });
  return `${data}.${b64url(sig)}`;
}

export function vyaamikkSandboxVerifier(): AppleSignedDataVerifier {
  return createAppleSignedDataVerifier({
    rootCaDerCerts: [VYAAMIKK_TEST_ROOT_DER],
    environment: Environment.SANDBOX,
    bundleId: CANONICAL_IOS_BUNDLE_ID,
    enableOnlineChecks: false,
  });
}

export const TEST_NOW_MS = Date.UTC(2026, 8, 15, 12, 0, 0);
export const TEST_EXPIRES_MS = TEST_NOW_MS + 30 * 24 * 60 * 60 * 1000;
export const IOS_PRODUCT_PROFESSIONAL_MONTHLY =
  "com.specialsoftwares.vyaamikkdiary.professional.monthly";

export function transactionPayload(
  overrides: Partial<JWSTransactionDecodedPayload> & Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    transactionId: "2001",
    originalTransactionId: "2001",
    bundleId: CANONICAL_IOS_BUNDLE_ID,
    productId: IOS_PRODUCT_PROFESSIONAL_MONTHLY,
    environment: Environment.SANDBOX,
    type: Type.AUTO_RENEWABLE_SUBSCRIPTION,
    inAppOwnershipType: InAppOwnershipType.PURCHASED,
    transactionReason: TransactionReason.PURCHASE,
    purchaseDate: TEST_NOW_MS,
    originalPurchaseDate: TEST_NOW_MS,
    expiresDate: TEST_EXPIRES_MS,
    signedDate: TEST_NOW_MS,
    appAccountToken: "11111111-1111-4111-8111-111111111111",
    currency: "INR",
    price: 249000,
    ...overrides,
  };
}

export function renewalPayload(
  overrides: Partial<JWSRenewalInfoDecodedPayload> & Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    originalTransactionId: "2001",
    productId: IOS_PRODUCT_PROFESSIONAL_MONTHLY,
    autoRenewProductId: IOS_PRODUCT_PROFESSIONAL_MONTHLY,
    autoRenewStatus: AutoRenewStatus.ON,
    environment: Environment.SANDBOX,
    signedDate: TEST_NOW_MS,
    ...overrides,
  };
}

export function notificationPayload(opts: {
  notificationType: NotificationTypeV2 | string;
  signedTransactionInfo?: string;
  notificationUUID?: string;
  signedDate?: number;
  bundleId?: string;
  environment?: string;
}): Record<string, unknown> {
  return {
    notificationType: opts.notificationType,
    notificationUUID: opts.notificationUUID ?? "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    signedDate: opts.signedDate ?? TEST_NOW_MS,
    data: {
      bundleId: opts.bundleId ?? CANONICAL_IOS_BUNDLE_ID,
      environment: opts.environment ?? Environment.SANDBOX,
      appAppleId: 1234,
      ...(opts.signedTransactionInfo
        ? { signedTransactionInfo: opts.signedTransactionInfo }
        : {}),
    },
  };
}

export function statusResponseFor(
  status: Status,
  signedTransactionInfo: string,
  signedRenewalInfo: string,
  originalTransactionId = "2001"
): StatusResponse {
  return {
    environment: Environment.SANDBOX,
    bundleId: CANONICAL_IOS_BUNDLE_ID,
    data: [
      {
        subscriptionGroupIdentifier: "vyd-group",
        lastTransactions: [
          {
            originalTransactionId,
            status,
            signedTransactionInfo,
            signedRenewalInfo,
          },
        ],
      },
    ],
  };
}

export function statusResponseForItems(
  originalTransactionId: string,
  items: Array<{
    status: Status;
    signedTransactionInfo: string;
    signedRenewalInfo: string;
  }>
): StatusResponse {
  return {
    environment: Environment.SANDBOX,
    bundleId: CANONICAL_IOS_BUNDLE_ID,
    data: [
      {
        subscriptionGroupIdentifier: "vyd-group",
        lastTransactions: items.map((item) => ({
          originalTransactionId,
          status: item.status,
          signedTransactionInfo: item.signedTransactionInfo,
          signedRenewalInfo: item.signedRenewalInfo,
        })),
      },
    ],
  };
}

export function readOfficialAppleFixture(name: string): string {
  return readFileSync(join(FIXTURES, "mock_signed_data", name), "utf8").trim();
}
