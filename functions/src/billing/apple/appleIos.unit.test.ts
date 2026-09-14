/**
 * VYD-33 App Store backend adapter test matrix.
 * Run: npm run test:billing-apple
 */
import assert from "node:assert/strict";

import {
  AutoRenewStatus,
  InAppOwnershipType,
  NotificationTypeV2,
  RevocationType,
  Status,
  TransactionReason,
  Type,
} from "@apple/app-store-server-library";

import { handleAppStoreServerNotificationsV2Http } from "../callables/appStoreServerNotificationsV2";
import { handlePrepareIOSBillingAccount } from "../callables/prepareIOSBillingAccount";
import { handleValidateAndActivateIOS } from "../callables/validateAndActivateIOS";
import { diagnosticUidHmac } from "../diagnosticUid";
import { BillingError } from "../errors";
import {
  appStoreAccountByUidPath,
  appStoreAccountIndexPath,
  billingReconciliationQueuePath,
  companyBillingPath,
  financialLedgerPath,
  sanitizeDocId,
  subscriptionStatusPath,
} from "../paths";
import { ALL_CANONICAL_SKUS, SUBSCRIPTION_CATALOG, canonicalSkuForIos } from "../products";
import { MemoryBillingStore } from "../store";
import type { BillingEventLedgerDoc, BillingReconciliationQueueDoc, CompanyBillingDoc } from "../types";
import { applySubscriptionTransition } from "../applyTransition";
import { financialEventIdForStore, oppositeIosPurchaseRenewalFinancialEventId } from "../transition";
import type { AppleSubscriptionApi } from "./appleApiClient";
import { CANONICAL_IOS_BUNDLE_ID } from "./appleConstants";
import {
  processIosNotification,
  processIosSignedTransaction,
  type IosBillingDeps,
  type PostCommitTaxHandoff,
} from "./appleSubscriptionAdapter";
import {
  IOS_PRODUCT_PROFESSIONAL_MONTHLY,
  notificationPayload,
  renewalPayload,
  signAppleJws,
  statusResponseFor,
  TEST_EXPIRES_MS,
  TEST_NOW_MS,
  transactionPayload,
  vyaamikkSandboxVerifier,
} from "./appleTestJws";

const SECRET = "unit-test-only-billing-diag-uid-secret-ios-0001";
const UID = "uid-ios-alice";
const OTHER = "uid-ios-bob";
const PRODUCT = IOS_PRODUCT_PROFESSIONAL_MONTHLY;
const ORIG = "2001";

function isCause(code: string) {
  return (e: unknown) => e instanceof BillingError && e.causeCode === code;
}

class FakeAppleApi implements AppleSubscriptionApi {
  fail: BillingError | null = null;
  calls = 0;
  constructor(public statuses: ReturnType<typeof statusResponseFor>) {}
  async getAllSubscriptionStatuses() {
    this.calls += 1;
    if (this.fail) throw this.fail;
    return this.statuses;
  }
}

async function seedAccount(store: MemoryBillingStore, uid = UID) {
  return handlePrepareIOSBillingAccount(store, uid, TEST_NOW_MS);
}

function depsFor(
  store: MemoryBillingStore,
  api: FakeAppleApi,
  tax?: PostCommitTaxHandoff
): IosBillingDeps {
  return {
    store,
    verifier: vyaamikkSandboxVerifier(),
    api,
    diagnosticUidFor: (uid) => diagnosticUidHmac(SECRET, uid),
    nowMs: () => TEST_NOW_MS,
    postCommitTaxHandoff: tax,
  };
}

