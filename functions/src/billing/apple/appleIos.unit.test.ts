/**
 * VYD-33 App Store backend adapter test matrix.
 * Run: npm run test:billing-apple
 */
import assert from "node:assert/strict";

import {
  AutoRenewStatus,
  BillingPlanType,
  Environment,
  InAppOwnershipType,
  NotificationTypeV2,
  OfferDiscountType,
  OfferType,
  RenewalBillingPlanType,
  RevocationType,
  Status,
  Subtype,
  TransactionReason,
  Type,
} from "@apple/app-store-server-library";

import { handleAppStoreServerNotificationsV2Http } from "../callables/appStoreServerNotificationsV2";
import { handlePrepareIOSBillingAccount } from "../callables/prepareIOSBillingAccount";
import { handleValidateAndActivateIOS } from "../callables/validateAndActivateIOS";
import { diagnosticUidHmac } from "../diagnosticUid";
import { BillingError } from "../errors";
import { assnHttpStatusForError } from "../google/billingHttps";
import {
  appStoreAccountByUidPath,
  appStoreAccountIndexPath,
  appStoreFinancialReviewPath,
  billingReconciliationQueuePath,
  companyBillingPath,
  financialLedgerPath,
  sanitizeDocId,
  subscriptionStatusPath,
} from "../paths";
import { ALL_CANONICAL_SKUS, SUBSCRIPTION_CATALOG, canonicalSkuForIos } from "../products";
import { MemoryBillingStore } from "../store";
import {
  IOS_CALLABLE_RECONCILIATION_INCIDENT,
  iosStatusReconciliationQueueId,
  type IosStatusReconciliationIncident,
} from "../reconciliationQueue";
import type {
  BillingEventLedgerDoc,
  BillingReconciliationQueueDoc,
  CompanyBillingDoc,
  AppStoreFinancialReviewDoc,
} from "../types";
import { applySubscriptionTransition } from "../applyTransition";
import { financialEventIdForStore, oppositeIosPurchaseRenewalFinancialEventId } from "../transition";
import type { AppleSubscriptionApi } from "./appleApiClient";
import { loadAppStoreRuntimeConfig } from "./appleConfig";
import {
  APP_STORE_ENABLE_ONLINE_CERTIFICATE_CHECKS,
  APP_STORE_FINANCIAL_REPORTING_AUTHORITY_IMPLEMENTED,
  APP_STORE_PRODUCT_IDENTIFIERS_CONFIRMED,
  assertAppStoreLiveBillingAllowed,
  CANONICAL_IOS_BUNDLE_ID,
} from "./appleConstants";
import {
  ensureAppStoreFinancialReview,
  iosFullRefundMissingSaleReviewId,
  iosInvalidRevocationPercentageReviewId,
  iosProratedRefundReviewId,
  iosRefundReversedReviewId,
  iosUnsupportedRevocationReviewId,
} from "./appleFinancialReview";
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
  statusResponseForItems,
  TEST_EXPIRES_MS,
  TEST_NOTIFICATION_UUID,
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
  gracePeriodExpiresDate?: number;
  renewalOriginalTransactionId?: string;
  renewalAppAccountToken?: string;
  renewalProductId?: string;
  billingPlanType?: string;
  renewalBillingPlanType?: string;
  commitmentInfo?: Record<string, unknown>;
  renewalCommitmentInfo?: Record<string, unknown>;
  offerType?: number;
  offerIdentifier?: string;
  offerDiscountType?: string;
  renewalOfferType?: number;
  renewalOfferIdentifier?: string;
  renewalOfferDiscountType?: string;
  eligibleWinBackOfferIds?: string[];
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
      ...(opts.billingPlanType != null ? { billingPlanType: opts.billingPlanType } : {}),
      ...(opts.commitmentInfo != null ? { commitmentInfo: opts.commitmentInfo } : {}),
      ...(opts.offerType != null ? { offerType: opts.offerType } : {}),
      ...(opts.offerIdentifier != null ? { offerIdentifier: opts.offerIdentifier } : {}),
      ...(opts.offerDiscountType != null ? { offerDiscountType: opts.offerDiscountType } : {}),
    })
  );
  const renewal = signAppleJws(
    renewalPayload({
      originalTransactionId: opts.renewalOriginalTransactionId ?? originalTransactionId,
      productId: opts.renewalProductId ?? opts.productId ?? PRODUCT,
      autoRenewProductId: opts.autoRenewProductId ?? opts.productId ?? PRODUCT,
      autoRenewStatus: opts.autoRenew ?? AutoRenewStatus.ON,
      signedDate: opts.signedDate ?? TEST_NOW_MS,
      appAccountToken: opts.renewalAppAccountToken ?? opts.token,
      ...(opts.gracePeriodExpiresDate != null
        ? { gracePeriodExpiresDate: opts.gracePeriodExpiresDate }
        : {}),
      ...(opts.renewalBillingPlanType != null
        ? { renewalBillingPlanType: opts.renewalBillingPlanType }
        : {}),
      ...(opts.renewalCommitmentInfo != null
        ? { commitmentInfo: opts.renewalCommitmentInfo }
        : {}),
      ...(opts.renewalOfferType != null ? { offerType: opts.renewalOfferType } : {}),
      ...(opts.renewalOfferIdentifier != null
        ? { offerIdentifier: opts.renewalOfferIdentifier }
        : {}),
      ...(opts.renewalOfferDiscountType != null
        ? { offerDiscountType: opts.renewalOfferDiscountType }
        : {}),
      ...(opts.eligibleWinBackOfferIds != null
        ? { eligibleWinBackOfferIds: opts.eligibleWinBackOfferIds }
        : {}),
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

function assertNoSyntheticQueueFinancialIds(store: MemoryBillingStore) {
  for (const [path, doc] of store.docs.entries()) {
    if (!path.includes("_billingReconciliationQueue/")) continue;
    const id = String((doc as BillingReconciliationQueueDoc).financialEventId ?? "");
    assert.match(id, /^ios:(purchase|renewal|refund):.+$/);
    assert.equal(id.includes(":review:"), false);
    assert.equal(id.includes("unknown"), false);
  }
}

function ledger(store: MemoryBillingStore, id: string): BillingEventLedgerDoc | undefined {
  return store.docs.get(financialLedgerPath(sanitizeDocId(id))) as BillingEventLedgerDoc | undefined;
}

function reviewDoc(store: MemoryBillingStore, id: string): AppStoreFinancialReviewDoc | undefined {
  return store.docs.get(appStoreFinancialReviewPath(sanitizeDocId(id))) as
    | AppStoreFinancialReviewDoc
    | undefined;
}

function queueDoc(
  store: MemoryBillingStore,
  financialEventId: string,
  originalTransactionId = ORIG,
  incident: IosStatusReconciliationIncident = IOS_CALLABLE_RECONCILIATION_INCIDENT
): BillingReconciliationQueueDoc | undefined {
  return store.docs.get(
    billingReconciliationQueuePath(
      sanitizeDocId(
        iosStatusReconciliationQueueId(originalTransactionId, financialEventId, incident)
      )
    )
  ) as BillingReconciliationQueueDoc | undefined;
}

function assnIncident(
  notificationUUID = TEST_NOTIFICATION_UUID
): IosStatusReconciliationIncident {
  return { kind: "assn", notificationUUID };
}

function queueCount(store: MemoryBillingStore): number {
  return [...store.docs.keys()].filter((k) => k.includes("_billingReconciliationQueue/")).length;
}

function historyCount(store: MemoryBillingStore, uid = UID): number {
  const prefix = `users/${uid}/subscriptionBillingHistory/`;
  return [...store.docs.keys()].filter((k) => k.startsWith(prefix)).length;
}

function financialReviewCount(store: MemoryBillingStore): number {
  return [...store.docs.keys()].filter((k) => k.includes("_appStoreFinancialReview/")).length;
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
    expectedCanonicalSku: "vyd_professional_monthly",
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
  assert.equal(result.to?.autoRenewing, true);
}

{
  const { deps, pair } = await primed({ status: Status.BILLING_RETRY });
  const result = await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  assert.equal(result.to?.billingStatus, "onHold");
  assert.equal(result.to?.entitlementActive, false);
  assert.equal(result.to?.autoRenewing, true);
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
  const { store, deps, api, pair, token, taxEvents } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  const prorated = signAppleJws(
    transactionPayload({
      appAccountToken: token,
      revocationType: RevocationType.REFUND_PRORATED,
      revocationDate: TEST_NOW_MS + 1,
      revocationPercentage: 75_000,
    })
  );
  const notif = signAppleJws(
    notificationPayload({
      notificationType: NotificationTypeV2.REFUND,
      signedTransactionInfo: prorated,
    })
  );
  const callsBefore = api.calls;
  const result = await processIosNotification(deps, notif);
  assert.equal(result.action, "prorated_refund_review_reconciled");
  assert.ok(api.calls > callsBefore);
  assert.equal(ledger(store, "ios:refund:2001"), undefined);
  assert.equal(taxEvents.includes("refund"), false);
  const review = reviewDoc(store, iosProratedRefundReviewId(ORIG));
  assert.equal(review?.reason, "unsupported_ios_prorated_refund");
  assert.equal(review?.financialEventId, "ios:purchase:2001");
  assert.equal(review?.status, "pending");
  assert.ok(review?.entitlementReconciledAt);
  assert.equal(result.to?.entitlementActive, true);
  const queueHits = [...store.docs.keys()].filter((k) => k.includes("_billingReconciliationQueue/"));
  assert.equal(queueHits.length, 0);
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
  const { store, deps, api, pair, token } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  const nested = signAppleJws(transactionPayload({ appAccountToken: token }));
  const notif = signAppleJws(
    notificationPayload({
      notificationType: NotificationTypeV2.REFUND_REVERSED,
      signedTransactionInfo: nested,
    })
  );
  const callsBefore = api.calls;
  const result = await processIosNotification(deps, notif);
  assert.equal(result.action, "refund_reversal_review_reconciled");
  assert.ok(api.calls > callsBefore);
  assert.equal(result.to?.billingStatus, "active");
  assert.ok(ledger(store, "ios:purchase:2001"));
  assert.equal(ledger(store, "ios:refund:2001"), undefined);
  const review = reviewDoc(store, iosRefundReversedReviewId(ORIG));
  assert.equal(review?.reason, "unsupported_ios_refund_reversal");
  assert.equal(review?.transactionId, ORIG);
  assert.equal(review?.financialEventId, null);
  assert.equal(review?.status, "pending");
  assert.ok(review?.entitlementReconciledAt);
  const queueHits = [...store.docs.keys()].filter((k) => k.includes("_billingReconciliationQueue/"));
  assert.equal(queueHits.length, 0);
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
  const qid = billingReconciliationQueuePath(
    sanitizeDocId(
      iosStatusReconciliationQueueId(ORIG, "ios:purchase:2001", IOS_CALLABLE_RECONCILIATION_INCIDENT)
    )
  );
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

{
  assert.equal(APP_STORE_FINANCIAL_REPORTING_AUTHORITY_IMPLEMENTED, false);
  assert.equal(APP_STORE_PRODUCT_IDENTIFIERS_CONFIRMED, false);
  assert.equal(APP_STORE_ENABLE_ONLINE_CERTIFICATE_CHECKS, false);
  assert.throws(
    () => assertAppStoreLiveBillingAllowed(),
    isCause("appstore_financial_authority_unimplemented")
  );
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
    isCause("appstore_financial_authority_unimplemented")
  );
}

{
  const { deps, pair } = await primed();
  await assert.rejects(
    handleValidateAndActivateIOS(deps, {
      uid: UID,
      signedTransactionInfo: pair.tx,
      expectedCanonicalSku: "vyd_starter_monthly",
    }),
    isCause("sku_hint_mismatch")
  );
}

{
  const { deps, pair } = await primed({
    status: Status.BILLING_GRACE_PERIOD,
    autoRenew: AutoRenewStatus.OFF,
  });
  const result = await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  assert.equal(result.to?.billingStatus, "grace");
  assert.equal(result.to?.autoRenewing, false);
  assert.equal(result.to?.entitlementActive, true);
}

{
  const { deps, pair } = await primed({
    status: Status.BILLING_RETRY,
    autoRenew: AutoRenewStatus.OFF,
  });
  const result = await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  assert.equal(result.to?.billingStatus, "onHold");
  assert.equal(result.to?.autoRenewing, false);
  assert.equal(result.to?.entitlementActive, false);
}

{
  const { store, deps, pair } = await primed({
    reason: TransactionReason.RENEWAL,
    transactionId: "3001",
  });
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  (deps.api as FakeAppleApi).fail = new BillingError({
    clientCode: "temporary_unavailable",
    causeCode: "apple_api_temporary_unavailable",
    retryable: true,
  });
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx }),
    isCause("apple_api_temporary_unavailable")
  );
  const queued = queueDoc(store, "ios:renewal:3001");
  assert.equal(queued?.financialEventId, "ios:renewal:3001");
  assert.equal(queued?.status, "pending");
  assert.equal(ledger(store, "ios:purchase:3001"), undefined);
  (deps.api as FakeAppleApi).fail = null;
  await handleValidateAndActivateIOS(
    { ...deps, nowMs: () => TEST_NOW_MS + 50 },
    { uid: UID, signedTransactionInfo: pair.tx }
  );
  const resolved = queueDoc(store, "ios:renewal:3001");
  assert.equal(resolved?.status, "resolved");
  assert.equal(resolved?.financialEventId, "ios:renewal:3001");
  assert.equal(ledger(store, "ios:renewal:3001")?.eventType, "renewal");
  assert.equal(ledger(store, "ios:purchase:3001"), undefined);
  assertNoSyntheticQueueFinancialIds(store);
}