function currentPair(opts: {
  token: string;
  status?: Status;
  autoRenew?: AutoRenewStatus;
  reason?: TransactionReason;
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
  price?: number;
  currency?: string;
  purchaseDate?: number;
  expiresDate?: number;
  signedDate?: number;
  ownership?: InAppOwnershipType;
  type?: Type;
  revocationType?: RevocationType;
  revocationDate?: number;
  revocationPercentage?: number;
  autoRenewProductId?: string;
}) {
  const originalTransactionId = opts.originalTransactionId ?? ORIG;
  const transactionId = opts.transactionId ?? ORIG;
  const tx = signAppleJws(
    transactionPayload({
      appAccountToken: opts.token,
      transactionId,
      originalTransactionId,
      productId: opts.productId ?? PRODUCT,
      transactionReason: opts.reason ?? TransactionReason.PURCHASE,
      price: opts.price ?? 249000,
      currency: opts.currency ?? "INR",
      purchaseDate: opts.purchaseDate ?? TEST_NOW_MS,
      expiresDate: opts.expiresDate ?? TEST_EXPIRES_MS,
      signedDate: opts.signedDate ?? TEST_NOW_MS,
      inAppOwnershipType: opts.ownership ?? InAppOwnershipType.PURCHASED,
      type: opts.type ?? Type.AUTO_RENEWABLE_SUBSCRIPTION,
      ...(opts.revocationType ? { revocationType: opts.revocationType } : {}),
      ...(opts.revocationDate != null ? { revocationDate: opts.revocationDate } : {}),
      ...(opts.revocationPercentage != null
        ? { revocationPercentage: opts.revocationPercentage }
        : {}),
    })
  );
  const renewal = signAppleJws(
    renewalPayload({
      originalTransactionId,
      productId: opts.productId ?? PRODUCT,
      autoRenewProductId: opts.autoRenewProductId ?? opts.productId ?? PRODUCT,
      autoRenewStatus: opts.autoRenew ?? AutoRenewStatus.ON,
      signedDate: opts.signedDate ?? TEST_NOW_MS,
      appAccountToken: opts.token,
    })
  );
  return {
    tx,
    renewal,
    statuses: statusResponseFor(
      opts.status ?? Status.ACTIVE,
      tx,
      renewal,
      originalTransactionId
    ),
  };
}

function storeBlob(store: MemoryBillingStore): string {
  return JSON.stringify([...store.docs.entries()]);
}

function assertNoSecrets(store: MemoryBillingStore, extra?: string) {
  const blob = storeBlob(store) + (extra ?? "");
  assert.equal(blob.includes("signedTransactionInfo"), false);
  assert.equal(blob.includes("signedRenewalInfo"), false);
  assert.equal(blob.includes("signedPayload"), false);
  assert.equal(blob.includes("BEGIN PRIVATE"), false);
  assert.equal(blob.includes("APPSTORE_PRIVATE_KEY"), false);
}

function ledger(store: MemoryBillingStore, id: string): BillingEventLedgerDoc | undefined {
  return store.docs.get(financialLedgerPath(sanitizeDocId(id))) as BillingEventLedgerDoc | undefined;
}

function historyCount(store: MemoryBillingStore, uid = UID): number {
  const prefix = `users/${uid}/subscriptionBillingHistory/`;
  return [...store.docs.keys()].filter((k) => k.startsWith(prefix)).length;
}

async function primed(statusOpts: Parameters<typeof currentPair>[0] = {}) {
  const store = new MemoryBillingStore();
  const { appAccountToken } = await seedAccount(store);
  const pair = currentPair({ ...statusOpts, token: appAccountToken });
  const api = new FakeAppleApi(pair.statuses);
  const taxEvents: string[] = [];
  const deps = depsFor(store, api, async (input) => {
    taxEvents.push(input.eventType);
  });
  return { store, api, deps, token: appAccountToken, pair, taxEvents };
}