{
  const { store, deps, token } = await primed();
  const bad = signAppleJws(
    transactionPayload({ transactionReason: undefined, appAccountToken: token })
  );
  (deps.api as FakeAppleApi).fail = new BillingError({
    clientCode: "temporary_unavailable",
    causeCode: "apple_api_temporary_unavailable",
    retryable: true,
  });
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: bad }),
    isCause("unknown_ios_transaction_reason")
  );
  assert.equal(ledger(store, "ios:purchase:2001"), undefined);
  assert.equal(queueCount(store), 0);
}

{
  const { store, deps, pair, token } = await primed({
    reason: TransactionReason.RENEWAL,
    transactionId: "3001",
  });
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  assert.ok(ledger(store, "ios:renewal:3001"));
  const refundTx = signAppleJws(
    transactionPayload({
      appAccountToken: token,
      transactionId: "3001",
      originalTransactionId: ORIG,
      transactionReason: TransactionReason.RENEWAL,
      revocationType: RevocationType.REFUND_FULL,
      revocationDate: TEST_NOW_MS + 5000,
      revocationPercentage: 100_000,
      purchaseDate: TEST_NOW_MS,
    })
  );
  (deps.api as FakeAppleApi).fail = new BillingError({
    clientCode: "temporary_unavailable",
    causeCode: "apple_api_temporary_unavailable",
    retryable: true,
  });
  const notif = signAppleJws(
    notificationPayload({
      notificationType: NotificationTypeV2.REFUND,
      signedTransactionInfo: refundTx,
    })
  );
  await assert.rejects(
    processIosNotification({ ...deps, nowMs: () => TEST_NOW_MS + 5000 }, notif),
    isCause("apple_api_temporary_unavailable")
  );
  assert.ok(ledger(store, "ios:refund:3001"));
  assert.equal(ledger(store, "ios:purchase:3001"), undefined);
  const queued = queueDoc(store, "ios:refund:3001", ORIG, assnIncident());
  assert.equal(queued?.financialEventId, "ios:refund:3001");
  await assert.rejects(
    processIosNotification({ ...deps, nowMs: () => TEST_NOW_MS + 6000 }, notif),
    isCause("apple_api_temporary_unavailable")
  );
  const again = [...store.docs.keys()].filter((k) => k.includes("_billingReconciliationQueue/"));
  assert.equal(again.length, 1);
  assertNoSyntheticQueueFinancialIds(store);

  (deps.api as FakeAppleApi).fail = null;
  const expired = currentPair({
    token,
    status: Status.EXPIRED,
    reason: TransactionReason.RENEWAL,
    transactionId: "3001",
    purchaseDate: TEST_NOW_MS,
    signedDate: TEST_NOW_MS + 7000,
  });
  (deps.api as FakeAppleApi).statuses = expired.statuses;
  const recovered = await processIosNotification({ ...deps, nowMs: () => TEST_NOW_MS + 7000 }, notif);
  assert.equal(recovered.to?.billingStatus, "expired");
  const resolved = queueDoc(store, "ios:refund:3001", ORIG, assnIncident());
  assert.equal(resolved?.status, "resolved");
  assert.equal(resolved?.financialEventId, "ios:refund:3001");
  assert.equal(ledger(store, "ios:refund:3001")?.relatedFinancialEventId, "ios:renewal:3001");
  assert.equal(ledger(store, "ios:purchase:3001"), undefined);
  assert.equal(
    [...store.docs.keys()].filter((k) => k.includes("_billingReconciliationQueue/")).length,
    1
  );
  assertNoSyntheticQueueFinancialIds(store);
}

{
  const { store, deps, pair } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  const { appAccountToken: bob } = await seedAccount(store, OTHER);
  const refundTx = signAppleJws(
    transactionPayload({
      appAccountToken: bob,
      transactionId: ORIG,
      originalTransactionId: ORIG,
      transactionReason: TransactionReason.PURCHASE,
      revocationType: RevocationType.REFUND_FULL,
      revocationDate: TEST_NOW_MS + 1,
      revocationPercentage: 100_000,
      purchaseDate: TEST_NOW_MS,
    })
  );
  const notif = signAppleJws(
    notificationPayload({
      notificationType: NotificationTypeV2.REFUND,
      signedTransactionInfo: refundTx,
    })
  );
  const aliceBefore = store.docs.get(subscriptionStatusPath(UID));
  await assert.rejects(processIosNotification(deps, notif), isCause("ios_refund_owner_mismatch"));
  assert.equal(ledger(store, "ios:refund:2001"), undefined);
  assert.equal(store.docs.get(subscriptionStatusPath(UID)), aliceBefore);
  assert.equal(store.docs.get(subscriptionStatusPath(OTHER)), undefined);
}

{
  const { store, deps } = await primed();
  const notif = signAppleJws(
    notificationPayload({ notificationType: NotificationTypeV2.REFUND_REVERSED })
  );
  await assert.rejects(processIosNotification(deps, notif), isCause("assn_missing_signed_transaction"));
  assert.equal(
    [...store.docs.keys()].some((k) => k.includes("unknown") || k.includes("refund-reversed")),
    false
  );
}