async function main() {
for (const sku of ALL_CANONICAL_SKUS) {
  assert.equal(canonicalSkuForIos(SUBSCRIPTION_CATALOG[sku].ios.productId), sku);
}
assert.equal(canonicalSkuForIos("com.specialsoftwares.vyaamikkdiary.unknown.monthly"), null);

{
  const store = new MemoryBillingStore();
  const first = await handlePrepareIOSBillingAccount(store, UID, TEST_NOW_MS);
  const second = await handlePrepareIOSBillingAccount(store, UID, TEST_NOW_MS + 1000);
  assert.equal(first.appAccountToken, second.appAccountToken);
  assert.equal(store.docs.has(appStoreAccountByUidPath(UID)), true);
  assert.equal(store.docs.has(appStoreAccountIndexPath(first.appAccountToken)), true);
}

{
  const store = new MemoryBillingStore();
  const { appAccountToken } = await handlePrepareIOSBillingAccount(store, UID, TEST_NOW_MS);
  store.docs.set(appStoreAccountByUidPath(OTHER), {
    appAccountToken,
    createdAt: TEST_NOW_MS,
    updatedAt: TEST_NOW_MS,
  });
  await assert.rejects(
    handlePrepareIOSBillingAccount(store, OTHER, TEST_NOW_MS),
    isCause("ios_account_index_collision")
  );
}

{
  const { store, deps, pair } = await primed({ price: 1370 });
  const result = await handleValidateAndActivateIOS(deps, {
    uid: UID,
    signedTransactionInfo: pair.tx,
    expectedCanonicalSku: "vyd_starter_monthly",
  });
  assert.equal(result.canonicalSku, "vyd_professional_monthly");
  assert.equal(result.to?.billingStatus, "active");
  assert.equal(result.to?.entitlementActive, true);
  assert.equal(result.to?.autoRenewing, true);
  const sale = ledger(
    store,
    financialEventIdForStore({ platform: "ios", eventType: "purchase", transactionId: ORIG })
  );
  assert.equal(sale?.grossAmountInPaise, 137);
  assert.equal(sale?.occurredAt, TEST_NOW_MS);
  assert.equal(sale?.actualPlatformCommissionInPaise, null);
  assert.notEqual(sale?.grossAmountInPaise, SUBSCRIPTION_CATALOG.vyd_professional_monthly.expectedPriceInPaise);
  const company = store.docs.get(companyBillingPath(UID)) as CompanyBillingDoc;
  assert.equal(company.originalTransactionId, ORIG);
  assert.equal(company.encryptedPurchaseCredential, null);
  assertNoSecrets(store, pair.tx);
}

{
  const { deps } = await primed();
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: "not-a-jws" }),
    isCause("invalid_signed_transaction_info")
  );
}

{
  const { deps, pair } = await primed({ ownership: InAppOwnershipType.FAMILY_SHARED });
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx }),
    isCause("ios_family_sharing_not_supported")
  );
}

{
  const { deps } = await primed();
  const tx = signAppleJws(transactionPayload({ appAccountToken: undefined, productId: PRODUCT }));
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: tx }),
    isCause("missing_ios_app_account_token")
  );
}

{
  const store = new MemoryBillingStore();
  const { appAccountToken } = await seedAccount(store);
  await seedAccount(store, OTHER);
  const pair = currentPair({ token: appAccountToken });
  const api = new FakeAppleApi(pair.statuses);
  const deps = depsFor(store, api);
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: OTHER, signedTransactionInfo: pair.tx }),
    isCause("ios_account_owner_mismatch")
  );
}

{
  const { deps } = await primed();
  const tx = signAppleJws(
    transactionPayload({ productId: "com.specialsoftwares.vyaamikkdiary.unknown.monthly" })
  );
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: tx }),
    isCause("unknown_ios_product")
  );
}

{
  const { deps } = await primed();
  const tx = signAppleJws(transactionPayload({ type: Type.CONSUMABLE }));
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: tx }),
    isCause("ios_product_type_not_auto_renewable")
  );
}