{
  const { store, deps, pair, token } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  const refundTx = signAppleJws(
    transactionPayload({
      appAccountToken: token,
      revocationType: RevocationType.REFUND_FULL,
      revocationDate: TEST_NOW_MS + 5000,
      revocationPercentage: 100_000,
      purchaseDate: TEST_NOW_MS,
    })
  );
  const stillActive = currentPair({
    token,
    transactionId: "3001",
    originalTransactionId: ORIG,
    reason: TransactionReason.RENEWAL,
    purchaseDate: TEST_NOW_MS + 1000,
    signedDate: TEST_NOW_MS + 1000,
  });
  (deps.api as FakeAppleApi).statuses = stillActive.statuses;
  await processIosNotification(
    { ...deps, nowMs: () => TEST_NOW_MS + 5000 },
    signAppleJws(
      notificationPayload({
        notificationType: NotificationTypeV2.REFUND,
        signedTransactionInfo: refundTx,
      })
    )
  );
  assert.ok(ledger(store, "ios:refund:2001"));
  const reversed = signAppleJws(
    notificationPayload({
      notificationType: NotificationTypeV2.REFUND_REVERSED,
      signedTransactionInfo: refundTx,
    })
  );
  await processIosNotification(deps, reversed);
  const review = reviewDoc(store, iosRefundReversedReviewId(ORIG));
  assert.equal(review?.financialEventId, "ios:refund:2001");
  assert.equal(review?.uid, UID);
  assert.equal(review?.canonicalSku, "vyd_professional_monthly");
  assert.equal(review?.platform, "ios");
  assert.equal(ledger(store, "ios:refund:2001")?.relatedFinancialEventId, "ios:purchase:2001");
  assert.equal(ledger(store, "ios:refund:2001")?.uid, UID);
  assert.equal(review?.status, "pending");
  assert.ok(review?.entitlementReconciledAt);
  assertNoSyntheticQueueFinancialIds(store);
}

{
  const { store, deps, pair, token } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  store.docs.set(financialLedgerPath(sanitizeDocId("ios:renewal:2001")), {
    ...ledger(store, "ios:purchase:2001"),
    financialEventId: "ios:renewal:2001",
    eventType: "renewal",
  } as BillingEventLedgerDoc);
  const prorated = signAppleJws(
    transactionPayload({
      appAccountToken: token,
      revocationType: RevocationType.REFUND_PRORATED,
      revocationDate: TEST_NOW_MS + 1,
      revocationPercentage: 75_000,
    })
  );
  await assert.rejects(
    processIosNotification(
      deps,
      signAppleJws(
        notificationPayload({
          notificationType: NotificationTypeV2.REFUND,
          signedTransactionInfo: prorated,
        })
      )
    ),
    isCause("purchase_renewal_classification_conflict")
  );
  assert.equal(ledger(store, "ios:refund:2001"), undefined);
}

{
  const { store, deps, token } = await primed();
  const a = currentPair({
    token,
    status: Status.BILLING_GRACE_PERIOD,
    gracePeriodExpiresDate: TEST_NOW_MS + 86_400_000,
  });
  const b = currentPair({
    token,
    status: Status.BILLING_GRACE_PERIOD,
    gracePeriodExpiresDate: TEST_NOW_MS + 2 * 86_400_000,
  });
  (deps.api as FakeAppleApi).statuses = statusResponseForItems(ORIG, [
    { status: Status.BILLING_GRACE_PERIOD, signedTransactionInfo: a.tx, signedRenewalInfo: a.renewal },
    { status: Status.BILLING_GRACE_PERIOD, signedTransactionInfo: b.tx, signedRenewalInfo: b.renewal },
  ]);
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: a.tx }),
    isCause("ambiguous_ios_subscription_state")
  );
  void store;
}

{
  const { deps, token } = await primed();
  const a = currentPair({ token, revocationDate: TEST_NOW_MS + 1 });
  const b = currentPair({ token, revocationDate: TEST_NOW_MS + 2 });
  (deps.api as FakeAppleApi).statuses = statusResponseForItems(ORIG, [
    { status: Status.ACTIVE, signedTransactionInfo: a.tx, signedRenewalInfo: a.renewal },
    { status: Status.ACTIVE, signedTransactionInfo: b.tx, signedRenewalInfo: b.renewal },
  ]);
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: a.tx }),
    isCause("ambiguous_ios_subscription_state")
  );
}

{
  const { deps, token } = await primed();
  const a = currentPair({ token, reason: TransactionReason.PURCHASE, price: 249000, currency: "INR" });
  const b = currentPair({ token, reason: TransactionReason.RENEWAL, price: 1370, currency: "INR" });
  (deps.api as FakeAppleApi).statuses = statusResponseForItems(ORIG, [
    { status: Status.ACTIVE, signedTransactionInfo: a.tx, signedRenewalInfo: a.renewal },
    { status: Status.ACTIVE, signedTransactionInfo: b.tx, signedRenewalInfo: b.renewal },
  ]);
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: a.tx }),
    isCause("ambiguous_ios_subscription_state")
  );
}

{
  const { deps, token } = await primed();
  const pair = currentPair({ token, renewalOriginalTransactionId: "9999" });
  (deps.api as FakeAppleApi).statuses = pair.statuses;
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx }),
    isCause("ios_renewal_original_transaction_mismatch")
  );
}

{
  const { store, deps, token } = await primed();
  const { appAccountToken: bob } = await seedAccount(store, OTHER);
  const pair = currentPair({ token, renewalAppAccountToken: bob });
  (deps.api as FakeAppleApi).statuses = pair.statuses;
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx }),
    isCause("ios_renewal_account_token_mismatch")
  );
}

{
  const { deps, token } = await primed();
  const pair = currentPair({
    token,
    renewalProductId: "com.specialsoftwares.vyaamikkdiary.business.monthly",
    autoRenewProductId: PRODUCT,
  });
  (deps.api as FakeAppleApi).statuses = pair.statuses;
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx }),
    isCause("ios_renewal_transaction_mismatch")
  );
}

{
  const { store, deps, pair } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  await seedAccount(store, OTHER);
  const evilId = "ios:refund:evil";
  store.docs.set(financialLedgerPath(sanitizeDocId(evilId)), {
    ...(ledger(store, "ios:purchase:2001") as BillingEventLedgerDoc),
    financialEventId: evilId,
    eventType: "refund",
    uid: OTHER,
    relatedFinancialEventId: "ios:purchase:2001",
  } as BillingEventLedgerDoc);
  store.docs.set(
    billingReconciliationQueuePath(
      sanitizeDocId(
      iosStatusReconciliationQueueId(ORIG, "ios:purchase:2001", IOS_CALLABLE_RECONCILIATION_INCIDENT)
    )
    ),
    {
    reason: "ios_live_status_unavailable",
    platform: "ios",
    financialEventId: evilId,
    credentialFingerprint: null,
    createdAt: TEST_NOW_MS,
    updatedAt: TEST_NOW_MS,
    resolvedAt: null,
    status: "pending",
    attemptCount: 0,
  } as BillingReconciliationQueueDoc);
  await assert.rejects(
    handleValidateAndActivateIOS(
      { ...deps, nowMs: () => TEST_NOW_MS + 50 },
      { uid: UID, signedTransactionInfo: pair.tx }
    ),
    isCause("reconciliation_queue_identity_mismatch")
  );
  assert.equal(queueDoc(store, "ios:purchase:2001")?.status, "pending");
  assert.equal(queueDoc(store, "ios:purchase:2001")?.financialEventId, evilId);
}

{
  const { store, deps, api, pair, token } = await primed({ status: Status.EXPIRED });
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  assert.equal(store.docs.get(subscriptionStatusPath(UID))?.billingStatus, "expired");
  assert.equal(store.docs.get(subscriptionStatusPath(UID))?.entitlementActive, false);
  const active = currentPair({ token, signedDate: TEST_NOW_MS + 1000 });
  api.statuses = active.statuses;
  const reversed = signAppleJws(
    notificationPayload({
      notificationType: NotificationTypeV2.REFUND_REVERSED,
      signedTransactionInfo: pair.tx,
    })
  );
  const result = await processIosNotification(
    { ...deps, nowMs: () => TEST_NOW_MS + 1000 },
    reversed
  );
  assert.equal(result.action, "refund_reversal_review_reconciled");
  assert.equal(result.to?.billingStatus, "active");
  assert.equal(result.to?.entitlementActive, true);
  const review = reviewDoc(store, iosRefundReversedReviewId(ORIG));
  assert.equal(review?.status, "pending");
  assert.ok(review?.entitlementReconciledAt);
  assert.equal(ledger(store, "ios:refund:2001"), undefined);
}

{
  const { store, deps, api, pair, token } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  api.fail = new BillingError({
    clientCode: "temporary_unavailable",
    causeCode: "apple_api_temporary_unavailable",
    retryable: true,
  });
  const nested = signAppleJws(transactionPayload({ appAccountToken: token }));
  const notif = signAppleJws(
    notificationPayload({
      notificationType: NotificationTypeV2.REFUND_REVERSED,
      signedTransactionInfo: nested,
    })
  );
  await assert.rejects(
    handleAppStoreServerNotificationsV2Http({
      body: { signedPayload: notif },
      deps: { ...deps, nowMs: () => TEST_NOW_MS + 1 },
      appStoreBillingEnabled: true,
    }),
    (e: unknown) =>
      isCause("apple_api_temporary_unavailable")(e) && assnHttpStatusForError(e) === 503
  );
  const review = reviewDoc(store, iosRefundReversedReviewId(ORIG));
  assert.equal(review?.reason, "unsupported_ios_refund_reversal");
  assert.equal(review?.entitlementReconciledAt, null);
  assert.equal(review?.financialEventId, null);
  assert.equal(queueDoc(store, "ios:purchase:2001"), undefined);
  assert.equal(queueCount(store), 0);
  assertNoSecrets(store);
}

{
  const { store, deps, pair, token } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  await seedAccount(store, OTHER);
  store.docs.set(financialLedgerPath(sanitizeDocId("ios:refund:2001")), {
    ...(ledger(store, "ios:purchase:2001") as BillingEventLedgerDoc),
    financialEventId: "ios:refund:2001",
    eventType: "refund",
    uid: OTHER,
    relatedFinancialEventId: "ios:purchase:2001",
  } as BillingEventLedgerDoc);
  const aliceBefore = store.docs.get(subscriptionStatusPath(UID));
  const nested = signAppleJws(transactionPayload({ appAccountToken: token }));
  await assert.rejects(
    processIosNotification(
      deps,
      signAppleJws(
        notificationPayload({
          notificationType: NotificationTypeV2.REFUND_REVERSED,
          signedTransactionInfo: nested,
        })
      )
    ),
    isCause("ios_refund_ledger_integrity_mismatch")
  );
  assert.equal(reviewDoc(store, iosRefundReversedReviewId(ORIG)), undefined);
  assert.equal(store.docs.get(subscriptionStatusPath(UID)), aliceBefore);
  assert.equal(store.docs.get(subscriptionStatusPath(OTHER)), undefined);
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
  await processIosNotification(deps, notif);
  const dup = await processIosNotification({ ...deps, nowMs: () => TEST_NOW_MS + 9 }, notif);
  assert.equal(dup.action, "refund_reversal_review_reconciled");
  const reviews = [...store.docs.keys()].filter((k) => k.includes("_appStoreFinancialReview/"));
  assert.equal(reviews.length, 1);
  assert.equal(reviewDoc(store, iosRefundReversedReviewId(ORIG))?.uid, UID);
}

{
  const { store, deps, pair, token } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  const nested = signAppleJws(transactionPayload({ appAccountToken: token }));
  await processIosNotification(
    deps,
    signAppleJws(
      notificationPayload({
        notificationType: NotificationTypeV2.REFUND_REVERSED,
        signedTransactionInfo: nested,
      })
    )
  );
  const { appAccountToken: bob } = await seedAccount(store, OTHER);
  const bobNested = signAppleJws(transactionPayload({ appAccountToken: bob }));
  await assert.rejects(
    processIosNotification(
      deps,
      signAppleJws(
        notificationPayload({
          notificationType: NotificationTypeV2.REFUND_REVERSED,
          signedTransactionInfo: bobNested,
        })
      )
    ),
    isCause("ios_financial_review_identity_mismatch")
  );
  assert.equal(reviewDoc(store, iosRefundReversedReviewId(ORIG))?.uid, UID);
}

{
  const { store, deps, pair, token } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  const nested = signAppleJws(transactionPayload({ appAccountToken: token }));
  await processIosNotification(
    deps,
    signAppleJws(
      notificationPayload({
        notificationType: NotificationTypeV2.REFUND_REVERSED,
        signedTransactionInfo: nested,
      })
    )
  );
  const otherSku = signAppleJws(
    transactionPayload({
      appAccountToken: token,
      productId: "com.specialsoftwares.vyaamikkdiary.starter.monthly",
    })
  );
  await assert.rejects(
    processIosNotification(
      deps,
      signAppleJws(
        notificationPayload({
          notificationType: NotificationTypeV2.REFUND_REVERSED,
          signedTransactionInfo: otherSku,
        })
      )
    ),
    isCause("ios_financial_review_identity_mismatch")
  );
  assert.equal(
    reviewDoc(store, iosRefundReversedReviewId(ORIG))?.canonicalSku,
    "vyd_professional_monthly"
  );
}

{
  const { store, deps, api, pair, token } = await primed({ status: Status.EXPIRED });
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  assert.equal(store.docs.get(subscriptionStatusPath(UID))?.entitlementActive, false);
  const active = currentPair({ token, signedDate: TEST_NOW_MS + 2000 });
  api.statuses = active.statuses;
  const prorated = signAppleJws(
    transactionPayload({
      appAccountToken: token,
      revocationType: RevocationType.REFUND_PRORATED,
      revocationDate: TEST_NOW_MS + 1,
      revocationPercentage: 75_000,
    })
  );
  const result = await processIosNotification(
    { ...deps, nowMs: () => TEST_NOW_MS + 2000 },
    signAppleJws(
      notificationPayload({
        notificationType: NotificationTypeV2.REFUND,
        signedTransactionInfo: prorated,
      })
    )
  );
  assert.equal(result.action, "prorated_refund_review_reconciled");
  assert.equal(result.to?.billingStatus, "active");
  assert.equal(result.to?.entitlementActive, true);
  assert.equal(ledger(store, "ios:refund:2001"), undefined);
  assert.equal(reviewDoc(store, iosProratedRefundReviewId(ORIG))?.status, "pending");
}

{
  const { store, deps, api, pair, token, taxEvents } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  api.fail = new BillingError({
    clientCode: "temporary_unavailable",
    causeCode: "apple_api_temporary_unavailable",
    retryable: true,
  });
  const prorated = signAppleJws(
    transactionPayload({
      appAccountToken: token,
      revocationType: RevocationType.REFUND_PRORATED,
      revocationDate: TEST_NOW_MS + 1,
      revocationPercentage: 75_000,
    })
  );
  const err = await processIosNotification(
    deps,
    signAppleJws(
      notificationPayload({
        notificationType: NotificationTypeV2.REFUND,
        signedTransactionInfo: prorated,
      })
    )
  ).then(
    () => null,
    (e: unknown) => e
  );
  assert.ok(isCause("apple_api_temporary_unavailable")(err));
  assert.equal(assnHttpStatusForError(err), 503);
  const review = reviewDoc(store, iosProratedRefundReviewId(ORIG));
  assert.equal(review?.reason, "unsupported_ios_prorated_refund");
  assert.equal(review?.entitlementReconciledAt, null);
  assert.equal(ledger(store, "ios:refund:2001"), undefined);
  assert.equal(taxEvents.includes("refund"), false);
  const queued = queueDoc(store, "ios:purchase:2001", ORIG, assnIncident());
  assert.equal(queued?.financialEventId, "ios:purchase:2001");
  assertNoSyntheticQueueFinancialIds(store);
  assertNoSecrets(store);
}

{
  const retryable = () =>
    new BillingError({
      clientCode: "temporary_unavailable",
      causeCode: "apple_api_temporary_unavailable",
      retryable: true,
    });
  const { store, deps, api, pair, token } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  api.fail = retryable();
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx }),
    isCause("apple_api_temporary_unavailable")
  );
  assert.equal(queueDoc(store, "ios:purchase:2001")?.status, "pending");
  api.fail = null;
  await handleValidateAndActivateIOS(
    { ...deps, nowMs: () => TEST_NOW_MS + 2 },
    { uid: UID, signedTransactionInfo: pair.tx }
  );
  assert.equal(queueDoc(store, "ios:purchase:2001")?.status, "resolved");

  const renewal = currentPair({
    token,
    reason: TransactionReason.RENEWAL,
    transactionId: "3001",
    purchaseDate: TEST_NOW_MS + 20,
    signedDate: TEST_NOW_MS + 20,
  });
  api.statuses = renewal.statuses;
  await handleValidateAndActivateIOS(
    { ...deps, nowMs: () => TEST_NOW_MS + 60_000 },
    { uid: UID, signedTransactionInfo: renewal.tx }
  );
  assert.ok(ledger(store, "ios:renewal:3001"));
  api.fail = retryable();
  await assert.rejects(
    handleValidateAndActivateIOS(
      { ...deps, nowMs: () => TEST_NOW_MS + 60_001 },
      { uid: UID, signedTransactionInfo: renewal.tx }
    ),
    isCause("apple_api_temporary_unavailable")
  );
  assert.equal(queueDoc(store, "ios:renewal:3001")?.status, "pending");
  assert.equal(queueDoc(store, "ios:renewal:3001")?.financialEventId, "ios:renewal:3001");
  assert.equal(queueDoc(store, "ios:purchase:2001")?.status, "resolved");
  assert.equal(queueCount(store), 2);

  api.fail = null;
  await handleValidateAndActivateIOS(
    { ...deps, nowMs: () => TEST_NOW_MS + 60_002 },
    { uid: UID, signedTransactionInfo: pair.tx }
  );
  assert.equal(queueDoc(store, "ios:purchase:2001")?.status, "resolved");
  assert.equal(queueDoc(store, "ios:renewal:3001")?.status, "pending");

  await handleValidateAndActivateIOS(
    { ...deps, nowMs: () => TEST_NOW_MS + 120_000 },
    { uid: UID, signedTransactionInfo: renewal.tx }
  );
  assert.equal(queueDoc(store, "ios:renewal:3001")?.status, "resolved");

  const refundTx = signAppleJws(
    transactionPayload({
      appAccountToken: token,
      transactionId: "3001",
      originalTransactionId: ORIG,
      transactionReason: TransactionReason.RENEWAL,
      revocationType: RevocationType.REFUND_FULL,
      revocationDate: TEST_NOW_MS + 120_010,
      revocationPercentage: 100_000,
      purchaseDate: TEST_NOW_MS + 20,
    })
  );
  api.fail = retryable();
  const refundNotif = signAppleJws(
    notificationPayload({
      notificationType: NotificationTypeV2.REFUND,
      signedTransactionInfo: refundTx,
      signedDate: TEST_NOW_MS + 120_010,
    })
  );
  await assert.rejects(
    processIosNotification({ ...deps, nowMs: () => TEST_NOW_MS + 120_010 }, refundNotif),
    isCause("apple_api_temporary_unavailable")
  );
  assert.equal(queueDoc(store, "ios:refund:3001", ORIG, assnIncident())?.status, "pending");
  assert.equal(
    queueDoc(store, "ios:refund:3001", ORIG, assnIncident())?.financialEventId,
    "ios:refund:3001"
  );
  assert.equal(queueDoc(store, "ios:purchase:2001")?.status, "resolved");
  assert.equal(queueDoc(store, "ios:renewal:3001")?.status, "resolved");
  assert.equal(queueCount(store), 3);
  assert.ok(ledger(store, "ios:refund:3001"));

  api.fail = null;
  const revoked = currentPair({
    token,
    status: Status.REVOKED,
    autoRenew: AutoRenewStatus.OFF,
    reason: TransactionReason.RENEWAL,
    transactionId: "3001",
    purchaseDate: TEST_NOW_MS + 20,
    signedDate: TEST_NOW_MS + 120_020,
  });
  api.statuses = revoked.statuses;
  await processIosNotification({ ...deps, nowMs: () => TEST_NOW_MS + 120_020 }, refundNotif);
  assert.equal(queueDoc(store, "ios:refund:3001", ORIG, assnIncident())?.status, "resolved");
  assert.equal(queueDoc(store, "ios:purchase:2001")?.status, "resolved");
  assert.equal(queueDoc(store, "ios:renewal:3001")?.status, "resolved");
  assert.equal(queueCount(store), 3);
  assertNoSyntheticQueueFinancialIds(store);
}