{
  const { store, deps, pair } = await primed({ reason: TransactionReason.RENEWAL, transactionId: "3001" });
  const result = await processIosSignedTransaction(deps, {
    signedTransactionInfo: pair.tx,
    callerUid: UID,
    source: "iosValidation",
    eventSource: "callable",
  });
  assert.equal(result.to?.billingStatus, "active");
  assert.ok(ledger(store, "ios:renewal:3001"));
  assert.equal(ledger(store, "ios:purchase:3001"), undefined);
}

{
  const { deps, pair, token } = await primed();
  const bad = signAppleJws(
    transactionPayload({ transactionReason: undefined, appAccountToken: token })
  );
  const api = deps.api as FakeAppleApi;
  api.statuses = statusResponseFor(Status.ACTIVE, bad, pair.renewal);
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: bad }),
    isCause("unknown_ios_transaction_reason")
  );
}

{
  const store = new MemoryBillingStore();
  await applySubscriptionTransition(
    { store, diagnosticUid: "diag" },
    {
      uid: UID,
      source: "iosValidation",
      eventSource: "callable",
      idempotencyKey: "ios:purchase:mutex-1",
      occurredAt: TEST_NOW_MS,
      nowMs: TEST_NOW_MS,
      requested: {
        kind: "activatePaid",
        plan: "professional",
        platformEvent: {
          platform: "ios",
          canonicalSku: "vyd_professional_monthly",
          productId: PRODUCT,
          basePlanId: null,
          currentPeriodStart: TEST_NOW_MS,
          currentPeriodEnd: TEST_EXPIRES_MS,
          autoRenewing: true,
          latestOrderId: "mutex-1",
          originalTransactionId: "mutex-1",
          credentialFingerprint: null,
          encryptedPurchaseCredential: null,
          reconciledAt: TEST_NOW_MS,
        },
        financialEvent: {
          financialEventId: "ios:purchase:mutex-1",
          eventType: "purchase",
          platform: "ios",
          canonicalSku: "vyd_professional_monthly",
          grossAmountInPaise: 100,
          actualPlatformCommissionInPaise: null,
          estimatedPlatformCommissionInPaise: null,
          occurredAt: TEST_NOW_MS,
          relatedFinancialEventId: null,
        },
      },
    }
  );
  assert.equal(
    oppositeIosPurchaseRenewalFinancialEventId("ios:purchase:mutex-1", "purchase", "ios"),
    "ios:renewal:mutex-1"
  );
  await assert.rejects(
    applySubscriptionTransition(
      { store, diagnosticUid: "diag" },
      {
        uid: UID,
        source: "iosValidation",
        eventSource: "callable",
        idempotencyKey: "ios:renewal:mutex-1",
        occurredAt: TEST_NOW_MS,
        nowMs: TEST_NOW_MS + 1,
        requested: {
          kind: "renew",
          plan: "professional",
          platformEvent: {
            platform: "ios",
            canonicalSku: "vyd_professional_monthly",
            productId: PRODUCT,
            basePlanId: null,
            currentPeriodStart: TEST_NOW_MS,
            currentPeriodEnd: TEST_EXPIRES_MS,
            autoRenewing: true,
            latestOrderId: "mutex-1",
            originalTransactionId: "mutex-1",
            credentialFingerprint: null,
            encryptedPurchaseCredential: null,
            reconciledAt: TEST_NOW_MS + 1,
          },
          financialEvent: {
            financialEventId: "ios:renewal:mutex-1",
            eventType: "renewal",
            platform: "ios",
            canonicalSku: "vyd_professional_monthly",
            grossAmountInPaise: 100,
            actualPlatformCommissionInPaise: null,
            estimatedPlatformCommissionInPaise: null,
            occurredAt: TEST_NOW_MS,
            relatedFinancialEventId: null,
          },
        },
      }
    ),
    isCause("purchase_renewal_classification_conflict")
  );
}

{
  const { store, deps, pair } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  const again = await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  assert.equal(again.alreadyProcessed, true);
  assert.equal(ledger(store, "ios:purchase:2001")?.grossAmountInPaise, 24_900);
}