{
  const t1 = TEST_NOW_MS + 86_400_000;
  const t2 = TEST_NOW_MS + 2 * 86_400_000;
  for (const [from, to] of [
    [t1, t2],
    [t2, t1],
  ] as const) {
    const { store, deps, api, pair, token } = await primed({
      status: Status.BILLING_GRACE_PERIOD,
      gracePeriodExpiresDate: from,
    });
    await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
    assert.equal(store.docs.get(subscriptionStatusPath(UID))?.gracePeriodEndsAt, from);
    const histories = historyCount(store);
    const later = currentPair({
      token,
      status: Status.BILLING_GRACE_PERIOD,
      gracePeriodExpiresDate: to,
      signedDate: TEST_NOW_MS + 1,
    });
    api.statuses = later.statuses;
    await handleValidateAndActivateIOS(
      { ...deps, nowMs: () => TEST_NOW_MS + 50 },
      { uid: UID, signedTransactionInfo: later.tx }
    );
    assert.equal(store.docs.get(subscriptionStatusPath(UID))?.gracePeriodEndsAt, to);
    assert.equal(historyCount(store), histories + 1);
    const resign = currentPair({
      token,
      status: Status.BILLING_GRACE_PERIOD,
      gracePeriodExpiresDate: to,
      signedDate: TEST_NOW_MS + 2,
    });
    api.statuses = resign.statuses;
    await handleValidateAndActivateIOS(
      { ...deps, nowMs: () => TEST_NOW_MS + 100 },
      { uid: UID, signedTransactionInfo: resign.tx }
    );
    assert.equal(store.docs.get(subscriptionStatusPath(UID))?.gracePeriodEndsAt, to);
    assert.equal(historyCount(store), histories + 1);
  }
}

{
  const t1 = TEST_NOW_MS + 86_400_000;
  const { store, deps, api, pair, token } = await primed({
    status: Status.BILLING_GRACE_PERIOD,
    autoRenew: AutoRenewStatus.ON,
    gracePeriodExpiresDate: t1,
  });
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  assert.equal(store.docs.get(subscriptionStatusPath(UID))?.autoRenewing, true);
  const histories = historyCount(store);
  const off = currentPair({
    token,
    status: Status.BILLING_GRACE_PERIOD,
    autoRenew: AutoRenewStatus.OFF,
    gracePeriodExpiresDate: t1,
    signedDate: TEST_NOW_MS + 1,
  });
  api.statuses = off.statuses;
  await handleValidateAndActivateIOS(
    { ...deps, nowMs: () => TEST_NOW_MS + 50 },
    { uid: UID, signedTransactionInfo: off.tx }
  );
  assert.equal(store.docs.get(subscriptionStatusPath(UID))?.autoRenewing, false);
  assert.equal(historyCount(store), histories + 1);
  const on = currentPair({
    token,
    status: Status.BILLING_GRACE_PERIOD,
    autoRenew: AutoRenewStatus.ON,
    gracePeriodExpiresDate: t1,
    signedDate: TEST_NOW_MS + 2,
  });
  api.statuses = on.statuses;
  await handleValidateAndActivateIOS(
    { ...deps, nowMs: () => TEST_NOW_MS + 100 },
    { uid: UID, signedTransactionInfo: on.tx }
  );
  assert.equal(store.docs.get(subscriptionStatusPath(UID))?.autoRenewing, true);
  assert.equal(historyCount(store), histories + 2);
}

{
  const { store, deps, api, pair, token } = await primed({
    status: Status.BILLING_RETRY,
    autoRenew: AutoRenewStatus.ON,
  });
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  assert.equal(store.docs.get(subscriptionStatusPath(UID))?.billingStatus, "onHold");
  assert.equal(store.docs.get(subscriptionStatusPath(UID))?.autoRenewing, true);
  assert.equal(store.docs.get(subscriptionStatusPath(UID))?.platform, "ios");
  const histories = historyCount(store);
  const off = currentPair({
    token,
    status: Status.BILLING_RETRY,
    autoRenew: AutoRenewStatus.OFF,
    signedDate: TEST_NOW_MS + 1,
  });
  api.statuses = off.statuses;
  await handleValidateAndActivateIOS(
    { ...deps, nowMs: () => TEST_NOW_MS + 50 },
    { uid: UID, signedTransactionInfo: off.tx }
  );
  assert.equal(store.docs.get(subscriptionStatusPath(UID))?.autoRenewing, false);
  assert.equal(store.docs.get(subscriptionStatusPath(UID))?.billingStatus, "onHold");
  assert.equal(historyCount(store), histories + 1);
  const same = currentPair({
    token,
    status: Status.BILLING_RETRY,
    autoRenew: AutoRenewStatus.OFF,
    signedDate: TEST_NOW_MS + 2,
  });
  api.statuses = same.statuses;
  await handleValidateAndActivateIOS(
    { ...deps, nowMs: () => TEST_NOW_MS + 100 },
    { uid: UID, signedTransactionInfo: same.tx }
  );
  assert.equal(historyCount(store), histories + 1);
}

{
  const { store, deps, api, pair, token } = await primed({ autoRenew: AutoRenewStatus.OFF });
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  assert.equal(store.docs.get(subscriptionStatusPath(UID))?.billingStatus, "cancelled");
  const histories = historyCount(store);
  const resign = currentPair({
    token,
    autoRenew: AutoRenewStatus.OFF,
    signedDate: TEST_NOW_MS + 9,
  });
  api.statuses = resign.statuses;
  await handleValidateAndActivateIOS(
    { ...deps, nowMs: () => TEST_NOW_MS + 90 },
    { uid: UID, signedTransactionInfo: resign.tx }
  );
  assert.equal(store.docs.get(subscriptionStatusPath(UID))?.billingStatus, "cancelled");
  assert.equal(historyCount(store), histories);
}

{
  const { store, deps, token, taxEvents } = await primed({
    status: Status.REVOKED,
    autoRenew: AutoRenewStatus.OFF,
  });
  const refundTx = signAppleJws(
    transactionPayload({
      appAccountToken: token,
      revocationType: RevocationType.REFUND_FULL,
      revocationDate: TEST_NOW_MS + 1,
      revocationPercentage: 100_000,
      purchaseDate: TEST_NOW_MS,
    })
  );
  const result = await processIosNotification(
    { ...deps, nowMs: () => TEST_NOW_MS + 2 },
    signAppleJws(
      notificationPayload({
        notificationType: NotificationTypeV2.REFUND,
        signedTransactionInfo: refundTx,
      })
    )
  );
  assert.equal(result.to?.entitlementActive, false);
  const review = reviewDoc(store, iosFullRefundMissingSaleReviewId(ORIG));
  assert.equal(review?.reason, "ios_full_refund_original_sale_missing");
  assert.equal(review?.status, "pending");
  const sale = ledger(store, "ios:purchase:2001") ?? ledger(store, "ios:renewal:2001");
  const refund = ledger(store, "ios:refund:2001");
  if (!sale) {
    assert.equal(refund, undefined);
    assert.equal(taxEvents.includes("refund"), false);
  } else if (refund) {
    assert.equal(refund.relatedFinancialEventId, sale.financialEventId);
  }
}

{
  const { store, deps, token, taxEvents } = await primed({
    status: Status.EXPIRED,
    autoRenew: AutoRenewStatus.OFF,
  });
  const refundTx = signAppleJws(
    transactionPayload({
      appAccountToken: token,
      revocationType: RevocationType.REFUND_FULL,
      revocationDate: TEST_NOW_MS + 1,
      revocationPercentage: 100_000,
      purchaseDate: TEST_NOW_MS,
    })
  );
  const notif = signAppleJws(
    notificationPayload({
      notificationType: NotificationTypeV2.REFUND,
      signedTransactionInfo: refundTx,
    })
  );
  await processIosNotification({ ...deps, nowMs: () => TEST_NOW_MS + 2 }, notif);
  assert.ok(ledger(store, "ios:purchase:2001"));
  assert.equal(ledger(store, "ios:refund:2001")?.relatedFinancialEventId, "ios:purchase:2001");
  assert.equal(
    reviewDoc(store, iosFullRefundMissingSaleReviewId(ORIG))?.financialEventId,
    "ios:refund:2001"
  );
  const histories = historyCount(store);
  await processIosNotification({ ...deps, nowMs: () => TEST_NOW_MS + 3 }, notif);
  assert.equal(ledger(store, "ios:refund:2001")?.relatedFinancialEventId, "ios:purchase:2001");
  assert.equal(historyCount(store), histories);
  assert.ok(taxEvents.includes("refund"));
}

{
  const { store, deps, api, token, taxEvents } = await primed();
  const liveLater = currentPair({
    token,
    reason: TransactionReason.RENEWAL,
    transactionId: "3001",
    purchaseDate: TEST_NOW_MS + 1000,
    signedDate: TEST_NOW_MS + 1000,
  });
  api.statuses = liveLater.statuses;
  const refundTx = signAppleJws(
    transactionPayload({
      appAccountToken: token,
      transactionId: "2001",
      originalTransactionId: ORIG,
      transactionReason: TransactionReason.PURCHASE,
      revocationType: RevocationType.REFUND_FULL,
      revocationDate: TEST_NOW_MS + 500,
      revocationPercentage: 100_000,
      purchaseDate: TEST_NOW_MS,
    })
  );
  const result = await processIosNotification(
    { ...deps, nowMs: () => TEST_NOW_MS + 2000 },
    signAppleJws(
      notificationPayload({
        notificationType: NotificationTypeV2.REFUND,
        signedTransactionInfo: refundTx,
      })
    )
  );
  assert.equal(result.to?.billingStatus, "active");
  assert.equal(result.to?.entitlementActive, true);
  assert.equal(ledger(store, "ios:purchase:2001"), undefined);
  assert.equal(ledger(store, "ios:refund:2001"), undefined);
  assert.ok(ledger(store, "ios:renewal:3001"));
  const review = reviewDoc(store, iosFullRefundMissingSaleReviewId("2001"));
  assert.equal(review?.reason, "ios_full_refund_original_sale_missing");
  assert.equal(review?.financialEventId, null);
  assert.equal(review?.status, "pending");
  assert.ok(review?.entitlementReconciledAt);
  assert.equal(taxEvents.includes("refund"), false);
}

{
  const { store, deps, api, pair, token, taxEvents } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  const nested = signAppleJws(
    transactionPayload({
      appAccountToken: token,
      revocationType: "FUTURE_REVOKE_KIND",
      revocationDate: TEST_NOW_MS + 1,
    })
  );
  api.statuses = currentPair({ token, signedDate: TEST_NOW_MS + 2 }).statuses;
  const result = await processIosNotification(
    { ...deps, nowMs: () => TEST_NOW_MS + 2 },
    signAppleJws(
      notificationPayload({
        notificationType: NotificationTypeV2.REFUND,
        signedTransactionInfo: nested,
      })
    )
  );
  assert.equal(result.action, "unsupported_revocation_review_reconciled");
  assert.equal(result.to?.billingStatus, "active");
  assert.equal(ledger(store, "ios:refund:2001"), undefined);
  assert.equal(taxEvents.includes("refund"), false);
  const review = reviewDoc(store, iosUnsupportedRevocationReviewId(ORIG));
  assert.equal(review?.reason, "unsupported_ios_revocation_type");
  assert.ok(review?.entitlementReconciledAt);
}

{
  const { store, deps, api, token } = await primed();
  const prorated = signAppleJws(
    transactionPayload({
      appAccountToken: token,
      revocationType: RevocationType.REFUND_PRORATED,
      revocationDate: TEST_NOW_MS + 1,
      revocationPercentage: 75_000,
    })
  );
  const notif = signAppleJws(
    notificationPayload({
      notificationType: NotificationTypeV2.REFUND,
      signedTransactionInfo: prorated,
    })
  );
  api.statuses = currentPair({ token, signedDate: TEST_NOW_MS + 5 }).statuses;
  await processIosNotification({ ...deps, nowMs: () => TEST_NOW_MS + 5 }, notif);
  const id = iosProratedRefundReviewId(ORIG);
  assert.equal(reviewDoc(store, id)?.financialEventId, null);
  assert.ok(ledger(store, "ios:purchase:2001"));
  assert.equal(ledger(store, "ios:refund:2001"), undefined);
  await processIosNotification({ ...deps, nowMs: () => TEST_NOW_MS + 6 }, notif);
  const review = reviewDoc(store, id);
  assert.equal(review?.financialEventId, "ios:purchase:2001");
  assert.ok(review?.financialEventLinkedAt);
  const linkedAt = review?.financialEventLinkedAt;
  await processIosNotification({ ...deps, nowMs: () => TEST_NOW_MS + 7 }, notif);
  assert.equal(reviewDoc(store, id)?.financialEventId, "ios:purchase:2001");
  assert.equal(reviewDoc(store, id)?.financialEventLinkedAt, linkedAt);
}

{
  const store = new MemoryBillingStore();
  const id = iosProratedRefundReviewId("enrich-1");
  const base = {
    id,
    reason: "unsupported_ios_prorated_refund",
    transactionId: "enrich-1",
    originalTransactionId: ORIG,
    canonicalSku: "vyd_professional_monthly",
    uid: UID,
    diagnosticUid: "diag-original",
  };
  await ensureAppStoreFinancialReview(store, {
    ...base,
    financialEventId: null,
    nowMs: TEST_NOW_MS,
  });
  assert.equal(reviewDoc(store, id)?.financialEventId, null);
  assert.equal(reviewDoc(store, id)?.financialEventLinkedAt, null);
  await ensureAppStoreFinancialReview(store, {
    ...base,
    financialEventId: "ios:purchase:enrich-1",
    diagnosticUid: "diag-rotated",
    nowMs: TEST_NOW_MS + 1,
  });
  const enriched = reviewDoc(store, id);
  assert.equal(enriched?.financialEventId, "ios:purchase:enrich-1");
  assert.equal(enriched?.diagnosticUid, "diag-original");
  assert.equal(enriched?.financialEventLinkedAt, TEST_NOW_MS + 1);
  await ensureAppStoreFinancialReview(store, {
    ...base,
    financialEventId: "ios:purchase:enrich-1",
    nowMs: TEST_NOW_MS + 2,
  });
  assert.equal(reviewDoc(store, id)?.financialEventLinkedAt, TEST_NOW_MS + 1);
  await ensureAppStoreFinancialReview(store, {
    ...base,
    financialEventId: null,
    nowMs: TEST_NOW_MS + 3,
  });
  assert.equal(reviewDoc(store, id)?.financialEventId, "ios:purchase:enrich-1");
  await assert.rejects(
    ensureAppStoreFinancialReview(store, {
      ...base,
      financialEventId: "ios:refund:enrich-1",
      nowMs: TEST_NOW_MS + 4,
    }),
    isCause("ios_financial_review_identity_mismatch")
  );
  await assert.rejects(
    ensureAppStoreFinancialReview(store, {
      ...base,
      uid: OTHER,
      financialEventId: "ios:purchase:enrich-1",
      nowMs: TEST_NOW_MS + 5,
    }),
    isCause("ios_financial_review_identity_mismatch")
  );
  await assert.rejects(
    ensureAppStoreFinancialReview(store, {
      ...base,
      canonicalSku: "vyd_starter_monthly",
      financialEventId: "ios:purchase:enrich-1",
      nowMs: TEST_NOW_MS + 6,
    }),
    isCause("ios_financial_review_identity_mismatch")
  );
}

{
  const { deps, pair } = await primed({
    billingPlanType: BillingPlanType.BILLED_UPFRONT,
    renewalBillingPlanType: RenewalBillingPlanType.BILLED_UPFRONT,
  });
  const result = await handleValidateAndActivateIOS(deps, {
    uid: UID,
    signedTransactionInfo: pair.tx,
  });
  assert.equal(result.to?.billingStatus, "active");
}

{
  const { deps, pair } = await primed({ billingPlanType: BillingPlanType.MONTHLY });
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx }),
    isCause("unsupported_ios_commitment_billing_plan")
  );
}

{
  const { deps, pair } = await primed({
    renewalBillingPlanType: RenewalBillingPlanType.MONTHLY,
  });
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx }),
    isCause("unsupported_ios_commitment_billing_plan")
  );
}

{
  const { deps, pair } = await primed({
    commitmentInfo: { totalBillingPeriods: 12 },
  });
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx }),
    isCause("unsupported_ios_commitment_billing_plan")
  );
}

{
  const { deps, pair } = await primed({
    renewalCommitmentInfo: { commitmentRenewalDate: TEST_NOW_MS + 1 },
  });
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx }),
    isCause("unsupported_ios_commitment_billing_plan")
  );
}

{
  const { deps, pair } = await primed({ billingPlanType: "YEARLY" });
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx }),
    isCause("unsupported_ios_commitment_billing_plan")
  );
}

{
  const { deps, pair } = await primed({
    billingPlanType: BillingPlanType.BILLED_UPFRONT,
    renewalBillingPlanType: RenewalBillingPlanType.MONTHLY,
  });
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx }),
    isCause("unsupported_ios_commitment_billing_plan")
  );
}

{
  const { deps, token } = await primed();
  const a = currentPair({ token, billingPlanType: BillingPlanType.BILLED_UPFRONT });
  const b = currentPair({ token });
  (deps.api as FakeAppleApi).statuses = statusResponseForItems(ORIG, [
    { status: Status.ACTIVE, signedTransactionInfo: a.tx, signedRenewalInfo: a.renewal },
    { status: Status.ACTIVE, signedTransactionInfo: b.tx, signedRenewalInfo: b.renewal },
  ]);
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: a.tx }),
    isCause("ambiguous_ios_subscription_state")
  );
}

{
  const { store, deps, pair } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  assert.ok(ledger(store, "ios:purchase:2001"));
  assert.equal(historyCount(store), 1);
}

{
  const { store, deps, pair } = await primed({ offerType: OfferType.INTRODUCTORY_OFFER });
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx }),
    isCause("unsupported_ios_store_offer")
  );
  assert.equal(store.docs.get(subscriptionStatusPath(UID)), undefined);
  assert.equal(historyCount(store), 0);
  assert.equal(ledger(store, "ios:purchase:2001"), undefined);
  assert.equal(financialReviewCount(store), 0);
}