{
  const { store, deps, pair } = await primed({ price: 1010 });
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  assert.equal(ledger(store, "ios:purchase:2001")?.grossAmountInPaise, 101);
}

{
  const { deps, pair } = await primed({ currency: "USD" });
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx }),
    isCause("non_inr_apple_price")
  );
}

{
  const { deps, pair } = await primed({ price: 1001 });
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx }),
    isCause("fractional_sub_paise")
  );
}

{
  const { deps, pair } = await primed({ price: -10 });
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx }),
    isCause("negative_apple_price")
  );
}

{
  const { deps, pair } = await primed({ autoRenew: AutoRenewStatus.OFF });
  const result = await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  assert.equal(result.to?.billingStatus, "cancelled");
  assert.equal(result.to?.entitlementActive, true);
  assert.equal(result.to?.cancelledAt, TEST_NOW_MS);
  assert.notEqual(result.to?.cancelledAt, TEST_EXPIRES_MS);
}

{
  const { deps, pair } = await primed({
    status: Status.BILLING_GRACE_PERIOD,
    autoRenew: AutoRenewStatus.ON,
  });
  const result = await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  assert.equal(result.to?.billingStatus, "grace");
  assert.equal(result.to?.entitlementActive, true);
}

{
  const { deps, pair } = await primed({ status: Status.BILLING_RETRY });
  const result = await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  assert.equal(result.to?.billingStatus, "onHold");
  assert.equal(result.to?.entitlementActive, false);
}

{
  const { deps, pair } = await primed({ status: Status.EXPIRED });
  const result = await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  assert.equal(result.to?.billingStatus, "expired");
  assert.equal(result.to?.entitlementActive, false);
}

{
  const { deps, pair } = await primed({ status: Status.REVOKED });
  const result = await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  assert.equal(result.to?.billingStatus, "expired");
  assert.equal(result.to?.entitlementActive, false);
}

{
  const store = new MemoryBillingStore();
  const { appAccountToken } = await seedAccount(store);
  const pair = currentPair({ token: appAccountToken, status: 99 as Status });
  const deps = depsFor(store, new FakeAppleApi(pair.statuses));
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx }),
    isCause("unknown_ios_subscription_status")
  );
}

{
  const { store, deps, pair } = await primed({
    status: Status.BILLING_RETRY,
    reason: TransactionReason.RENEWAL,
    transactionId: "3001",
  });
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  assert.ok(ledger(store, "ios:renewal:3001"));
  assert.equal(store.docs.get(subscriptionStatusPath(UID))?.billingStatus, "onHold");
}

{
  const { deps, token } = await primed();
  const first = currentPair({ token });
  (deps.api as FakeAppleApi).statuses = first.statuses;
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: first.tx });
  const cancel = currentPair({ token, autoRenew: AutoRenewStatus.OFF, signedDate: TEST_NOW_MS + 1 });
  (deps.api as FakeAppleApi).statuses = cancel.statuses;
  await assert.rejects(
    handleValidateAndActivateIOS(
      { ...deps, nowMs: () => TEST_NOW_MS - 10_000 },
      { uid: UID, signedTransactionInfo: cancel.tx }
    ),
    isCause("stale_platform_state")
  );
}

{
  const { store, deps, pair, token } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  const histories = historyCount(store);
  const assn = signAppleJws(
    notificationPayload({
      notificationType: NotificationTypeV2.DID_RENEW,
      signedTransactionInfo: pair.tx,
    })
  );
  const second = await processIosNotification(deps, assn);
  assert.equal(second.to?.billingStatus, "active");
  assert.equal(historyCount(store), histories);
  const third = await processIosNotification(deps, assn);
  assert.equal(historyCount(store), histories);
  void token;
}

{
  const { store, deps, pair, token } = await primed({ autoRenew: AutoRenewStatus.OFF, signedDate: TEST_NOW_MS });
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  assert.equal(store.docs.get(subscriptionStatusPath(UID))?.billingStatus, "cancelled");
  const restart = currentPair({
    token,
    autoRenew: AutoRenewStatus.ON,
    signedDate: TEST_NOW_MS + 1000,
  });
  (deps.api as FakeAppleApi).statuses = restart.statuses;
  await handleValidateAndActivateIOS(
    { ...deps, nowMs: () => TEST_NOW_MS + 1000 },
    { uid: UID, signedTransactionInfo: restart.tx }
  );
  assert.equal(store.docs.get(subscriptionStatusPath(UID))?.billingStatus, "active");
  const cancelAgain = currentPair({
    token,
    autoRenew: AutoRenewStatus.OFF,
    signedDate: TEST_NOW_MS + 2000,
  });
  (deps.api as FakeAppleApi).statuses = cancelAgain.statuses;
  await handleValidateAndActivateIOS(
    { ...deps, nowMs: () => TEST_NOW_MS + 2000 },
    { uid: UID, signedTransactionInfo: cancelAgain.tx }
  );
  assert.equal(store.docs.get(subscriptionStatusPath(UID))?.billingStatus, "cancelled");
}

{
  const { deps } = await primed();
  await assert.rejects(
    handleAppStoreServerNotificationsV2Http({
      body: { signedPayload: "abc" },
      deps,
      appStoreBillingEnabled: true,
    }),
    isCause("invalid_signed_payload")
  );
}

{
  const { deps, pair } = await primed();
  const wrong = signAppleJws(
    notificationPayload({
      notificationType: NotificationTypeV2.TEST,
      bundleId: "com.example.wrong",
    })
  );
  await assert.rejects(processIosNotification(deps, wrong), isCause("apple_app_identifier_mismatch"));
  void pair;
}

{
  const { deps, api } = await primed();
  const testN = signAppleJws(notificationPayload({ notificationType: NotificationTypeV2.TEST }));
  const http = await handleAppStoreServerNotificationsV2Http({
    body: { signedPayload: testN },
    deps,
    appStoreBillingEnabled: true,
  });
  assert.equal(http.status, 200);
  assert.equal(http.body.action, "test_ignored");
  assert.equal(api.calls, 0);
}

{
  const { store, deps, pair, token } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  const refundTx = signAppleJws(
    transactionPayload({
      appAccountToken: token,
      transactionId: ORIG,
      originalTransactionId: ORIG,
      transactionReason: TransactionReason.PURCHASE,
      revocationType: RevocationType.REFUND_FULL,
      revocationDate: TEST_NOW_MS + 5000,
      revocationPercentage: 100_000,
      purchaseDate: TEST_NOW_MS,
    })
  );
  const currentStillActive = currentPair({
    token,
    transactionId: "3001",
    originalTransactionId: ORIG,
    reason: TransactionReason.RENEWAL,
    purchaseDate: TEST_NOW_MS + 1000,
    signedDate: TEST_NOW_MS + 1000,
  });
  (deps.api as FakeAppleApi).statuses = currentStillActive.statuses;
  const notif = signAppleJws(
    notificationPayload({
      notificationType: NotificationTypeV2.REFUND,
      signedTransactionInfo: refundTx,
    })
  );
  const result = await processIosNotification(
    { ...deps, nowMs: () => TEST_NOW_MS + 5000 },
    notif
  );
  const refund = ledger(store, "ios:refund:2001");
  assert.equal(refund?.relatedFinancialEventId, "ios:purchase:2001");
  assert.equal(refund?.grossAmountInPaise, 24_900);
  assert.equal(refund?.occurredAt, TEST_NOW_MS + 5000);
  assert.notEqual(refund?.occurredAt, TEST_NOW_MS);
  assert.equal(result.to?.entitlementActive, true);
  assert.equal(result.to?.billingStatus, "active");
  const dup = await processIosNotification({ ...deps, nowMs: () => TEST_NOW_MS + 6000 }, notif);
  assert.equal(dup.financialEventWritten, false);
}