{
  const { store, deps, pair } = await primed({ offerType: OfferType.PROMOTIONAL_OFFER });
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx }),
    isCause("unsupported_ios_store_offer")
  );
  assert.equal(ledger(store, "ios:purchase:2001"), undefined);
}

{
  const { store, deps, pair } = await primed({ offerType: OfferType.OFFER_CODE });
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx }),
    isCause("unsupported_ios_store_offer")
  );
  assert.equal(historyCount(store), 0);
}

{
  const { store, deps, pair } = await primed({ offerType: OfferType.WIN_BACK_OFFER });
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx }),
    isCause("unsupported_ios_store_offer")
  );
  assert.equal(store.docs.get(subscriptionStatusPath(UID)), undefined);
}

{
  const { store, deps, pair } = await primed({
    offerDiscountType: OfferDiscountType.FREE_TRIAL,
  });
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx }),
    isCause("unsupported_ios_store_offer")
  );
  assert.equal(ledger(store, "ios:purchase:2001"), undefined);
}

{
  const { store, deps, pair } = await primed({ offerIdentifier: "promo.ios.vyd" });
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx }),
    isCause("unsupported_ios_store_offer")
  );
  assert.equal(historyCount(store), 0);
}

{
  const { store, deps, pair } = await primed({
    renewalOfferType: OfferType.PROMOTIONAL_OFFER,
  });
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx }),
    isCause("unsupported_ios_store_offer")
  );
  assert.equal(store.docs.get(subscriptionStatusPath(UID)), undefined);
  assert.equal(ledger(store, "ios:purchase:2001"), undefined);
}

{
  const { store, deps, pair } = await primed({
    price: 0,
    offerType: OfferType.INTRODUCTORY_OFFER,
    offerDiscountType: OfferDiscountType.FREE_TRIAL,
  });
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx }),
    isCause("unsupported_ios_store_offer")
  );
  const status = store.docs.get(subscriptionStatusPath(UID)) as
    | { trialStartedAt?: unknown; billingStatus?: unknown }
    | undefined;
  assert.equal(status, undefined);
  assert.equal(historyCount(store), 0);
  assert.equal(ledger(store, "ios:purchase:2001"), undefined);
  assert.equal(financialReviewCount(store), 0);
}

{
  const { store, deps, pair } = await primed({
    eligibleWinBackOfferIds: ["winback.eligible.not.applied"],
  });
  const result = await handleValidateAndActivateIOS(deps, {
    uid: UID,
    signedTransactionInfo: pair.tx,
  });
  assert.equal(result.to?.billingStatus, "active");
  assert.ok(ledger(store, "ios:purchase:2001"));
}

{
  const { store, deps, token } = await primed();
  const offered = signAppleJws(
    transactionPayload({
      appAccountToken: token,
      offerType: OfferType.INTRODUCTORY_OFFER,
    })
  );
  await assert.rejects(
    processIosNotification(
      deps,
      signAppleJws(
        notificationPayload({
          notificationType: NotificationTypeV2.SUBSCRIBED,
          signedTransactionInfo: offered,
        })
      )
    ),
    isCause("unsupported_ios_store_offer")
  );
  assert.equal(ledger(store, "ios:purchase:2001"), undefined);
  assert.equal(queueCount(store), 0);
  assert.equal(financialReviewCount(store), 0);
}

{
  const { store, deps, api, pair, token, taxEvents } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  const refundTx = signAppleJws(
    transactionPayload({
      appAccountToken: token,
      revocationType: RevocationType.REFUND_FULL,
      revocationDate: TEST_NOW_MS + 1,
      revocationPercentage: 100_000,
      purchaseDate: TEST_NOW_MS,
    })
  );
  const expired = currentPair({
    token,
    status: Status.EXPIRED,
    autoRenew: AutoRenewStatus.OFF,
    signedDate: TEST_NOW_MS + 2,
  });
  api.statuses = expired.statuses;
  const result = await processIosNotification(
    { ...deps, nowMs: () => TEST_NOW_MS + 2 },
    signAppleJws(
      notificationPayload({
        notificationType: NotificationTypeV2.REFUND,
        signedTransactionInfo: refundTx,
      })
    )
  );
  assert.equal(result.action, "reconciled");
  assert.ok(ledger(store, "ios:refund:2001"));
  assert.equal(taxEvents.includes("refund"), true);
}

{
  const { store, deps, api, pair, token, taxEvents } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  const refundTx = signAppleJws(
    transactionPayload({
      appAccountToken: token,
      revocationType: RevocationType.REFUND_FULL,
      revocationDate: TEST_NOW_MS + 1,
      purchaseDate: TEST_NOW_MS,
    })
  );
  const stillActive = currentPair({ token, signedDate: TEST_NOW_MS + 2 });
  api.statuses = stillActive.statuses;
  const result = await processIosNotification(
    { ...deps, nowMs: () => TEST_NOW_MS + 2 },
    signAppleJws(
      notificationPayload({
        notificationType: NotificationTypeV2.REFUND,
        signedTransactionInfo: refundTx,
      })
    )
  );
  assert.equal(result.action, "invalid_revocation_percentage_review_reconciled");
  assert.equal(result.to?.entitlementActive, true);
  assert.equal(result.to?.billingStatus, "active");
  assert.equal(ledger(store, "ios:refund:2001"), undefined);
  assert.equal(taxEvents.includes("refund"), false);
  const review = reviewDoc(store, iosInvalidRevocationPercentageReviewId(ORIG));
  assert.equal(review?.reason, "invalid_ios_revocation_percentage");
  assert.ok(review?.entitlementReconciledAt);
}

{
  const { store, deps, pair, token, taxEvents } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  const refundTx = signAppleJws(
    transactionPayload({
      appAccountToken: token,
      revocationType: RevocationType.REFUND_FULL,
      revocationDate: TEST_NOW_MS + 1,
      revocationPercentage: 75_000,
      purchaseDate: TEST_NOW_MS,
    })
  );
  const result = await processIosNotification(
    deps,
    signAppleJws(
      notificationPayload({
        notificationType: NotificationTypeV2.REFUND,
        signedTransactionInfo: refundTx,
      })
    )
  );
  assert.equal(result.action, "invalid_revocation_percentage_review_reconciled");
  assert.equal(ledger(store, "ios:refund:2001"), undefined);
  assert.equal(taxEvents.includes("refund"), false);
  assert.equal(
    reviewDoc(store, iosInvalidRevocationPercentageReviewId(ORIG))?.reason,
    "invalid_ios_revocation_percentage"
  );
  assert.equal(reviewDoc(store, iosProratedRefundReviewId(ORIG)), undefined);
}

{
  const { store, deps, pair, token, taxEvents } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  const refundTx = signAppleJws(
    transactionPayload({
      appAccountToken: token,
      revocationType: RevocationType.REFUND_PRORATED,
      revocationDate: TEST_NOW_MS + 1,
      purchaseDate: TEST_NOW_MS,
    })
  );
  const result = await processIosNotification(
    deps,
    signAppleJws(
      notificationPayload({
        notificationType: NotificationTypeV2.REFUND,
        signedTransactionInfo: refundTx,
      })
    )
  );
  assert.equal(result.action, "invalid_revocation_percentage_review_reconciled");
  assert.equal(ledger(store, "ios:refund:2001"), undefined);
  assert.equal(taxEvents.includes("refund"), false);
  assert.equal(reviewDoc(store, iosProratedRefundReviewId(ORIG)), undefined);
}

{
  const { store, deps, pair, token, taxEvents } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  const refundTx = signAppleJws(
    transactionPayload({
      appAccountToken: token,
      revocationType: RevocationType.REFUND_PRORATED,
      revocationDate: TEST_NOW_MS + 1,
      revocationPercentage: 100_000,
      purchaseDate: TEST_NOW_MS,
    })
  );
  const result = await processIosNotification(
    deps,
    signAppleJws(
      notificationPayload({
        notificationType: NotificationTypeV2.REFUND,
        signedTransactionInfo: refundTx,
      })
    )
  );
  assert.equal(result.action, "invalid_revocation_percentage_review_reconciled");
  assert.equal(ledger(store, "ios:refund:2001"), undefined);
  assert.equal(taxEvents.includes("refund"), false);
  assert.equal(reviewDoc(store, iosProratedRefundReviewId(ORIG)), undefined);
}

{
  const { store, deps, pair, token, taxEvents } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  for (const revocationPercentage of [-1, 100_001, 75_000.5]) {
    const refundTx = signAppleJws(
      transactionPayload({
        appAccountToken: token,
        revocationType: RevocationType.REFUND_FULL,
        revocationDate: TEST_NOW_MS + 1,
        revocationPercentage,
        purchaseDate: TEST_NOW_MS,
      })
    );
    const result = await processIosNotification(
      deps,
      signAppleJws(
        notificationPayload({
          notificationType: NotificationTypeV2.REFUND,
          signedTransactionInfo: refundTx,
        })
      )
    );
    assert.equal(result.action, "invalid_revocation_percentage_review_reconciled");
    assert.equal(ledger(store, "ios:refund:2001"), undefined);
    assert.equal(taxEvents.includes("refund"), false);
  }
}