{
  const { store, deps, pair, token } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  const prorated = signAppleJws(
    transactionPayload({
      appAccountToken: token,
      revocationType: RevocationType.REFUND_PRORATED,
      revocationDate: TEST_NOW_MS + 1,
    })
  );
  const notif = signAppleJws(
    notificationPayload({
      notificationType: NotificationTypeV2.REFUND,
      signedTransactionInfo: prorated,
    })
  );
  await assert.rejects(processIosNotification(deps, notif), isCause("unsupported_ios_prorated_refund"));
  assert.equal(ledger(store, "ios:refund:2001"), undefined);
}

{
  const { store, deps, pair, token } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  const family = signAppleJws(
    transactionPayload({
      appAccountToken: token,
      inAppOwnershipType: InAppOwnershipType.PURCHASED,
      revocationType: RevocationType.FAMILY_REVOKE,
      revocationDate: TEST_NOW_MS + 1,
    })
  );
  const notif = signAppleJws(
    notificationPayload({
      notificationType: NotificationTypeV2.REFUND,
      signedTransactionInfo: family,
    })
  );
  await processIosNotification(deps, notif);
  assert.equal(ledger(store, "ios:refund:2001"), undefined);
}

{
  const { store, deps, pair, token } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  const nested = signAppleJws(transactionPayload({ appAccountToken: token }));
  const notif = signAppleJws(
    notificationPayload({
      notificationType: NotificationTypeV2.REFUND_REVERSED,
      signedTransactionInfo: nested,
    })
  );
  const result = await processIosNotification(deps, notif);
  assert.equal(result.action, "refund_reversal_review");
  assert.ok(ledger(store, "ios:purchase:2001"));
  assert.equal(ledger(store, "ios:refund:2001"), undefined);
  const q = [...store.docs.entries()].find(([k]) => k.includes("refund-reversed"));
  assert.ok(q);
}

{
  const { store, deps, api, pair } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  api.fail = new BillingError({
    clientCode: "temporary_unavailable",
    causeCode: "apple_api_temporary_unavailable",
    retryable: true,
  });
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx }),
    isCause("apple_api_temporary_unavailable")
  );
  const qid = billingReconciliationQueuePath(`ios:status-reconcile:${ORIG}`);
  const queued = store.docs.get(qid) as BillingReconciliationQueueDoc | undefined;
  assert.equal(queued?.status, "pending");
  assert.equal(queued?.platform, "ios");
  api.fail = null;
  await handleValidateAndActivateIOS(
    { ...deps, nowMs: () => TEST_NOW_MS + 50 },
    { uid: UID, signedTransactionInfo: pair.tx }
  );
  assert.equal((store.docs.get(qid) as BillingReconciliationQueueDoc).status, "resolved");
}

{
  const { deps, pair } = await primed({
    autoRenewProductId: "com.specialsoftwares.vyaamikkdiary.business.monthly",
  });
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx }),
    isCause("unsupported_ios_scheduled_plan_change")
  );
}

{
  const { store, deps, pair } = await primed();
  for (let i = 0; i < 5; i += 1) {
    await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  }
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx }),
    isCause("purchaseValidation_rate_limited")
  );
  assertNoSecrets(store);
}

{
  const { deps } = await primed();
  await assert.rejects(
    handleAppStoreServerNotificationsV2Http({
      body: { signedPayload: "x" },
      deps,
      appStoreBillingEnabled: false,
    }),
    isCause("appstore_billing_disabled")
  );
}

assert.equal(CANONICAL_IOS_BUNDLE_ID, "com.specialsoftwares.vyaamikkdiary");

console.log("appleIos.unit.test.ts: ok");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