{
  const { store, deps, pair, token, taxEvents } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  const reversedTx = signAppleJws(
    transactionPayload({
      appAccountToken: token,
      revocationType: RevocationType.REFUND_FULL,
      revocationDate: TEST_NOW_MS + 1,
      purchaseDate: TEST_NOW_MS,
    })
  );
  const result = await processIosNotification(
    deps,
    signAppleJws(
      notificationPayload({
        notificationType: NotificationTypeV2.REFUND_REVERSED,
        signedTransactionInfo: reversedTx,
      })
    )
  );
  assert.equal(result.action, "refund_reversal_review_reconciled");
  assert.equal(result.to?.entitlementActive, true);
  assert.equal(ledger(store, "ios:refund:2001"), undefined);
  assert.equal(taxEvents.includes("refund"), false);
  assert.equal(reviewDoc(store, iosRefundReversedReviewId(ORIG))?.reason, "unsupported_ios_refund_reversal");
  assert.equal(reviewDoc(store, iosInvalidRevocationPercentageReviewId(ORIG)), undefined);
}

{
  const retryable = () =>
    new BillingError({
      clientCode: "temporary_unavailable",
      causeCode: "apple_api_temporary_unavailable",
      retryable: true,
    });
  const uuidA = TEST_NOTIFICATION_UUID;
  const uuidB = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
  const { store, deps, api, pair } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  api.fail = retryable();
  const notifA = signAppleJws(
    notificationPayload({
      notificationType: NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS,
      signedTransactionInfo: pair.tx,
      notificationUUID: uuidA,
    })
  );
  await assert.rejects(
    processIosNotification(deps, notifA),
    isCause("apple_api_temporary_unavailable")
  );
  assert.equal(queueDoc(store, "ios:purchase:2001", ORIG, assnIncident(uuidA))?.status, "pending");
  assert.equal(queueDoc(store, "ios:purchase:2001"), undefined);
  api.fail = null;
  await processIosNotification({ ...deps, nowMs: () => TEST_NOW_MS + 1 }, notifA);
  assert.equal(queueDoc(store, "ios:purchase:2001", ORIG, assnIncident(uuidA))?.status, "resolved");
  api.fail = retryable();
  const notifB = signAppleJws(
    notificationPayload({
      notificationType: NotificationTypeV2.DID_FAIL_TO_RENEW,
      subtype: Subtype.BILLING_RETRY,
      signedTransactionInfo: pair.tx,
      notificationUUID: uuidB,
    })
  );
  await assert.rejects(
    processIosNotification({ ...deps, nowMs: () => TEST_NOW_MS + 2 }, notifB),
    (e: unknown) =>
      isCause("apple_api_temporary_unavailable")(e) &&
      !isCause("reconciliation_queue_identity_mismatch")(e)
  );
  assert.equal(queueDoc(store, "ios:purchase:2001", ORIG, assnIncident(uuidA))?.status, "resolved");
  assert.equal(queueDoc(store, "ios:purchase:2001", ORIG, assnIncident(uuidB))?.status, "pending");
  assert.equal(queueCount(store), 2);
  api.fail = null;
  await processIosNotification({ ...deps, nowMs: () => TEST_NOW_MS + 3 }, notifB);
  assert.equal(queueDoc(store, "ios:purchase:2001", ORIG, assnIncident(uuidA))?.status, "resolved");
  assert.equal(queueDoc(store, "ios:purchase:2001", ORIG, assnIncident(uuidB))?.status, "resolved");
  assert.equal(queueCount(store), 2);
  await processIosNotification({ ...deps, nowMs: () => TEST_NOW_MS + 4 }, notifB);
  assert.equal(queueCount(store), 2);
}

{
  const { store, deps, pair } = await primed();
  await assert.rejects(
    processIosNotification(
      deps,
      signAppleJws(
        notificationPayload({
          notificationType: NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS,
          signedTransactionInfo: pair.tx,
          notificationUUID: "",
        })
      )
    ),
    isCause("missing_ios_notification_uuid")
  );
  assert.equal(ledger(store, "ios:purchase:2001"), undefined);
  assert.equal(queueCount(store), 0);
}

{
  const { store, deps, token } = await primed();
  const other = currentPair({
    token,
    originalTransactionId: "9999",
    transactionId: "9999",
  });
  (deps.api as FakeAppleApi).statuses = statusResponseForItems(ORIG, [
    {
      status: Status.ACTIVE,
      signedTransactionInfo: other.tx,
      signedRenewalInfo: other.renewal,
    },
  ]);
  const pointer = currentPair({ token });
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pointer.tx }),
    isCause("ios_status_transaction_chain_mismatch")
  );
  assert.equal(ledger(store, "ios:purchase:2001"), undefined);
}

{
  const { store, deps, token } = await primed();
  const valid = currentPair({ token });
  const other = currentPair({
    token,
    originalTransactionId: "9999",
    transactionId: "9999",
  });
  (deps.api as FakeAppleApi).statuses = statusResponseForItems(ORIG, [
    {
      status: Status.ACTIVE,
      signedTransactionInfo: valid.tx,
      signedRenewalInfo: valid.renewal,
    },
    {
      status: Status.ACTIVE,
      signedTransactionInfo: other.tx,
      signedRenewalInfo: other.renewal,
    },
  ]);
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: valid.tx }),
    isCause("ios_status_transaction_chain_mismatch")
  );
  assert.equal(ledger(store, "ios:purchase:2001"), undefined);
  assert.equal(historyCount(store), 0);
}

{
  const { store, deps, token } = await primed();
  const valid = currentPair({ token });
  const sibling = currentPair({
    token,
    originalTransactionId: "9999",
    transactionId: "9999",
  });
  (deps.api as FakeAppleApi).statuses = statusResponseForItems(ORIG, [
    {
      status: Status.ACTIVE,
      signedTransactionInfo: sibling.tx,
      signedRenewalInfo: sibling.renewal,
      originalTransactionId: "9999",
    },
    {
      status: Status.ACTIVE,
      signedTransactionInfo: valid.tx,
      signedRenewalInfo: valid.renewal,
      originalTransactionId: ORIG,
    },
  ]);
  const result = await handleValidateAndActivateIOS(deps, {
    uid: UID,
    signedTransactionInfo: valid.tx,
  });
  assert.equal(result.to?.billingStatus, "active");
  assert.ok(ledger(store, "ios:purchase:2001"));
}

{
  const { store, deps, token } = await primed();
  const pointer = currentPair({ token });
  const consumable = currentPair({ token, type: Type.CONSUMABLE });
  (deps.api as FakeAppleApi).statuses = statusResponseForItems(ORIG, [
    {
      status: Status.ACTIVE,
      signedTransactionInfo: consumable.tx,
      signedRenewalInfo: consumable.renewal,
    },
  ]);
  await assert.rejects(
    handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pointer.tx }),
    isCause("ios_status_product_type_mismatch")
  );
  assert.equal(ledger(store, "ios:purchase:2001"), undefined);
}

{
  const { store, deps, api, pair } = await primed();
  await handleValidateAndActivateIOS(deps, { uid: UID, signedTransactionInfo: pair.tx });
  const callsBefore = api.calls;
  const historyBefore = historyCount(store);
  const sandboxIdentity = {
    bundleId: CANONICAL_IOS_BUNDLE_ID,
    environment: Environment.SANDBOX,
    appAppleId: 1234,
  };
  const cases: Array<{ payload: Record<string, unknown>; action: string }> = [
    {
      payload: notificationPayload({
        notificationType: NotificationTypeV2.RENEWAL_EXTENSION,
        subtype: Subtype.SUMMARY,
        summary: sandboxIdentity,
      }),
      action: "renewal_extension_summary_ignored",
    },
    {
      payload: notificationPayload({
        notificationType: NotificationTypeV2.EXTERNAL_PURCHASE_TOKEN,
        externalPurchaseToken: {
          ...sandboxIdentity,
          externalPurchaseId: "SANDBOX_ignored_token",
        },
      }),
      action: "external_purchase_token_ignored",
    },
    {
      payload: notificationPayload({
        notificationType: NotificationTypeV2.RESCIND_CONSENT,
        appData: sandboxIdentity,
      }),
      action: "non_billing_rescind_consent_ignored",
    },
  ];
  for (const item of cases) {
    const http = await handleAppStoreServerNotificationsV2Http({
      body: { signedPayload: signAppleJws(item.payload) },
      deps,
      appStoreBillingEnabled: true,
    });
    assert.equal(http.status, 200);
    assert.equal(http.body.action, item.action);
  }
  assert.equal(api.calls, callsBefore);
  assert.equal(historyCount(store), historyBefore);
  assert.ok(ledger(store, "ios:purchase:2001"));
  assert.equal(queueCount(store), 0);
  assert.equal(financialReviewCount(store), 0);
  assertNoSecrets(store);
  const blob = storeBlob(store);
  assert.equal(blob.includes("SANDBOX_ignored_token"), false);
}

{
  const { store, deps, pair } = await primed();
  await assert.rejects(
    processIosNotification(
      deps,
      signAppleJws(
        notificationPayload({
          notificationType: "FUTURE_UNKNOWN_VYD33",
        })
      )
    ),
    isCause("assn_missing_signed_transaction")
  );
  assert.equal(ledger(store, "ios:purchase:2001"), undefined);
  assert.equal(queueCount(store), 0);
  void pair;
}

{
  const durable = /^ios:(purchase|renewal|refund):.+$/;
  assert.equal(durable.test("ios:purchase:2001"), true);
  assert.equal(durable.test("ios:renewal:3001"), true);
  assert.equal(durable.test("ios:refund:3001"), true);
  assert.equal(durable.test("xios:purchase:2001"), false);
  assert.equal(durable.test("ios:review:2001"), false);
  assert.equal(durable.test("ios:purchase:"), false);
}

assert.equal(CANONICAL_IOS_BUNDLE_ID, "com.specialsoftwares.vyaamikkdiary");

console.log("appleIos.unit.test.ts: ok");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
