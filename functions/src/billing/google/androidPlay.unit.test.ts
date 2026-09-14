/**
 * VYD-32 Google Play backend adapter test matrix (catalog, ownership,
 * credential secrecy, states, ack, RTDN, refunds, rate limit, tax handoff).
 * Run: npm run test:billing-google-play
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { handleValidateAndActivateAndroid } from "../callables/validateAndActivateAndroid";
import { handlePrepareAndroidBillingAccount } from "../callables/prepareAndroidBillingAccount";
import { handleAndroidRtdnHttp } from "../callables/androidRtdn";
import { InMemoryCredentialCipher, credentialFingerprint } from "../crypto";
import { diagnosticUidHmac } from "../diagnosticUid";
import { BillingError } from "../errors";
import { companyBillingPath, financialLedgerPath, playAccountIndexPath, playCredentialIndexPath, sanitizeDocId, billingReconciliationQueuePath, subscriptionStatusPath } from "../paths";
import { ALL_CANONICAL_SKUS, SUBSCRIPTION_CATALOG, canonicalSkuForAndroid } from "../products";
import { istMonthKeyForMillis } from "../istMonthKey";
import { MemoryBillingStore } from "../store";
import type { BillingEventLedgerDoc, CompanyBillingDoc, SubscriptionStatusDoc } from "../types";
import { buildGstr1WorkingPapers } from "../tax/gstr1WorkingPapers";
import { MemoryTaxComplianceReportSource } from "../tax/taxComplianceReportSource";
import {
  processAndroidPurchaseToken,
  processAndroidVoidedPurchase,
  resolveAndroidCatalogFromLineItem,
  type AndroidBillingDeps,
  type PostCommitTaxHandoff,
} from "./androidSubscriptionAdapter";
import type { PlayApi } from "./playApiClient";
import { PlayApiClient, sanitizePlayOrder } from "./playApiClient";
import {
  assertFullyRefundedSubscriptionOrder,
  assertPaidSubscriptionOrder,
  assertProcessedSubscriptionOrder,
  assertVoidedPurchaseFullRefundType,
  classifyVerifiedFullRefundReason,
} from "./playOrder";
import { obfuscatedAccountIdForUid } from "./playOwnership";
import { verifyPubSubPushOidc, type OidcTokenVerifier } from "./pubsubOidc";
import { handleAndroidRtdn } from "./rtdn";
import type { GoogleOrder, GoogleSubscriptionPurchaseV2 } from "./playTypes";

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;
const FUTURE = NOW + 30 * DAY;
const SECRET = "unit-test-only-billing-diag-uid-secret-0001";
const UID = "uid-play-alice";
const OTHER = "uid-play-bob";
const TOKEN = "RAW_PURCHASE_TOKEN_SECRET_VALUE_DO_NOT_PERSIST";
const TOKEN2 = "RAW_PURCHASE_TOKEN_SECRET_VALUE_REPLACEMENT";
const LINKED = "RAW_LINKED_TOKEN_SECRET_VALUE_DO_NOT_PERSIST";
const EXPIRED_TOKEN = "RAW_EXPIRED_PURCHASE_TOKEN_SECRET_DO_NOT_PERSIST";
const ORDER1 = "GPA.3311-PLAY-1";
const ORDER2 = "GPA.3311-PLAY-2";

function isCause(code: string) {
  return (e: unknown) => e instanceof BillingError && e.causeCode === code;
}

function rfc(ms: number): string {
  return new Date(ms).toISOString();
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function activeSub(overrides: Partial<GoogleSubscriptionPurchaseV2> = {}): GoogleSubscriptionPurchaseV2 {
  return {
    subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
    acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
    startTime: rfc(NOW),
    etag: "etag-active-1",
    lineItems: [
      {
        productId: "vyd_professional",
        expiryTime: rfc(FUTURE),
        latestSuccessfulOrderId: ORDER1,
        autoRenewingPlan: { autoRenewEnabled: true },
        offerDetails: { basePlanId: "monthly" },
      },
    ],
    externalAccountIdentifiers: {
      obfuscatedExternalAccountId: obfuscatedAccountIdForUid(UID),
    },
    ...overrides,
  };
}

function paidOrder(
  orderId: string,
  totalUnits: string,
  nanos = 0,
  createTime = rfc(NOW),
  opts: {
    productId?: string;
    basePlanId?: string;
    processedEventTime?: string;
    state?: GoogleOrder["state"];
  } = {}
): GoogleOrder {
  const total = { currencyCode: "INR" as const, units: totalUnits, nanos };
  const productId = opts.productId ?? "vyd_professional";
  const basePlanId = opts.basePlanId ?? "monthly";
  const processedEventTime = opts.processedEventTime ?? createTime;
  return {
    orderId,
    state: opts.state ?? "PROCESSED",
    createTime,
    total,
    developerRevenueInBuyerCurrency: { currencyCode: "INR", units: "1", nanos: 0 },
    lineItems: [
      {
        productId,
        total,
        subscriptionDetails: {
          basePlanId,
          servicePeriodStartTime: processedEventTime,
        },
      },
    ],
    orderHistory: {
      processedEvent: { eventTime: processedEventTime },
    },
  };
}

function refundedOrder(
  order: GoogleOrder,
  refundEventTime: string,
  refundTotal: GoogleOrder["total"] = order.total,
  refundReason: string | null = "OTHER"
): GoogleOrder {
  return {
    ...order,
    state: "REFUNDED",
    orderHistory: {
      processedEvent: order.orderHistory?.processedEvent ?? {
        eventTime: order.createTime,
      },
      refundEvent: {
        eventTime: refundEventTime,
        refundDetails: {
          total: refundTotal,
          tax: order.tax,
        },
        ...(refundReason != null ? { refundReason } : {}),
      },
    },
  };
}

function starterSub(overrides: Partial<GoogleSubscriptionPurchaseV2> = {}): GoogleSubscriptionPurchaseV2 {
  return activeSub({
    lineItems: [
      {
        productId: "vyd_starter",
        expiryTime: rfc(FUTURE),
        latestSuccessfulOrderId: ORDER1,
        autoRenewingPlan: { autoRenewEnabled: true },
        offerDetails: { basePlanId: "monthly" },
      },
    ],
    ...overrides,
  });
}

function queueDocs(store: MemoryBillingStore) {
  return [...store.docs.entries()].filter(([k]) => k.startsWith("_billingReconciliationQueue/"));
}

function rtdnBody(
  payload: Record<string, unknown>,
  messageId: string,
  eventTimeMillis: number | string = NOW
) {
  return {
    message: {
      messageId,
      data: Buffer.from(
        JSON.stringify({
          packageName: "com.specialsoftwares.vyaamikkdiary",
          eventTimeMillis: String(eventTimeMillis),
          ...payload,
        })
      ).toString("base64"),
    },
  };
}

class FakePlay implements PlayApi {
  sub: GoogleSubscriptionPurchaseV2;
  orders = new Map<string, GoogleOrder>();
  subsByToken = new Map<string, GoogleSubscriptionPurchaseV2>();
  unqueryableTokens = new Set<string>();
  ackCalls = 0;
  ackFailRemaining = 0;
  getSubCalls = 0;
  capturedTokens: string[] = [];

  constructor(sub: GoogleSubscriptionPurchaseV2, order?: GoogleOrder) {
    this.sub = sub;
    if (order?.orderId) this.orders.set(order.orderId, order);
  }

  async getSubscriptionV2(purchaseToken: string): Promise<GoogleSubscriptionPurchaseV2> {
    this.getSubCalls += 1;
    this.capturedTokens.push(purchaseToken);
    if (this.unqueryableTokens.has(purchaseToken)) {
      throw new BillingError({
        clientCode: "verification_failed",
        causeCode: "play_api_not_found",
      });
    }
    const mapped = this.subsByToken.get(purchaseToken);
    if (mapped) return clone(mapped);
    return clone(this.sub);
  }

  async getOrder(orderId: string): Promise<GoogleOrder> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new BillingError({
        clientCode: "verification_failed",
        causeCode: "play_api_not_found",
      });
    }
    return clone(order);
  }

  async acknowledgeSubscription(): Promise<void> {
    if (this.ackFailRemaining > 0) {
      this.ackFailRemaining -= 1;
      throw new BillingError({
        clientCode: "temporary_unavailable",
        causeCode: "play_api_network",
        retryable: true,
      });
    }
    this.ackCalls += 1;
    if (this.sub.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING") {
      this.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
    }
  }
}

function secretsIn(value: unknown): boolean {
  const blob = JSON.stringify(value);
  return (
    blob.includes(TOKEN) ||
    blob.includes(TOKEN2) ||
    blob.includes(LINKED) ||
    blob.includes(EXPIRED_TOKEN)
  );
}

function assertNoSecrets(store: MemoryBillingStore, extra?: unknown): void {
  assert.equal(secretsIn([...store.docs.entries()]), false);
  if (extra !== undefined) assert.equal(secretsIn(extra), false);
}

function historyDocs(store: MemoryBillingStore, uid = UID): Array<[string, unknown]> {
  const prefix = `users/${uid}/subscriptionBillingHistory/`;
  return [...store.docs.entries()].filter(([k]) => k.startsWith(prefix));
}

function auditDocs(store: MemoryBillingStore): Array<[string, unknown]> {
  return [...store.docs.entries()].filter(([k]) => k.startsWith("_subscriptionAuditLog/"));
}

function economicHistory(store: MemoryBillingStore, uid = UID) {
  return historyDocs(store, uid).filter(([, v]) => {
    const type = (v as { type?: string }).type;
    return type === "purchaseActivated" || type === "renewed" || type === "refunded";
  });
}

async function primedDeps(play: FakePlay, handoff?: PostCommitTaxHandoff): Promise<{
  deps: AndroidBillingDeps;
  store: MemoryBillingStore;
  cipher: InMemoryCredentialCipher;
  taxCalls: Array<Parameters<PostCommitTaxHandoff>[0]>;
}> {
  const store = new MemoryBillingStore();
  const cipher = new InMemoryCredentialCipher();
  await handlePrepareAndroidBillingAccount(store, UID, NOW);
  const taxCalls: Array<Parameters<PostCommitTaxHandoff>[0]> = [];
  const deps: AndroidBillingDeps = {
    store,
    play,
    cipher,
    diagnosticUidFor: (uid) => diagnosticUidHmac(SECRET, uid),
    nowMs: () => NOW,
    postCommitTaxHandoff: async (input) => {
      taxCalls.push(input);
      if (handoff) await handoff(input);
    },
  };
  return { deps, store, cipher, taxCalls };
}

async function main() {
  // A. catalog mapping — 9 Android combinations + fail-closed cases
  {
    for (const sku of ALL_CANONICAL_SKUS) {
      const e = SUBSCRIPTION_CATALOG[sku];
      assert.equal(canonicalSkuForAndroid(e.android.productId, e.android.basePlanId), sku);
      const mapped = resolveAndroidCatalogFromLineItem({
        productId: e.android.productId,
        offerDetails: { basePlanId: e.android.basePlanId },
      });
      assert.equal(mapped.canonicalSku, sku);
    }
    assert.equal(canonicalSkuForAndroid("vyd_unknown", "monthly"), null);
    assert.equal(canonicalSkuForAndroid("vyd_professional", "weekly"), null);
    assert.throws(
      () =>
        resolveAndroidCatalogFromLineItem({
          productId: "vyd_professional",
          prepaidPlan: { allowExtendAfterTime: rfc(FUTURE) },
          offerDetails: { basePlanId: "monthly" },
        }),
      isCause("unsupported_prepaid_plan")
    );
    assert.throws(
      () =>
        resolveAndroidCatalogFromLineItem({
          productId: "vyd_professional",
          offerDetails: { basePlanId: "monthly", offerId: "intro-free-trial" },
        }),
      isCause("unsupported_play_offer")
    );
  }

  // C. ownership: prepare / idempotent / collision / match / mismatch / missing / out-of-app
  {
    const store = new MemoryBillingStore();
    const first = await handlePrepareAndroidBillingAccount(store, UID, NOW);
    const again = await handlePrepareAndroidBillingAccount(store, UID, NOW + 5_000);
    assert.equal(first.obfuscatedAccountId, again.obfuscatedAccountId);
    assert.equal(first.obfuscatedAccountId, obfuscatedAccountIdForUid(UID));
    assert.equal(JSON.stringify(first).includes(UID), false);
    const path = playAccountIndexPath(first.obfuscatedAccountId);
    const doc = store.docs.get(path) as { uid: string };
    assert.equal(doc.uid, UID);
    store.docs.set(path, { uid: OTHER, createdAt: NOW, updatedAt: NOW });
    await assert.rejects(
      handlePrepareAndroidBillingAccount(store, UID, NOW + 10_000),
      isCause("play_account_index_collision")
    );

    const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
    const { deps } = await primedDeps(play);
    await handlePrepareAndroidBillingAccount(deps.store, OTHER, NOW);
    play.sub.externalAccountIdentifiers = {
      obfuscatedExternalAccountId: obfuscatedAccountIdForUid(OTHER),
    };
    await assert.rejects(
      processAndroidPurchaseToken(deps, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      }),
      isCause("play_account_owner_mismatch")
    );

    play.sub.externalAccountIdentifiers = {};
    play.sub.outOfAppPurchaseContext = undefined;
    await assert.rejects(
      processAndroidPurchaseToken(deps, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      }),
      isCause("missing_obfuscated_account_id")
    );

    const outOfApp = new FakePlay(
      activeSub({
        externalAccountIdentifiers: {},
        outOfAppPurchaseContext: {
          expiredExternalAccountIdentifiers: {
            obfuscatedExternalAccountId: obfuscatedAccountIdForUid(UID),
          },
        },
      }),
      paidOrder(ORDER1, "249")
    );
    const out = await primedDeps(outOfApp);
    const owned = await processAndroidPurchaseToken(out.deps, {
      purchaseToken: TOKEN,
      callerUid: UID,
      source: "androidValidation",
      eventSource: "callable",
    });
    assert.equal(owned.uid, UID);
    assert.equal(owned.to?.entitlementActive, true);
  }

  // E. ACTIVE initial purchase + Order.total + ack-after-durable + tax handoff
  {
    const play = new FakePlay(activeSub(), paidOrder(ORDER1, "1", 10_000_000));
    const { deps, store, taxCalls } = await primedDeps(play);
    const result = await handleValidateAndActivateAndroid(deps, {
      uid: UID,
      purchaseToken: TOKEN,
      expectedCanonicalSku: "vyd_professional_monthly",
    });
    assert.equal(result.to?.billingStatus, "active");
    assert.equal(result.to?.entitlementActive, true);
    assert.equal(result.to?.plan, "professional");
    assert.equal(result.financialEventWritten, true);
    assert.equal(result.acknowledged, true);
    assert.equal(play.ackCalls, 1);
    assert.equal(play.getSubCalls, 1);
    const ledger = store.docs.get(
      financialLedgerPath(sanitizeDocId("android:purchase:GPA.3311-PLAY-1"))
    ) as { grossAmountInPaise: number; actualPlatformCommissionInPaise: null; eventType: string };
    assert.equal(ledger.eventType, "purchase");
    assert.equal(ledger.grossAmountInPaise, 101, "gross must be Order.total (₹1.01), not catalog 24900");
    assert.equal(ledger.actualPlatformCommissionInPaise, null);
    assert.equal(ledger.estimatedPlatformCommissionInPaise, null);
    assert.equal(taxCalls.length, 1);
    assert.equal(taxCalls[0].financialEventWritten, true);
    assert.equal(taxCalls[0].eventType, "purchase");
    const company = store.docs.get(companyBillingPath(UID)) as CompanyBillingDoc;
    assert.equal(company.credentialFingerprint, credentialFingerprint(TOKEN));
    assert.ok(company.encryptedPurchaseCredential);
    const credIndex = store.docs.get(playCredentialIndexPath(credentialFingerprint(TOKEN))) as {
      uid: string;
    };
    assert.equal(credIndex.uid, UID);
    assertNoSecrets(store, result);
  }

  // D + AD. credential secrecy + linked token fingerprint
  {
    const play = new FakePlay(
      activeSub({ linkedPurchaseToken: LINKED }),
      paidOrder(ORDER1, "249")
    );
    const { deps, store } = await primedDeps(play);
    await processAndroidPurchaseToken(deps, {
      purchaseToken: TOKEN2,
      callerUid: UID,
      source: "androidValidation",
      eventSource: "callable",
    });
    const company = store.docs.get(companyBillingPath(UID)) as CompanyBillingDoc;
    assert.equal(company.credentialFingerprint, credentialFingerprint(TOKEN2));
    assert.ok(company.invalidatedCredentialFingerprints.includes(credentialFingerprint(LINKED)));
    assertNoSecrets(store);
    play.sub.linkedPurchaseToken = undefined;
    play.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
    await assert.rejects(
      processAndroidPurchaseToken(deps, {
        purchaseToken: LINKED,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      }),
      isCause("invalidated_purchase_token")
    );
  }

  // F + AA. renewal + duplicate callable/RTDN does not double-write
  {
    const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
    const { deps, store, taxCalls } = await primedDeps(play);
    const first = await processAndroidPurchaseToken(deps, {
      purchaseToken: TOKEN,
      callerUid: UID,
      source: "androidValidation",
      eventSource: "callable",
    });
    play.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
    play.sub.lineItems![0].latestSuccessfulOrderId = ORDER2;
    play.orders.set(ORDER2, paidOrder(ORDER2, "249"));
    const renewal = await processAndroidPurchaseToken(deps, {
      purchaseToken: TOKEN,
      source: "rtdn",
      eventSource: "webhook",
    });
    assert.equal(first.financialEventWritten, true);
    assert.equal(renewal.financialEventWritten, true);
    assert.equal(renewal.to?.billingStatus, "active");
    assert.equal(economicHistory(store).length, 2);
    const rtdnDup = await processAndroidPurchaseToken(deps, {
      purchaseToken: TOKEN,
      source: "rtdn",
      eventSource: "webhook",
    });
    const callableDup = await processAndroidPurchaseToken(deps, {
      purchaseToken: TOKEN,
      callerUid: UID,
      source: "androidValidation",
      eventSource: "callable",
    });
    assert.equal(rtdnDup.financialEventWritten, false);
    assert.equal(callableDup.financialEventWritten, false);
    assert.equal(economicHistory(store).length, 2);
    const ledgers = [...store.docs.keys()].filter((k) => k.startsWith("_billingEventLedger/"));
    assert.equal(ledgers.length, 2);
    assert.ok(store.docs.has(financialLedgerPath(sanitizeDocId(`android:purchase:${ORDER1}`))));
    assert.ok(store.docs.has(financialLedgerPath(sanitizeDocId(`android:renewal:${ORDER2}`))));
    const purchaseHandoffs = taxCalls.filter((c) => c.eventType === "purchase");
    const renewalHandoffs = taxCalls.filter((c) => c.eventType === "renewal");
    assert.equal(purchaseHandoffs.filter((c) => c.financialEventWritten).length, 1);
    assert.equal(renewalHandoffs.filter((c) => c.financialEventWritten).length, 1);

    const raced = await primedDeps(new FakePlay(activeSub(), paidOrder(ORDER1, "249")));
    const [a, b] = await Promise.all([
      processAndroidPurchaseToken(raced.deps, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      }),
      processAndroidPurchaseToken(raced.deps, {
        purchaseToken: TOKEN,
        source: "rtdn",
        eventSource: "webhook",
      }),
    ]);
    const written = [a, b].filter((r) => r.financialEventWritten).length;
    assert.equal(written, 1);
    assert.equal(
      [...raced.store.docs.keys()].filter((k) => k.startsWith("_billingEventLedger/")).length,
      1
    );
  }

  // G + H + U. Google state mapping
  async function stateCase(
    state: string,
    expect: { status: string; entitled: boolean; skipped?: string }
  ) {
    const play = new FakePlay(activeSub({ subscriptionState: state }), paidOrder(ORDER1, "249"));
    if (state !== "SUBSCRIPTION_STATE_ACTIVE") {
      play.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
    }
    const { deps } = await primedDeps(play);
    const result = await processAndroidPurchaseToken(deps, {
      purchaseToken: TOKEN,
      callerUid: UID,
      source: "rtdn",
      eventSource: "webhook",
    });
    if (expect.skipped) {
      assert.equal(result.skipped, expect.skipped);
      assert.equal(result.to, null);
      return result;
    }
    assert.equal(result.to?.billingStatus, expect.status);
    assert.equal(result.to?.entitlementActive, expect.entitled);
    assert.equal(result.googleSubscriptionState, state);
    return result;
  }

  await stateCase("SUBSCRIPTION_STATE_PENDING", { status: "expired", entitled: false, skipped: "pending" });
  await stateCase("SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED", {
    status: "expired",
    entitled: false,
    skipped: "pending_purchase_canceled",
  });
  await stateCase("SUBSCRIPTION_STATE_ACTIVE", { status: "active", entitled: true });
  await stateCase("SUBSCRIPTION_STATE_IN_GRACE_PERIOD", { status: "grace", entitled: true });
  await stateCase("SUBSCRIPTION_STATE_ON_HOLD", { status: "onHold", entitled: false });
  const paused = await stateCase("SUBSCRIPTION_STATE_PAUSED", { status: "onHold", entitled: false });
  assert.equal(paused.googleSubscriptionState, "SUBSCRIPTION_STATE_PAUSED");
  const canceled = await stateCase("SUBSCRIPTION_STATE_CANCELED", { status: "cancelled", entitled: true });
  assert.equal(canceled.to?.entitlementActive, true, "Phase B retains access until period end");
  await stateCase("SUBSCRIPTION_STATE_EXPIRED", { status: "expired", entitled: false });

  {
    const play = new FakePlay(activeSub({ subscriptionState: "SUBSCRIPTION_STATE_WEIRD" }), paidOrder(ORDER1, "249"));
    const { deps } = await primedDeps(play);
    await assert.rejects(
      processAndroidPurchaseToken(deps, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "rtdn",
        eventSource: "webhook",
      }),
      isCause("unknown_google_subscription_state")
    );
  }

  // Recovered / restarted / deferred: live ACTIVE restores access
  for (const notificationType of [1, 7, 9]) {
    const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
    const { deps, store } = await primedDeps(play);
    const handled = await handleAndroidRtdn(
      deps,
      rtdnBody(
        { subscriptionNotification: { notificationType, purchaseToken: TOKEN } },
        `msg-restore-${notificationType}`
      )
    );
    assert.equal(handled.billing?.to?.billingStatus, "active");
    assert.equal(handled.billing?.to?.entitlementActive, true);
    assertNoSecrets(store, handled);
  }

  // I. stale reconciliation
  {
    const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
    const { deps, store } = await primedDeps(play);
    await processAndroidPurchaseToken(deps, {
      purchaseToken: TOKEN,
      callerUid: UID,
      source: "androidValidation",
      eventSource: "callable",
    });
    const older = { ...deps, nowMs: () => NOW - 60_000 };
    play.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
    play.sub.lineItems![0].latestSuccessfulOrderId = ORDER2;
    play.orders.set(ORDER2, paidOrder(ORDER2, "249"));
    await assert.rejects(
      processAndroidPurchaseToken(older, {
        purchaseToken: TOKEN,
        source: "rtdn",
        eventSource: "webhook",
      }),
      isCause("stale_platform_state")
    );
    assert.equal(
      [...store.docs.keys()].filter((k) => k.startsWith("_billingEventLedger/")).length,
      1
    );
  }

  // J. ack pending / already ack / fail then retry without duplicate
  {
    const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
    play.ackFailRemaining = 1;
    const { deps, store } = await primedDeps(play);
    await assert.rejects(
      processAndroidPurchaseToken(deps, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      }),
      isCause("google_ack_failed")
    );
    assert.equal(
      [...store.docs.keys()].filter((k) => k.startsWith("_billingEventLedger/")).length,
      1
    );
    const status = store.docs.get(`users/${UID}/subscription/status`) as { entitlementActive: boolean };
    assert.equal(status.entitlementActive, true);
    const retry = await processAndroidPurchaseToken(deps, {
      purchaseToken: TOKEN,
      callerUid: UID,
      source: "androidValidation",
      eventSource: "callable",
    });
    assert.equal(retry.financialEventWritten, false);
    assert.equal(retry.acknowledged, true);
    assert.equal(play.ackCalls, 1);
    assert.equal(
      [...store.docs.keys()].filter((k) => k.startsWith("_billingEventLedger/")).length,
      1
    );

    play.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
    const already = await processAndroidPurchaseToken(deps, {
      purchaseToken: TOKEN,
      callerUid: UID,
      source: "androidValidation",
      eventSource: "callable",
    });
    assert.equal(already.acknowledged, false);
  }

  // K. RTDN OIDC
  {
    const expected = {
      audience: "https://asia-south1-demo.cloudfunctions.net/androidRtdn",
      serviceAccountEmail: "rtdn-push@demo.iam.gserviceaccount.com",
    };
    const verifier: OidcTokenVerifier = {
      async verifyIdToken({ idToken }) {
        if (idToken === "bad-signature") throw new Error("sig");
        return JSON.parse(idToken) as {
          iss?: string;
          aud?: string;
          email?: string;
          email_verified?: boolean;
        };
      },
    };
    const good = JSON.stringify({
      iss: "https://accounts.google.com",
      aud: expected.audience,
      email: expected.serviceAccountEmail,
      email_verified: true,
    });
    await verifyPubSubPushOidc(verifier, `Bearer ${good}`, expected);
    await assert.rejects(verifyPubSubPushOidc(verifier, undefined, expected), isCause("rtdn_unauthenticated"));
    await assert.rejects(
      verifyPubSubPushOidc(verifier, "Bearer bad-signature", expected),
      isCause("rtdn_oidc_invalid")
    );
    const wrongAud = JSON.stringify({
      iss: "https://accounts.google.com",
      aud: "https://other",
      email: expected.serviceAccountEmail,
      email_verified: true,
    });
    await assert.rejects(
      verifyPubSubPushOidc(verifier, `Bearer ${wrongAud}`, expected),
      isCause("rtdn_oidc_invalid")
    );
    const wrongSa = JSON.stringify({
      iss: "https://accounts.google.com",
      aud: expected.audience,
      email: "other@demo.iam.gserviceaccount.com",
      email_verified: true,
    });
    await assert.rejects(
      verifyPubSubPushOidc(verifier, `Bearer ${wrongSa}`, expected),
      isCause("rtdn_oidc_invalid")
    );
    const unverified = JSON.stringify({
      iss: "https://accounts.google.com",
      aud: expected.audience,
      email: expected.serviceAccountEmail,
      email_verified: false,
    });
    await assert.rejects(
      verifyPubSubPushOidc(verifier, `Bearer ${unverified}`, expected),
      isCause("rtdn_oidc_invalid")
    );

    const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
    const { deps } = await primedDeps(play);
    const pubsub = {
      message: {
        messageId: "oidc-1",
        data: Buffer.from(
          JSON.stringify({
            packageName: "com.specialsoftwares.vyaamikkdiary",
            testNotification: { version: "1.0" },
          })
        ).toString("base64"),
      },
    };
    const http = await handleAndroidRtdnHttp({
      authorizationHeader: `Bearer ${good}`,
      body: pubsub,
      deps,
      oidcVerifier: verifier,
      playBillingEnabled: true,
      oidcExpected: expected,
    });
    assert.equal(http.status, 200);
    assert.equal(http.body.action, "test_notification");
  }

  // L. RTDN envelope / package / duplicate / live-state / test / one-time
  {
    const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
    const { deps, store } = await primedDeps(play);
    await assert.rejects(handleAndroidRtdn(deps, { no: "message" }), isCause("rtdn_malformed"));
    await assert.rejects(
      handleAndroidRtdn(deps, { message: { messageId: "x", data: "%%%not-base64%%%" } }),
      isCause("rtdn_invalid_base64")
    );
    await assert.rejects(
      handleAndroidRtdn(deps, {
        message: {
          messageId: "pkg",
          data: Buffer.from(JSON.stringify({ packageName: "com.other.app", testNotification: {} })).toString(
            "base64"
          ),
        },
      }),
      isCause("rtdn_wrong_package")
    );

    const liveActive = await handleAndroidRtdn(
      deps,
      rtdnBody(
        { subscriptionNotification: { notificationType: 3, purchaseToken: TOKEN } },
        "note-canceled"
      )
    );
    assert.equal(liveActive.billing?.to?.billingStatus, "active");
    assert.equal(play.getSubCalls >= 1, true, "RTDN must refetch subscriptionsv2");

    const duplicate = await handleAndroidRtdn(
      deps,
      rtdnBody(
        { subscriptionNotification: { notificationType: 3, purchaseToken: TOKEN } },
        "note-canceled"
      )
    );
    assert.equal(duplicate.billing?.financialEventWritten, false);
    assert.equal(
      [...store.docs.keys()].filter((k) => k.startsWith("_billingEventLedger/")).length,
      1
    );

    play.sub.subscriptionState = "SUBSCRIPTION_STATE_EXPIRED";
    play.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
    const liveExpired = await handleAndroidRtdn(
      deps,
      rtdnBody(
        { subscriptionNotification: { notificationType: 4, purchaseToken: TOKEN } },
        "note-purchased"
      )
    );
    assert.equal(liveExpired.billing?.to?.billingStatus, "expired");
    assert.equal(liveExpired.billing?.to?.entitlementActive, false);

    const before = store.docs.size;
    const testN = await handleAndroidRtdn(deps, {
      message: {
        messageId: "test-1",
        data: Buffer.from(
          JSON.stringify({
            packageName: "com.specialsoftwares.vyaamikkdiary",
            testNotification: { version: "1.0" },
          })
        ).toString("base64"),
      },
    });
    assert.equal(testN.action, "test_notification");
    assert.equal(store.docs.size, before);

    const oneTime = await handleAndroidRtdn(deps, {
      message: {
        messageId: "iap-1",
        data: Buffer.from(
          JSON.stringify({
            packageName: "com.specialsoftwares.vyaamikkdiary",
            oneTimeProductNotification: { notificationType: 1, sku: "coins", purchaseToken: TOKEN },
          })
        ).toString("base64"),
      },
    });
    assert.equal(oneTime.action, "one_time_product_ignored");
    assert.equal(store.docs.size, before);

    const bundlePlay = new FakePlay(
      activeSub({
        lineItems: [
          { productId: "vyd_professional", expiryTime: rfc(FUTURE), offerDetails: { basePlanId: "monthly" } },
          { productId: "vyd_starter", expiryTime: rfc(FUTURE), offerDetails: { basePlanId: "monthly" } },
        ],
      }),
      paidOrder(ORDER1, "249")
    );
    const bundle = await primedDeps(bundlePlay);
    await assert.rejects(
      processAndroidPurchaseToken(bundle.deps, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      }),
      isCause("unsupported_subscription_bundle")
    );
  }

  // M. void / refund
  {
    const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
    const { deps, store, taxCalls } = await primedDeps(play);
    await processAndroidPurchaseToken(deps, {
      purchaseToken: TOKEN,
      callerUid: UID,
      source: "androidValidation",
      eventSource: "callable",
    });
    play.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
    play.orders.set(ORDER1, refundedOrder(play.orders.get(ORDER1)!, rfc(NOW)));
    const refunded = await processAndroidVoidedPurchase(deps, {
      purchaseToken: TOKEN,
      orderId: ORDER1,
      productType: 1,
      refundType: 1,
      source: "rtdn",
      eventTimeMillis: NOW,
    });
    assert.equal(refunded.financialEventWritten, true);
    assert.equal(refunded.to?.entitlementActive, true, "active-after-refund must not revoke");
    assert.equal(refunded.to?.billingStatus, "active");
    const refundLedger = store.docs.get(
      financialLedgerPath(sanitizeDocId(`android:refund:${ORDER1}`))
    ) as { relatedFinancialEventId: string; eventType: string; grossAmountInPaise: number };
    assert.equal(refundLedger.eventType, "refund");
    assert.equal(refundLedger.relatedFinancialEventId, `android:purchase:${ORDER1}`);
    assert.equal(refundLedger.grossAmountInPaise, 24_900);
    assert.equal(taxCalls.filter((c) => c.eventType === "refund" && c.financialEventWritten).length, 1);

    const dup = await processAndroidVoidedPurchase(deps, {
      purchaseToken: TOKEN,
      orderId: ORDER1,
      productType: 1,
      refundType: 1,
      source: "rtdn",
      eventTimeMillis: NOW,
    });
    assert.equal(dup.financialEventWritten, false);
    assert.equal(
      [...store.docs.keys()].filter((k) => k.startsWith("_billingEventLedger/")).length,
      2
    );

    await assert.rejects(
      processAndroidVoidedPurchase(deps, {
        purchaseToken: TOKEN,
        orderId: ORDER1,
        productType: 1,
        refundType: 2,
        source: "rtdn",
        eventTimeMillis: NOW,
      }),
      isCause("unsupported_partial_refund")
    );

    const expiredPlay = new FakePlay(
      activeSub({ subscriptionState: "SUBSCRIPTION_STATE_EXPIRED" }),
      paidOrder(ORDER2, "249")
    );
    expiredPlay.orders.set(ORDER1, paidOrder(ORDER1, "249"));
    const expired = await primedDeps(expiredPlay);
    await processAndroidPurchaseToken(
      { ...expired.deps, play: new FakePlay(activeSub(), paidOrder(ORDER1, "249")) },
      {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      }
    );
    const expPlay = expired.deps.play as FakePlay;
    expPlay.sub = activeSub({
      subscriptionState: "SUBSCRIPTION_STATE_EXPIRED",
      acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
    });
    expPlay.orders.set(ORDER1, refundedOrder(paidOrder(ORDER1, "249"), rfc(NOW)));
    const revoked = await processAndroidVoidedPurchase(expired.deps, {
      purchaseToken: TOKEN,
      orderId: ORDER1,
      productType: 1,
      refundType: 1,
      source: "rtdn",
      eventTimeMillis: NOW,
    });
    assert.equal(revoked.to?.entitlementActive, false);
    assert.equal(revoked.to?.billingStatus, "expired");

    await assert.rejects(
      handleAndroidRtdn(deps, {
        message: {
          messageId: "pending-review",
          data: Buffer.from(
            JSON.stringify({
              packageName: "com.specialsoftwares.vyaamikkdiary",
              pendingRefundReviewNotification: { pendingRefundToken: "PENDING_REFUND_TOKEN_SECRET" },
            })
          ).toString("base64"),
        },
      }),
      isCause("pending_refund_review_unimplemented")
    );
    const blob = JSON.stringify([...store.docs.entries()]);
    assert.equal(blob.includes("PENDING_REFUND_TOKEN_SECRET"), false);
  }

  // N. rate limit 5/min then 6th then next window
  {
    const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
    const { deps } = await primedDeps(play);
    play.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
    for (let i = 0; i < 5; i += 1) {
      await handleValidateAndActivateAndroid(deps, { uid: UID, purchaseToken: TOKEN });
    }
    await assert.rejects(
      handleValidateAndActivateAndroid(deps, { uid: UID, purchaseToken: TOKEN }),
      (e: unknown) => e instanceof BillingError && e.clientCode === "rate_limited"
    );
    const later = { ...deps, nowMs: () => NOW + 60_000 };
    const nextWindow = await handleValidateAndActivateAndroid(later, { uid: UID, purchaseToken: TOKEN });
    assert.equal(nextWindow.alreadyProcessed, true);
  }

  // SKU hint mismatch + Play API retryable status
  {
    const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
    const { deps } = await primedDeps(play);
    await assert.rejects(
      handleValidateAndActivateAndroid(deps, {
        uid: UID,
        purchaseToken: TOKEN,
        expectedCanonicalSku: "vyd_starter_monthly",
      }),
      isCause("sku_hint_mismatch")
    );
  }
  {
    const client = new PlayApiClient({
      getAccessToken: async () => "adc-token",
      fetchImpl: async () => ({ status: 429, ok: false }),
    });
    await assert.rejects(client.getSubscriptionV2(TOKEN), (e: unknown) => {
      assert.ok(e instanceof BillingError);
      assert.equal(e.retryable, true);
      assert.equal(JSON.stringify(e).includes(TOKEN), false);
      return e.causeCode === "play_api_temporary_unavailable";
    });
  }

  // Round-1: API-realistic Order JSON + fail-closed paid order fields
  {
    const raw = {
      orderId: ORDER1,
      state: "PROCESSED",
      createTime: rfc(NOW),
      total: { currencyCode: "INR", units: "249", nanos: 0 },
      purchaseToken: TOKEN,
      packageName: "com.specialsoftwares.vyaamikkdiary",
      buyerAddress: { buyerCountry: "IN", buyerState: "KA", buyerPostcode: "560001" },
      subscriptionDetails: { basePlanId: "SHOULD_BE_IGNORED" },
      lineItems: [
        {
          productId: "vyd_professional",
          total: { currencyCode: "INR", units: "249", nanos: 0 },
          purchaseToken: TOKEN,
          subscriptionDetails: {
            basePlanId: "monthly",
            servicePeriodStartTime: rfc(NOW),
            servicePeriodEndTime: rfc(FUTURE),
          },
        },
      ],
      orderHistory: {
        processedEvent: { eventTime: rfc(NOW) },
        purchaseToken: TOKEN,
      },
    };
    const sanitized = sanitizePlayOrder(raw);
    assert.equal("packageName" in sanitized, false);
    assert.equal("subscriptionDetails" in sanitized, false);
    assert.equal(JSON.stringify(sanitized).includes(TOKEN), false);
    assert.equal(sanitized.lineItems?.[0]?.subscriptionDetails?.basePlanId, "monthly");
    assert.equal(sanitized.orderHistory?.processedEvent?.eventTime, rfc(NOW));
    assert.equal("buyerAddress" in sanitized, false);
    assertPaidSubscriptionOrder({
      order: sanitized,
      expectedOrderId: ORDER1,
      productId: "vyd_professional",
      basePlanId: "monthly",
    });

    const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
    const { deps } = await primedDeps(play);
    const missing = [
      ["missing_order_id", { ...paidOrder(ORDER1, "249"), orderId: undefined }],
      ["missing_order_line_items", { ...paidOrder(ORDER1, "249"), lineItems: [] }],
      [
        "missing_order_subscription_details",
        {
          ...paidOrder(ORDER1, "249"),
          lineItems: [{ productId: "vyd_professional", total: { currencyCode: "INR", units: "249", nanos: 0 } }],
        },
      ],
      [
        "missing_order_base_plan",
        {
          ...paidOrder(ORDER1, "249"),
          lineItems: [
            {
              productId: "vyd_professional",
              total: { currencyCode: "INR", units: "249", nanos: 0 },
              subscriptionDetails: { servicePeriodStartTime: rfc(NOW) },
            },
          ],
        },
      ],
      ["missing_order_processed_event", { ...paidOrder(ORDER1, "249"), orderHistory: {} }],
    ] as const;
    for (const [cause, order] of missing) {
      play.orders.set(ORDER1, order);
      await assert.rejects(
        processAndroidPurchaseToken(deps, {
          purchaseToken: TOKEN,
          callerUid: UID,
          source: "androidValidation",
          eventSource: "callable",
        }),
        isCause(cause)
      );
    }
  }

  // Round-1: source-independent economic identity callable ↔ RTDN
  {
    async function oneHistoryBothOrders(first: "callable" | "rtdn") {
      const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
      const { deps, store } = await primedDeps(play);
      const callable = () =>
        processAndroidPurchaseToken(deps, {
          purchaseToken: TOKEN,
          callerUid: UID,
          source: "androidValidation",
          eventSource: "callable",
        });
      const webhook = () =>
        processAndroidPurchaseToken(deps, {
          purchaseToken: TOKEN,
          source: "rtdn",
          eventSource: "webhook",
          eventTimeMillis: NOW,
        });
      if (first === "callable") {
        await callable();
        play.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
        await webhook();
      } else {
        await webhook();
        play.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
        await callable();
      }
      assert.equal(
        [...store.docs.keys()].filter((k) => k.startsWith("_billingEventLedger/")).length,
        1
      );
      const purchased = historyDocs(store).filter(([, v]) => (v as { type?: string }).type === "purchaseActivated");
      assert.equal(purchased.length, 1);
      const semanticAudits = auditDocs(store).filter(([, v]) => {
        const detail = (v as { detail?: { kind?: string } }).detail;
        return detail?.kind === "activatePaid";
      });
      assert.equal(semanticAudits.length, 1);
      const status = store.docs.get(`users/${UID}/subscription/status`) as SubscriptionStatusDoc;
      assert.equal(status.billingStatus, "active");
      assertNoSecrets(store);
    }
    await oneHistoryBothOrders("callable");
    await oneHistoryBothOrders("rtdn");
  }

  // Round-1: missed purchase → CANCELED backfills ledger then cancels
  {
    const play = new FakePlay(
      activeSub({
        subscriptionState: "SUBSCRIPTION_STATE_CANCELED",
        acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
      }),
      paidOrder(ORDER1, "249")
    );
    const { deps, store } = await primedDeps(play);
    const cancelAt = NOW - 2 * DAY;
    const result = await processAndroidPurchaseToken(deps, {
      purchaseToken: TOKEN,
      source: "rtdn",
      eventSource: "webhook",
      eventTimeMillis: cancelAt,
    });
    assert.equal(result.financialEventWritten, true);
    assert.equal(result.to?.billingStatus, "cancelled");
    assert.equal(result.to?.entitlementActive, true);
    assert.equal(result.to?.cancelledAt, cancelAt);
    assert.notEqual(result.to?.cancelledAt, result.to?.currentPeriodEnd);
    assert.equal(result.to?.currentPeriodEnd, FUTURE);
    assert.equal(result.acknowledged, true);
    assert.equal(play.ackCalls, 1);
    assert.ok(store.docs.has(financialLedgerPath(sanitizeDocId(`android:purchase:${ORDER1}`))));
  }

  // Round-1: purchase processed then GRACE does not duplicate financials
  {
    const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
    const { deps, store } = await primedDeps(play);
    await processAndroidPurchaseToken(deps, {
      purchaseToken: TOKEN,
      callerUid: UID,
      source: "androidValidation",
      eventSource: "callable",
    });
    play.sub.subscriptionState = "SUBSCRIPTION_STATE_IN_GRACE_PERIOD";
    play.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
    const grace = await processAndroidPurchaseToken(deps, {
      purchaseToken: TOKEN,
      source: "rtdn",
      eventSource: "webhook",
      eventTimeMillis: NOW + 1000,
    });
    assert.equal(grace.financialEventWritten, false);
    assert.equal(grace.to?.billingStatus, "grace");
    assert.equal(
      [...store.docs.keys()].filter((k) => k.startsWith("_billingEventLedger/")).length,
      1
    );
  }

  // Round-1: missed renewal → HOLD backfills renewal once
  {
    const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
    const { deps, store } = await primedDeps(play);
    await processAndroidPurchaseToken(deps, {
      purchaseToken: TOKEN,
      callerUid: UID,
      source: "androidValidation",
      eventSource: "callable",
    });
    play.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
    play.sub.subscriptionState = "SUBSCRIPTION_STATE_ON_HOLD";
    play.sub.lineItems![0].latestSuccessfulOrderId = ORDER2;
    play.orders.set(ORDER2, paidOrder(ORDER2, "249"));
    const held = await processAndroidPurchaseToken(deps, {
      purchaseToken: TOKEN,
      source: "rtdn",
      eventSource: "webhook",
      eventTimeMillis: NOW + 2000,
    });
    assert.equal(held.financialEventWritten, true);
    assert.equal(held.to?.billingStatus, "onHold");
    assert.ok(store.docs.has(financialLedgerPath(sanitizeDocId(`android:renewal:${ORDER2}`))));
    const again = await processAndroidPurchaseToken(deps, {
      purchaseToken: TOKEN,
      source: "rtdn",
      eventSource: "webhook",
      eventTimeMillis: NOW + 2000,
    });
    assert.equal(again.financialEventWritten, false);
    assert.equal(
      [...store.docs.keys()].filter((k) => k.startsWith("_billingEventLedger/")).length,
      2
    );
  }

  // Round-1: renewal on same token does not re-ack
  {
    const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
    const { deps } = await primedDeps(play);
    await processAndroidPurchaseToken(deps, {
      purchaseToken: TOKEN,
      callerUid: UID,
      source: "androidValidation",
      eventSource: "callable",
    });
    assert.equal(play.ackCalls, 1);
    play.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_PENDING";
    play.sub.lineItems![0].latestSuccessfulOrderId = ORDER2;
    play.orders.set(ORDER2, paidOrder(ORDER2, "249"));
    const renewal = await processAndroidPurchaseToken(deps, {
      purchaseToken: TOKEN,
      callerUid: UID,
      source: "androidValidation",
      eventSource: "callable",
    });
    assert.equal(renewal.financialEventWritten, true);
    assert.equal(renewal.acknowledged, false);
    assert.equal(play.ackCalls, 1);
  }

  // Round-1: September purchase / October refund month keys
  {
    const sep = Date.parse("2026-09-15T00:00:00+05:30");
    const oct = Date.parse("2026-10-15T00:00:00+05:30");
    const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249", 0, rfc(sep)));
    const { deps, store } = await primedDeps(play);
    const timed = { ...deps, nowMs: () => sep };
    await processAndroidPurchaseToken(timed, {
      purchaseToken: TOKEN,
      callerUid: UID,
      source: "androidValidation",
      eventSource: "callable",
    });
    play.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
    play.orders.set(ORDER1, refundedOrder(play.orders.get(ORDER1)!, rfc(oct)));
    const refunded = await processAndroidVoidedPurchase(
      { ...timed, nowMs: () => oct },
      {
        purchaseToken: TOKEN,
        orderId: ORDER1,
        productType: 1,
        refundType: 1,
        source: "rtdn",
        eventTimeMillis: oct,
      }
    );
    assert.equal(refunded.financialEventWritten, true);
    const purchaseLedger = store.docs.get(
      financialLedgerPath(sanitizeDocId(`android:purchase:${ORDER1}`))
    ) as { monthKey: string; occurredAt: number };
    const refundLedger = store.docs.get(
      financialLedgerPath(sanitizeDocId(`android:refund:${ORDER1}`))
    ) as { monthKey: string; occurredAt: number };
    assert.equal(purchaseLedger.monthKey, "2026-09");
    assert.equal(refundLedger.monthKey, "2026-10");
    assert.equal(istMonthKeyForMillis(purchaseLedger.occurredAt), "2026-09");
    assert.equal(istMonthKeyForMillis(refundLedger.occurredAt), "2026-10");
    assert.equal(refundLedger.occurredAt, oct);
  }

  // Round-1: historical refund does not overwrite current latestOrderId
  {
    const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
    const { deps, store } = await primedDeps(play);
    await processAndroidPurchaseToken(deps, {
      purchaseToken: TOKEN,
      callerUid: UID,
      source: "androidValidation",
      eventSource: "callable",
    });
    play.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
    play.sub.lineItems![0].latestSuccessfulOrderId = ORDER2;
    play.orders.set(ORDER2, paidOrder(ORDER2, "249"));
    await processAndroidPurchaseToken(deps, {
      purchaseToken: TOKEN,
      callerUid: UID,
      source: "androidValidation",
      eventSource: "callable",
    });
    const before = store.docs.get(companyBillingPath(UID)) as CompanyBillingDoc;
    const statusBefore = store.docs.get(`users/${UID}/subscription/status`) as SubscriptionStatusDoc;
    assert.equal(before.latestOrderId, ORDER2);
    play.orders.set(ORDER1, refundedOrder(play.orders.get(ORDER1)!, rfc(NOW + 5000)));
    const refunded = await processAndroidVoidedPurchase(deps, {
      purchaseToken: TOKEN,
      orderId: ORDER1,
      productType: 1,
      refundType: 1,
      source: "rtdn",
      eventTimeMillis: NOW + 5000,
    });
    assert.equal(refunded.financialEventWritten, true);
    assert.equal(refunded.to?.entitlementActive, true);
    assert.equal(refunded.to?.billingStatus, "active");
    const company = store.docs.get(companyBillingPath(UID)) as CompanyBillingDoc;
    const status = store.docs.get(`users/${UID}/subscription/status`) as SubscriptionStatusDoc;
    assert.equal(company.latestOrderId, ORDER2);
    assert.equal(status.currentPeriodEnd, statusBefore.currentPeriodEnd);
    assert.equal(status.currentPeriodStart, statusBefore.currentPeriodStart);
    assert.equal(status.autoRenewing, true);
    const refundLedger = store.docs.get(
      financialLedgerPath(sanitizeDocId(`android:refund:${ORDER1}`))
    ) as { relatedFinancialEventId: string };
    assert.equal(refundLedger.relatedFinancialEventId, `android:purchase:${ORDER1}`);
  }

  // Round-1: expired-token refund still records financials without fabricating state
  {
    const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
    const { deps, store } = await primedDeps(play);
    await processAndroidPurchaseToken(deps, {
      purchaseToken: TOKEN,
      callerUid: UID,
      source: "androidValidation",
      eventSource: "callable",
    });
    play.orders.set(ORDER1, refundedOrder(play.orders.get(ORDER1)!, rfc(NOW + 8000)));
    play.unqueryableTokens.add(TOKEN);
    const refunded = await processAndroidVoidedPurchase(deps, {
      purchaseToken: TOKEN,
      orderId: ORDER1,
      productType: 1,
      refundType: 1,
      source: "rtdn",
      eventTimeMillis: NOW + 8000,
    });
    assert.equal(refunded.financialEventWritten, true);
    assert.equal(refunded.reconciliationRequired, true);
    assert.equal(refunded.to?.billingStatus, "active");
    assert.ok(store.docs.has(financialLedgerPath(sanitizeDocId(`android:refund:${ORDER1}`))));
    assert.equal(queueDocs(store).length, 1);
    assert.ok(
      store.docs.has(billingReconciliationQueuePath(sanitizeDocId(`android:refund-reconcile:${ORDER1}`)))
    );
    assertNoSecrets(store, refunded);
  }

  // Round-1: PENDING without owned-period fields; PPC linked-token reconcile
  {
    const pendingPlay = new FakePlay(
      {
        subscriptionState: "SUBSCRIPTION_STATE_PENDING",
        acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
        lineItems: [{ productId: "vyd_professional", offerDetails: { basePlanId: "monthly" } }],
        externalAccountIdentifiers: { obfuscatedExternalAccountId: obfuscatedAccountIdForUid(UID) },
      },
      paidOrder(ORDER1, "249")
    );
    const pending = await primedDeps(pendingPlay);
    const skipped = await processAndroidPurchaseToken(pending.deps, {
      purchaseToken: TOKEN,
      callerUid: UID,
      source: "androidValidation",
      eventSource: "callable",
    });
    assert.equal(skipped.skipped, "pending");
    assert.equal(skipped.to, null);
    assert.equal(skipped.acknowledged, false);
    assert.equal(skipped.financialEventWritten, false);

    const ppc = new FakePlay(
      {
        subscriptionState: "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED",
        acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
        linkedPurchaseToken: LINKED,
        lineItems: [{ productId: "vyd_professional" }],
      },
      paidOrder(ORDER1, "249")
    );
    ppc.subsByToken.set(
      TOKEN,
      {
        subscriptionState: "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED",
        acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
        linkedPurchaseToken: LINKED,
        lineItems: [{ productId: "vyd_professional" }],
      }
    );
    ppc.subsByToken.set(
      LINKED,
      activeSub({ acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED" })
    );
    const linked = await primedDeps(ppc);
    const preserved = await processAndroidPurchaseToken(linked.deps, {
      purchaseToken: TOKEN,
      callerUid: UID,
      source: "rtdn",
      eventSource: "webhook",
      eventTimeMillis: NOW,
    });
    assert.equal(preserved.to?.billingStatus, "active");
    assert.equal(preserved.to?.entitlementActive, true);
    assert.equal(ppc.capturedTokens.includes(LINKED), true);
    assert.equal(ppc.ackCalls, 0);
    assertNoSecrets(linked.store, preserved);

    const standalone = new FakePlay(
      {
        subscriptionState: "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED",
        acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
        lineItems: [{ productId: "vyd_professional" }],
      },
      paidOrder(ORDER1, "249")
    );
    const alone = await primedDeps(standalone);
    const skippedPpc = await processAndroidPurchaseToken(alone.deps, {
      purchaseToken: TOKEN,
      source: "rtdn",
      eventSource: "webhook",
      eventTimeMillis: NOW,
    });
    assert.equal(skippedPpc.skipped, "pending_purchase_canceled");
    assert.equal(skippedPpc.to, null);
  }

  // Round-2: Order history, refund authority, current-token reconcile, queue
  {
    const sep = Date.parse("2026-09-15T00:00:00+05:30");
    const oct = Date.parse("2026-10-15T00:00:00+05:30");

    // A. Sep create / Oct processed → purchase month Oct
    {
      const play = new FakePlay(
        activeSub(),
        paidOrder(ORDER1, "249", 0, rfc(sep), { processedEventTime: rfc(oct) })
      );
      const { deps, store } = await primedDeps(play);
      const timed = { ...deps, nowMs: () => oct };
      await processAndroidPurchaseToken(timed, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      });
      const purchaseLedger = store.docs.get(
        financialLedgerPath(sanitizeDocId(`android:purchase:${ORDER1}`))
      ) as { monthKey: string; occurredAt: number };
      assert.equal(purchaseLedger.monthKey, "2026-10");
      assert.equal(purchaseLedger.occurredAt, oct);
      assert.equal(istMonthKeyForMillis(purchaseLedger.occurredAt), "2026-10");
    }

    // B/C. REFUNDED accepted; PROCESSED rejected as completed full refund
    {
      const processed = paidOrder(ORDER1, "249");
      assert.throws(
        () =>
          assertFullyRefundedSubscriptionOrder({
            order: processed,
            expectedOrderId: ORDER1,
            productId: "vyd_professional",
            basePlanId: "monthly",
          }),
        isCause("order_not_fully_refunded")
      );
      const refunded = refundedOrder(processed, rfc(NOW + 1000));
      assertProcessedSubscriptionOrder({
        order: processed,
        expectedOrderId: ORDER1,
        productId: "vyd_professional",
        basePlanId: "monthly",
      });
      assertFullyRefundedSubscriptionOrder({
        order: refunded,
        expectedOrderId: ORDER1,
        productId: "vyd_professional",
        basePlanId: "monthly",
      });
      assert.throws(
        () =>
          assertFullyRefundedSubscriptionOrder({
            order: { ...refunded, state: "PENDING_REFUND" },
            expectedOrderId: ORDER1,
            productId: "vyd_professional",
            basePlanId: "monthly",
          }),
        isCause("order_refund_pending")
      );
      assert.throws(
        () =>
          assertFullyRefundedSubscriptionOrder({
            order: { ...refunded, state: "PARTIALLY_REFUNDED" },
            expectedOrderId: ORDER1,
            productId: "vyd_professional",
            basePlanId: "monthly",
          }),
        isCause("unsupported_partial_refund")
      );
    }

    // D/E. refundEvent total is refund gross; mismatch vs original fails closed
    {
      const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
      const { deps, store } = await primedDeps(play);
      await processAndroidPurchaseToken(deps, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      });
      play.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
      play.orders.set(
        ORDER1,
        refundedOrder(play.orders.get(ORDER1)!, rfc(NOW + 1000), {
          currencyCode: "INR",
          units: "100",
          nanos: 0,
        })
      );
      await assert.rejects(
        processAndroidVoidedPurchase(deps, {
          purchaseToken: TOKEN,
          orderId: ORDER1,
          productType: 1,
          refundType: 1,
          source: "rtdn",
          eventTimeMillis: NOW + 1000,
        }),
        isCause("refund_gross_mismatch")
      );
      assert.equal(store.docs.has(financialLedgerPath(sanitizeDocId(`android:refund:${ORDER1}`))), false);

      play.orders.set(ORDER1, refundedOrder(paidOrder(ORDER1, "249"), rfc(NOW + 1000)));
      const ok = await processAndroidVoidedPurchase(deps, {
        purchaseToken: TOKEN,
        orderId: ORDER1,
        productType: 1,
        refundType: 1,
        source: "rtdn",
        eventTimeMillis: NOW + 1000,
      });
      assert.equal(ok.financialEventWritten, true);
      const refundLedger = store.docs.get(
        financialLedgerPath(sanitizeDocId(`android:refund:${ORDER1}`))
      ) as { grossAmountInPaise: number };
      assert.equal(refundLedger.grossAmountInPaise, 24_900);
    }

    // F already covered by Sep purchase / Oct refundEvent month keys above.

    // G/H. historical Token A refund cannot mutate current Token B
    {
      const play = new FakePlay(
        starterSub({ acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING" }),
        paidOrder(ORDER1, "99", 0, rfc(NOW), { productId: "vyd_starter" })
      );
      const { deps, store } = await primedDeps(play);
      await processAndroidPurchaseToken(deps, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      });
      play.sub = activeSub({
        acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
        linkedPurchaseToken: TOKEN,
        lineItems: [
          {
            productId: "vyd_professional",
            expiryTime: rfc(FUTURE),
            latestSuccessfulOrderId: ORDER2,
            autoRenewingPlan: { autoRenewEnabled: true },
            offerDetails: { basePlanId: "monthly" },
          },
        ],
      });
      play.subsByToken.set(TOKEN2, play.sub);
      play.orders.set(ORDER2, paidOrder(ORDER2, "249"));
      await processAndroidPurchaseToken(deps, {
        purchaseToken: TOKEN2,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      });
      play.subsByToken.set(
        TOKEN,
        starterSub({
          subscriptionState: "SUBSCRIPTION_STATE_EXPIRED",
          acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
          lineItems: [
            {
              productId: "vyd_starter",
              expiryTime: rfc(NOW - DAY),
              latestSuccessfulOrderId: ORDER1,
              autoRenewingPlan: { autoRenewEnabled: false },
              offerDetails: { basePlanId: "monthly" },
            },
          ],
        })
      );
      play.orders.set(
        ORDER1,
        refundedOrder(play.orders.get(ORDER1)!, rfc(NOW + 9000))
      );
      const companyBefore = store.docs.get(companyBillingPath(UID)) as CompanyBillingDoc;
      assert.equal(companyBefore.credentialFingerprint, credentialFingerprint(TOKEN2));
      const capturesBefore = play.capturedTokens.length;
      const refunded = await processAndroidVoidedPurchase(deps, {
        purchaseToken: TOKEN,
        orderId: ORDER1,
        productType: 1,
        refundType: 1,
        source: "rtdn",
        eventTimeMillis: NOW + 9000,
      });
      const captures = play.capturedTokens.slice(capturesBefore);
      assert.equal(captures.includes(TOKEN), false);
      assert.equal(captures.includes(TOKEN2), true);
      assert.equal(refunded.financialEventWritten, true);
      assert.equal(refunded.to?.plan, "professional");
      assert.equal(refunded.to?.billingStatus, "active");
      assert.equal(refunded.to?.entitlementActive, true);
      const company = store.docs.get(companyBillingPath(UID)) as CompanyBillingDoc;
      assert.equal(company.latestOrderId, ORDER2);
      assert.equal(company.credentialFingerprint, credentialFingerprint(TOKEN2));
      assert.equal(queueDocs(store).length, 0);
      assertNoSecrets(store, refunded);
    }

    // I. refund live owner mismatch A/B blocked
    {
      const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
      const { deps, store } = await primedDeps(play);
      await handlePrepareAndroidBillingAccount(store, OTHER, NOW);
      await processAndroidPurchaseToken(deps, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      });
      play.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
      play.sub.externalAccountIdentifiers = {
        obfuscatedExternalAccountId: obfuscatedAccountIdForUid(OTHER),
      };
      play.orders.set(ORDER1, refundedOrder(play.orders.get(ORDER1)!, rfc(NOW + 1000)));
      const refunded = await processAndroidVoidedPurchase(deps, {
        purchaseToken: TOKEN,
        orderId: ORDER1,
        productType: 1,
        refundType: 1,
        source: "rtdn",
        eventTimeMillis: NOW + 1000,
      });
      assert.equal(refunded.financialEventWritten, true);
      assert.equal(refunded.reconciliationRequired, true);
      assert.equal(refunded.resultSummary, "refund_subscription_owner_mismatch");
      assert.equal(store.docs.has(`users/${OTHER}/subscription/status`), false);
      const alice = store.docs.get(`users/${UID}/subscription/status`) as SubscriptionStatusDoc;
      assert.equal(alice.billingStatus, "active");
      assert.equal(queueDocs(store).length, 1);
      assertNoSecrets(store, refunded);
    }

    // J/K. unqueryable current token → durable queue; duplicate RTDN → one item
    {
      const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
      const { deps, store } = await primedDeps(play);
      await processAndroidPurchaseToken(deps, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      });
      play.orders.set(ORDER1, refundedOrder(play.orders.get(ORDER1)!, rfc(NOW + 8000)));
      play.unqueryableTokens.add(TOKEN);
      await processAndroidVoidedPurchase(deps, {
        purchaseToken: TOKEN,
        orderId: ORDER1,
        productType: 1,
        refundType: 1,
        source: "rtdn",
        eventTimeMillis: NOW + 8000,
      });
      await processAndroidVoidedPurchase(deps, {
        purchaseToken: TOKEN,
        orderId: ORDER1,
        productType: 1,
        refundType: 1,
        source: "rtdn",
        eventTimeMillis: NOW + 8000,
      });
      assert.equal(queueDocs(store).length, 1);
      assert.equal(
        [...store.docs.keys()].filter((k) => k.startsWith("_billingEventLedger/")).length,
        2
      );
      const item = store.docs.get(
        billingReconciliationQueuePath(sanitizeDocId(`android:refund-reconcile:${ORDER1}`))
      ) as { reason: string; financialEventId: string; status: string };
      assert.equal(item.reason, "play_subscription_unqueryable");
      assert.equal(item.financialEventId, `android:refund:${ORDER1}`);
      assert.equal(item.status, "pending");
      assert.equal(JSON.stringify(item).includes(TOKEN), false);
    }

    // L. PPC Professional attempt canceled / linked Starter preserved
    {
      const ppc = new FakePlay(
        {
          subscriptionState: "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED",
          acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
          linkedPurchaseToken: LINKED,
          lineItems: [{ productId: "vyd_professional", offerDetails: { basePlanId: "monthly" } }],
        },
        paidOrder(ORDER1, "99", 0, rfc(NOW), { productId: "vyd_starter" })
      );
      ppc.subsByToken.set(TOKEN, {
        subscriptionState: "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED",
        acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
        linkedPurchaseToken: LINKED,
        lineItems: [{ productId: "vyd_professional", offerDetails: { basePlanId: "monthly" } }],
      });
      ppc.subsByToken.set(
        LINKED,
        starterSub({ acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED" })
      );
      const linked = await primedDeps(ppc);
      const preserved = await processAndroidPurchaseToken(linked.deps, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "rtdn",
        eventSource: "webhook",
        eventTimeMillis: NOW,
        expectedCanonicalSku: "vyd_professional_monthly",
      });
      assert.equal(preserved.to?.plan, "starter");
      assert.equal(preserved.to?.entitlementActive, true);
      assert.notEqual(preserved.canonicalSku, "vyd_professional_monthly");
      assert.equal(preserved.canonicalSku, "vyd_starter_monthly");
      assert.equal(ppc.ackCalls, 0);
      assertNoSecrets(linked.store, preserved);
    }

    // M. purchase+renewal ledger both existing for same order → fail closed
    {
      const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
      const { deps, store } = await primedDeps(play);
      await processAndroidPurchaseToken(deps, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      });
      const purchasePath = financialLedgerPath(sanitizeDocId(`android:purchase:${ORDER1}`));
      const renewalPath = financialLedgerPath(sanitizeDocId(`android:renewal:${ORDER1}`));
      const purchase = store.docs.get(purchasePath) as BillingEventLedgerDoc;
      store.docs.set(renewalPath, {
        ...purchase,
        financialEventId: `android:renewal:${ORDER1}`,
        eventType: "renewal",
      });
      play.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
      await assert.rejects(
        processAndroidPurchaseToken(deps, {
          purchaseToken: TOKEN,
          source: "rtdn",
          eventSource: "webhook",
          eventTimeMillis: NOW,
        }),
        isCause("purchase_renewal_classification_conflict")
      );
      play.orders.set(ORDER1, refundedOrder(play.orders.get(ORDER1)!, rfc(NOW + 1000)));
      await assert.rejects(
        processAndroidVoidedPurchase(deps, {
          purchaseToken: TOKEN,
          orderId: ORDER1,
          productType: 1,
          refundType: 1,
          source: "rtdn",
          eventTimeMillis: NOW + 1000,
        }),
        isCause("purchase_renewal_classification_conflict")
      );
    }

    // N. financial collision with wrong SKU/amount/time → fail closed
    {
      const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
      const { deps, store } = await primedDeps(play);
      await processAndroidPurchaseToken(deps, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      });
      const purchasePath = financialLedgerPath(sanitizeDocId(`android:purchase:${ORDER1}`));
      const ledger = store.docs.get(purchasePath) as BillingEventLedgerDoc;
      store.docs.set(purchasePath, { ...ledger, canonicalSku: "vyd_starter_monthly" });
      play.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
      await assert.rejects(
        processAndroidPurchaseToken(deps, {
          purchaseToken: TOKEN,
          source: "rtdn",
          eventSource: "webhook",
          eventTimeMillis: NOW,
        }),
        isCause("financial_event_conflict")
      );
      store.docs.set(purchasePath, { ...ledger, grossAmountInPaise: 1 });
      await assert.rejects(
        processAndroidPurchaseToken(deps, {
          purchaseToken: TOKEN,
          source: "rtdn",
          eventSource: "webhook",
          eventTimeMillis: NOW,
        }),
        isCause("financial_event_conflict")
      );
      store.docs.set(purchasePath, { ...ledger, occurredAt: NOW + 86_400_000 });
      await assert.rejects(
        processAndroidPurchaseToken(deps, {
          purchaseToken: TOKEN,
          source: "rtdn",
          eventSource: "webhook",
          eventTimeMillis: NOW,
        }),
        isCause("financial_event_conflict")
      );
    }
  }

  // Round-1: pending refund review HTTP 503 gate
  {
    const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
    const { deps } = await primedDeps(play);
    const expected = {
      audience: "https://asia-south1-demo.cloudfunctions.net/androidRtdn",
      serviceAccountEmail: "rtdn-push@demo.iam.gserviceaccount.com",
    };
    const verifier: OidcTokenVerifier = {
      async verifyIdToken() {
        return {
          iss: "https://accounts.google.com",
          aud: expected.audience,
          email: expected.serviceAccountEmail,
          email_verified: true,
        };
      },
    };
    const http = await handleAndroidRtdnHttp({
      authorizationHeader: "Bearer good",
      body: {
        message: {
          messageId: "pending-http",
          data: Buffer.from(
            JSON.stringify({
              packageName: "com.specialsoftwares.vyaamikkdiary",
              pendingRefundReviewNotification: { pendingRefundToken: "PENDING_REFUND_TOKEN_SECRET" },
            })
          ).toString("base64"),
        },
      },
      deps,
      oidcVerifier: verifier,
      playBillingEnabled: true,
      oidcExpected: expected,
    }).catch((err: unknown) => err);
    assert.ok(http instanceof BillingError);
    assert.equal((http as InstanceType<typeof BillingError>).causeCode, "pending_refund_review_unimplemented");
    assert.equal((http as InstanceType<typeof BillingError>).retryable, true);
  }

  // Round-3: chargeback, ownership completeness, owned-state order, etag lifecycle
  {
    const sep = Date.parse("2026-09-15T00:00:00+05:30");
    const oct = Date.parse("2026-10-15T00:00:00+05:30");

    function canceledHistory(store: MemoryBillingStore) {
      return historyDocs(store).filter(([, v]) => (v as { type?: string }).type === "cancelled");
    }

    async function purchaseThenVoid(opts: {
      refundReason: string | null;
      refundType?: unknown;
      eventTimeMillis?: number;
    }) {
      const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
      const primed = await primedDeps(play);
      await processAndroidPurchaseToken(primed.deps, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      });
      play.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
      play.orders.set(
        ORDER1,
        refundedOrder(play.orders.get(ORDER1)!, rfc(NOW + 1000), undefined, opts.refundReason)
      );
      const voided = await processAndroidVoidedPurchase(primed.deps, {
        purchaseToken: TOKEN,
        orderId: ORDER1,
        productType: 1,
        refundType: opts.refundType ?? 1,
        source: "rtdn",
        eventTimeMillis: opts.eventTimeMillis ?? NOW + 1000,
      });
      return { ...primed, play, voided };
    }

    // A/B/C. OTHER refund vs CHARGEBACK vs unspecified
    {
      assert.equal(
        classifyVerifiedFullRefundReason(refundedOrder(paidOrder(ORDER1, "249"), rfc(NOW), undefined, "OTHER")),
        "refund"
      );
      assert.equal(
        classifyVerifiedFullRefundReason(
          refundedOrder(paidOrder(ORDER1, "249"), rfc(NOW), undefined, "CHARGEBACK")
        ),
        "chargeback"
      );
      assert.throws(
        () =>
          classifyVerifiedFullRefundReason(
            refundedOrder(paidOrder(ORDER1, "249"), rfc(NOW), undefined, null)
          ),
        isCause("unknown_order_refund_reason")
      );
      assert.throws(
        () =>
          classifyVerifiedFullRefundReason(
            refundedOrder(paidOrder(ORDER1, "249"), rfc(NOW), undefined, "REFUND_REASON_UNSPECIFIED")
          ),
        isCause("unknown_order_refund_reason")
      );
      assert.throws(
        () =>
          classifyVerifiedFullRefundReason(
            refundedOrder(paidOrder(ORDER1, "249"), rfc(NOW), undefined, "FUTURE_REASON")
          ),
        isCause("unknown_order_refund_reason")
      );

      const other = await purchaseThenVoid({ refundReason: "OTHER" });
      assert.equal(other.store.docs.has(financialLedgerPath(sanitizeDocId(`android:refund:${ORDER1}`))), true);
      assert.equal(
        other.store.docs.has(financialLedgerPath(sanitizeDocId(`android:chargeback:${ORDER1}`))),
        false
      );
      assert.equal(
        other.taxCalls.filter((c) => c.eventType === "refund" && c.financialEventWritten).length,
        1
      );

      const cb = await purchaseThenVoid({ refundReason: "CHARGEBACK" });
      const cbLedger = cb.store.docs.get(
        financialLedgerPath(sanitizeDocId(`android:chargeback:${ORDER1}`))
      ) as BillingEventLedgerDoc;
      assert.equal(cbLedger.eventType, "chargeback");
      assert.equal(cbLedger.relatedFinancialEventId, `android:purchase:${ORDER1}`);
      assert.equal(cbLedger.grossAmountInPaise, 24_900);
      assert.equal(cbLedger.actualPlatformCommissionInPaise, null);
      assert.equal(cb.store.docs.has(financialLedgerPath(sanitizeDocId(`android:refund:${ORDER1}`))), false);
      assert.equal(cb.taxCalls.filter((c) => c.eventType === "purchase").length, 1);
      assert.equal(cb.taxCalls.filter((c) => c.eventType === "refund").length, 0);
      assert.equal(cb.taxCalls.some((c) => (c.eventType as string) === "chargeback"), false);

      const month = istMonthKeyForMillis(cbLedger.occurredAt);
      const papers = buildGstr1WorkingPapers({
        month,
        ...(await new MemoryTaxComplianceReportSource(cb.store).loadMonthlyScope(month)),
      });
      assert.equal(papers.reviewStatus, "requires_tax_review");
      assert.ok(papers.taxAdjustments.some((row) => row.eventType === "chargeback"));
      assert.equal(papers.taxAdjustments.some((row) => row.eventType === "refund"), false);
      assert.ok(papers.taxAdjustments.every((row) => row.creditNoteId == null));
      assert.ok(
        papers.complianceOpenItems.some((i) => i.unresolvedReasons.includes("gst_adjustment_requires_review"))
      );
      assert.equal(
        [...cb.store.docs.keys()].filter((k) => k.startsWith("_subscriptionCreditNotes/")).length,
        0
      );

      const unspecifiedPlay = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
      const unspecified = await primedDeps(unspecifiedPlay);
      await processAndroidPurchaseToken(unspecified.deps, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      });
      unspecifiedPlay.orders.set(
        ORDER1,
        refundedOrder(unspecifiedPlay.orders.get(ORDER1)!, rfc(NOW + 1000), undefined, null)
      );
      await assert.rejects(
        processAndroidVoidedPurchase(unspecified.deps, {
          purchaseToken: TOKEN,
          orderId: ORDER1,
          productType: 1,
          refundType: 1,
          source: "rtdn",
          eventTimeMillis: NOW + 1000,
        }),
        isCause("unknown_order_refund_reason")
      );
      assert.equal(
        unspecified.store.docs.has(financialLedgerPath(sanitizeDocId(`android:refund:${ORDER1}`))),
        false
      );
      assert.equal(
        unspecified.store.docs.has(financialLedgerPath(sanitizeDocId(`android:chargeback:${ORDER1}`))),
        false
      );
    }

    // F–I. out-of-app expiredPurchaseToken ownership
    {
      const expiredOnlyPlay = new FakePlay(
        activeSub({
          externalAccountIdentifiers: {},
          outOfAppPurchaseContext: { expiredPurchaseToken: EXPIRED_TOKEN },
        }),
        paidOrder(ORDER1, "249")
      );
      const expiredOnly = await primedDeps(expiredOnlyPlay);
      expiredOnly.store.docs.set(playCredentialIndexPath(credentialFingerprint(EXPIRED_TOKEN)), {
        uid: UID,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const recovered = await processAndroidPurchaseToken(expiredOnly.deps, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      });
      assert.equal(recovered.uid, UID);
      assert.equal(recovered.to?.entitlementActive, true);
      assert.equal(expiredOnlyPlay.capturedTokens.includes(EXPIRED_TOKEN), false);
      assert.equal(
        expiredOnly.store.docs.get(playCredentialIndexPath(credentialFingerprint(TOKEN)))?.uid,
        UID
      );
      assertNoSecrets(expiredOnly.store, recovered);
      assert.equal(JSON.stringify([...expiredOnly.store.docs.entries()]).includes(EXPIRED_TOKEN), false);

      const bothSame = new FakePlay(
        activeSub({
          outOfAppPurchaseContext: {
            expiredExternalAccountIdentifiers: {
              obfuscatedExternalAccountId: obfuscatedAccountIdForUid(UID),
            },
            expiredPurchaseToken: EXPIRED_TOKEN,
          },
        }),
        paidOrder(ORDER1, "249")
      );
      const same = await primedDeps(bothSame);
      same.store.docs.set(playCredentialIndexPath(credentialFingerprint(EXPIRED_TOKEN)), {
        uid: UID,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const sameOwned = await processAndroidPurchaseToken(same.deps, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      });
      assert.equal(sameOwned.uid, UID);

      const conflictAb = new FakePlay(
        activeSub({
          outOfAppPurchaseContext: {
            expiredExternalAccountIdentifiers: {
              obfuscatedExternalAccountId: obfuscatedAccountIdForUid(OTHER),
            },
          },
        }),
        paidOrder(ORDER1, "249")
      );
      const ab = await primedDeps(conflictAb);
      await handlePrepareAndroidBillingAccount(ab.store, OTHER, NOW);
      await assert.rejects(
        processAndroidPurchaseToken(ab.deps, {
          purchaseToken: TOKEN,
          callerUid: UID,
          source: "androidValidation",
          eventSource: "callable",
        }),
        isCause("play_ownership_signal_conflict")
      );

      const conflictToken = new FakePlay(
        activeSub({
          outOfAppPurchaseContext: { expiredPurchaseToken: EXPIRED_TOKEN },
        }),
        paidOrder(ORDER1, "249")
      );
      const vsToken = await primedDeps(conflictToken);
      vsToken.store.docs.set(playCredentialIndexPath(credentialFingerprint(EXPIRED_TOKEN)), {
        uid: OTHER,
        createdAt: NOW,
        updatedAt: NOW,
      });
      await assert.rejects(
        processAndroidPurchaseToken(vsToken.deps, {
          purchaseToken: TOKEN,
          callerUid: UID,
          source: "androidValidation",
          eventSource: "callable",
        }),
        isCause("play_ownership_signal_conflict")
      );

      const unknownExpired = new FakePlay(
        activeSub({
          externalAccountIdentifiers: {},
          outOfAppPurchaseContext: { expiredPurchaseToken: EXPIRED_TOKEN },
        }),
        paidOrder(ORDER1, "249")
      );
      const unknown = await primedDeps(unknownExpired);
      await assert.rejects(
        processAndroidPurchaseToken(unknown.deps, {
          purchaseToken: TOKEN,
          source: "rtdn",
          eventSource: "webhook",
        }),
        (e: unknown) =>
          e instanceof BillingError &&
          e.causeCode === "unresolved_play_account_owner" &&
          e.retryable === true
      );
      assert.equal(unknownExpired.capturedTokens.includes(EXPIRED_TOKEN), false);
      assert.equal(JSON.stringify(unknown.store.docs.get(subscriptionStatusPath(UID)) ?? {}).includes(EXPIRED_TOKEN), false);

      const collisionPlay = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
      const collision = await primedDeps(collisionPlay);
      collision.store.docs.set(playCredentialIndexPath(credentialFingerprint(TOKEN)), {
        uid: OTHER,
        createdAt: NOW,
        updatedAt: NOW,
      });
      await assert.rejects(
        processAndroidPurchaseToken(collision.deps, {
          purchaseToken: TOKEN,
          callerUid: UID,
          source: "androidValidation",
          eventSource: "callable",
        }),
        isCause("play_credential_index_collision")
      );
      assert.equal(collision.store.docs.has(subscriptionStatusPath(UID)), false);
    }

    // J–O. every owned non-pending state requires latestSuccessfulOrderId
    {
      for (const state of [
        "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
        "SUBSCRIPTION_STATE_ON_HOLD",
        "SUBSCRIPTION_STATE_CANCELED",
        "SUBSCRIPTION_STATE_PAUSED",
        "SUBSCRIPTION_STATE_EXPIRED",
      ]) {
        const sub = activeSub({
          subscriptionState: state,
          acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
        });
        delete sub.lineItems![0].latestSuccessfulOrderId;
        const play = new FakePlay(sub, paidOrder(ORDER1, "249"));
        const { deps, store } = await primedDeps(play);
        await assert.rejects(
          processAndroidPurchaseToken(deps, {
            purchaseToken: TOKEN,
            callerUid: UID,
            source: "rtdn",
            eventSource: "webhook",
          }),
          isCause("missing_latest_successful_order_id")
        );
        assert.equal(play.ackCalls, 0);
        assert.equal(historyDocs(store).length, 0);
        assert.equal(
          [...store.docs.keys()].filter((k) => k.startsWith("_billingEventLedger/")).length,
          0
        );
        assert.equal(store.docs.has(subscriptionStatusPath(UID)), false);
      }
    }

    // P/Q. deferred replacement / removal rejected
    {
      for (const deferred of [
        { deferredItemReplacement: { productId: "vyd_starter" } },
        { deferredItemRemoval: {} },
      ]) {
        const play = new FakePlay(
          activeSub({
            lineItems: [
              {
                productId: "vyd_professional",
                expiryTime: rfc(FUTURE),
                latestSuccessfulOrderId: ORDER1,
                autoRenewingPlan: { autoRenewEnabled: true },
                offerDetails: { basePlanId: "monthly" },
                ...deferred,
              },
            ],
          }),
          paidOrder(ORDER1, "249")
        );
        const { deps, store } = await primedDeps(play);
        await assert.rejects(
          processAndroidPurchaseToken(deps, {
            purchaseToken: TOKEN,
            callerUid: UID,
            source: "androidValidation",
            eventSource: "callable",
          }),
          isCause("unsupported_deferred_subscription_change")
        );
        assert.equal(play.ackCalls, 0);
        assert.equal(store.docs.has(subscriptionStatusPath(UID)), false);
      }
    }

    // R/S/T. etag lifecycle identity
    {
      const play = new FakePlay(
        activeSub({
          subscriptionState: "SUBSCRIPTION_STATE_CANCELED",
          acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
          etag: "etag-cancel-t1",
          canceledStateContext: {
            userInitiatedCancellation: { cancelTime: rfc(NOW) },
          },
        }),
        paidOrder(ORDER1, "249")
      );
      const { deps, store } = await primedDeps(play);
      const firstCancel = await processAndroidPurchaseToken(deps, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "rtdn",
        eventSource: "webhook",
        eventTimeMillis: NOW,
      });
      assert.equal(firstCancel.to?.billingStatus, "cancelled");
      assert.equal(firstCancel.to?.cancelledAt, NOW);

      play.sub = activeSub({
        acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
        etag: "etag-active-restart",
      });
      const restarted = await processAndroidPurchaseToken(deps, {
        purchaseToken: TOKEN,
        source: "rtdn",
        eventSource: "webhook",
        eventTimeMillis: NOW + DAY,
      });
      assert.equal(restarted.to?.billingStatus, "active");

      play.sub = activeSub({
        subscriptionState: "SUBSCRIPTION_STATE_CANCELED",
        acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
        etag: "etag-cancel-t2",
        canceledStateContext: {
          userInitiatedCancellation: { cancelTime: rfc(NOW + 2 * DAY) },
        },
      });
      const secondCancel = await processAndroidPurchaseToken(deps, {
        purchaseToken: TOKEN,
        source: "rtdn",
        eventSource: "webhook",
        eventTimeMillis: NOW + 2 * DAY,
      });
      assert.equal(secondCancel.to?.billingStatus, "cancelled");
      assert.equal(secondCancel.to?.cancelledAt, NOW + 2 * DAY);
      assert.equal(canceledHistory(store).length, 2);

      const dupCancel = await processAndroidPurchaseToken(deps, {
        purchaseToken: TOKEN,
        source: "rtdn",
        eventSource: "webhook",
        eventTimeMillis: NOW + 2 * DAY,
      });
      assert.equal(dupCancel.alreadyProcessed, true);
      assert.equal(canceledHistory(store).length, 2);

      const racedPlay = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
      const raced = await primedDeps(racedPlay);
      await processAndroidPurchaseToken(raced.deps, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      });
      racedPlay.sub.subscriptionState = "SUBSCRIPTION_STATE_CANCELED";
      racedPlay.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
      racedPlay.sub.etag = "etag-cancel-race";
      racedPlay.sub.canceledStateContext = {
        userInitiatedCancellation: { cancelTime: rfc(NOW + 5_000) },
      };
      const [c1, c2] = await Promise.all([
        processAndroidPurchaseToken(raced.deps, {
          purchaseToken: TOKEN,
          callerUid: UID,
          source: "androidValidation",
          eventSource: "callable",
          eventTimeMillis: NOW + 5_000,
        }),
        processAndroidPurchaseToken(raced.deps, {
          purchaseToken: TOKEN,
          source: "rtdn",
          eventSource: "webhook",
          eventTimeMillis: NOW + 5_000,
        }),
      ]);
      assert.ok(c1.to?.billingStatus === "cancelled" && c2.to?.billingStatus === "cancelled");
      assert.equal(canceledHistory(raced.store).length, 1);
    }

    // U/V. original ledger must match Order history at refund time
    {
      const play = new FakePlay(
        activeSub(),
        paidOrder(ORDER1, "249", 0, rfc(sep), { processedEventTime: rfc(sep) })
      );
      const timed = await primedDeps(play);
      const sepDeps = { ...timed.deps, nowMs: () => sep };
      await processAndroidPurchaseToken(sepDeps, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      });
      const purchasePath = financialLedgerPath(sanitizeDocId(`android:purchase:${ORDER1}`));
      const ledger = timed.store.docs.get(purchasePath) as BillingEventLedgerDoc;
      timed.store.docs.set(purchasePath, { ...ledger, occurredAt: oct });
      play.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
      play.orders.set(ORDER1, refundedOrder(play.orders.get(ORDER1)!, rfc(oct)));
      await assert.rejects(
        processAndroidVoidedPurchase(timed.deps, {
          purchaseToken: TOKEN,
          orderId: ORDER1,
          productType: 1,
          refundType: 1,
          source: "rtdn",
          eventTimeMillis: oct,
        }),
        isCause("financial_event_conflict")
      );

      const grossPlay = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
      const gross = await primedDeps(grossPlay);
      await processAndroidPurchaseToken(gross.deps, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      });
      grossPlay.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
      const originalOrder = grossPlay.orders.get(ORDER1)!;
      grossPlay.orders.set(
        ORDER1,
        refundedOrder(originalOrder, rfc(NOW + 1000), { currencyCode: "INR", units: "99", nanos: 0 })
      );
      await assert.rejects(
        processAndroidVoidedPurchase(gross.deps, {
          purchaseToken: TOKEN,
          orderId: ORDER1,
          productType: 1,
          refundType: 1,
          source: "rtdn",
          eventTimeMillis: NOW + 1000,
        }),
        isCause("refund_gross_mismatch")
      );
    }

    // W/X. queue pending → later success → resolved; duplicate stays resolved
    {
      const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
      const { deps, store } = await primedDeps(play);
      await processAndroidPurchaseToken(deps, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      });
      play.orders.set(ORDER1, refundedOrder(play.orders.get(ORDER1)!, rfc(NOW + 8000)));
      play.unqueryableTokens.add(TOKEN);
      await processAndroidVoidedPurchase(deps, {
        purchaseToken: TOKEN,
        orderId: ORDER1,
        productType: 1,
        refundType: 1,
        source: "rtdn",
        eventTimeMillis: NOW + 8000,
      });
      const queuePath = billingReconciliationQueuePath(
        sanitizeDocId(`android:refund-reconcile:${ORDER1}`)
      );
      const pending = store.docs.get(queuePath) as {
        status: string;
        resolvedAt: number | null;
        financialEventId: string;
      };
      assert.equal(pending.status, "pending");
      assert.equal(pending.resolvedAt, null);
      play.unqueryableTokens.delete(TOKEN);
      const later = await processAndroidVoidedPurchase(deps, {
        purchaseToken: TOKEN,
        orderId: ORDER1,
        productType: 1,
        refundType: 1,
        source: "rtdn",
        eventTimeMillis: NOW + 8000,
      });
      assert.equal(later.reconciliationRequired, false);
      const resolved = store.docs.get(queuePath) as {
        status: string;
        resolvedAt: number | null;
        financialEventId: string;
      };
      assert.equal(queueDocs(store).length, 1);
      assert.equal(resolved.status, "resolved");
      assert.equal(resolved.resolvedAt, NOW);
      assert.equal(resolved.financialEventId, `android:refund:${ORDER1}`);
      const again = await processAndroidVoidedPurchase(deps, {
        purchaseToken: TOKEN,
        orderId: ORDER1,
        productType: 1,
        refundType: 1,
        source: "rtdn",
        eventTimeMillis: NOW + 8000,
      });
      assert.equal(again.reconciliationRequired, false);
      const still = store.docs.get(queuePath) as { status: string; resolvedAt: number | null };
      assert.equal(still.status, "resolved");
      assert.equal(still.resolvedAt, NOW);
    }

    // Y. missing refundType fails before treating Order as refunded
    {
      assert.throws(() => assertVoidedPurchaseFullRefundType(undefined), isCause("missing_void_refund_type"));
      assert.throws(() => assertVoidedPurchaseFullRefundType(null), isCause("missing_void_refund_type"));
      assert.throws(() => assertVoidedPurchaseFullRefundType(99), isCause("unknown_void_refund_type"));
      const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
      const { deps, store } = await primedDeps(play);
      await processAndroidPurchaseToken(deps, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      });
      play.orders.set(ORDER1, refundedOrder(play.orders.get(ORDER1)!, rfc(NOW + 1000)));
      await assert.rejects(
        processAndroidVoidedPurchase(deps, {
          purchaseToken: TOKEN,
          orderId: ORDER1,
          productType: 1,
          refundType: undefined,
          source: "rtdn",
          eventTimeMillis: NOW + 1000,
        }),
        isCause("missing_void_refund_type")
      );
      assert.equal(store.docs.has(financialLedgerPath(sanitizeDocId(`android:refund:${ORDER1}`))), false);
    }

    // Z. no undocumented 7-day RTDN vs refundEvent rejection
    {
      const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
      const { deps, store } = await primedDeps(play);
      await processAndroidPurchaseToken(deps, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      });
      play.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
      const refundAt = NOW + 8 * DAY;
      play.orders.set(ORDER1, refundedOrder(play.orders.get(ORDER1)!, rfc(refundAt)));
      const late = await processAndroidVoidedPurchase(deps, {
        purchaseToken: TOKEN,
        orderId: ORDER1,
        productType: 1,
        refundType: 1,
        source: "rtdn",
        eventTimeMillis: NOW,
      });
      const refundLedger = store.docs.get(
        financialLedgerPath(sanitizeDocId(`android:refund:${ORDER1}`))
      ) as BillingEventLedgerDoc;
      assert.equal(late.financialEventWritten, true);
      assert.equal(refundLedger.occurredAt, refundAt);
    }
  }

  // Round-4: full-reversal mutual exclusion (adapter)
  {
    async function seedPaid(refundReason: string) {
      const play = new FakePlay(activeSub(), paidOrder(ORDER1, "249"));
      const primed = await primedDeps(play);
      await processAndroidPurchaseToken(primed.deps, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      });
      play.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
      play.orders.set(
        ORDER1,
        refundedOrder(play.orders.get(ORDER1)!, rfc(NOW + 1000), undefined, refundReason)
      );
      return { ...primed, play };
    }

    // A. existing refund → incoming CHARGEBACK fails closed; no chargeback row
    {
      const primed = await seedPaid("OTHER");
      await processAndroidVoidedPurchase(primed.deps, {
        purchaseToken: TOKEN,
        orderId: ORDER1,
        productType: 1,
        refundType: 1,
        source: "rtdn",
        eventTimeMillis: NOW + 1000,
      });
      primed.play.orders.set(
        ORDER1,
        refundedOrder(primed.play.orders.get(ORDER1)!, rfc(NOW + 1000), undefined, "CHARGEBACK")
      );
      const keysBefore = [...primed.store.docs.keys()].sort();
      await assert.rejects(
        processAndroidVoidedPurchase(primed.deps, {
          purchaseToken: TOKEN,
          orderId: ORDER1,
          productType: 1,
          refundType: 1,
          source: "rtdn",
          eventTimeMillis: NOW + 1000,
        }),
        isCause("full_reversal_classification_conflict")
      );
      assert.equal(primed.store.docs.has(financialLedgerPath(sanitizeDocId(`android:refund:${ORDER1}`))), true);
      assert.equal(
        primed.store.docs.has(financialLedgerPath(sanitizeDocId(`android:chargeback:${ORDER1}`))),
        false
      );
      assert.deepEqual([...primed.store.docs.keys()].sort(), keysBefore);
      assert.equal(primed.taxCalls.filter((c) => (c.eventType as string) === "chargeback").length, 0);
    }

    // B. existing chargeback → incoming OTHER/refund fails closed; no refund row
    {
      const primed = await seedPaid("CHARGEBACK");
      await processAndroidVoidedPurchase(primed.deps, {
        purchaseToken: TOKEN,
        orderId: ORDER1,
        productType: 1,
        refundType: 1,
        source: "rtdn",
        eventTimeMillis: NOW + 1000,
      });
      primed.play.orders.set(
        ORDER1,
        refundedOrder(primed.play.orders.get(ORDER1)!, rfc(NOW + 1000), undefined, "OTHER")
      );
      const keysBefore = [...primed.store.docs.keys()].sort();
      await assert.rejects(
        processAndroidVoidedPurchase(primed.deps, {
          purchaseToken: TOKEN,
          orderId: ORDER1,
          productType: 1,
          refundType: 1,
          source: "rtdn",
          eventTimeMillis: NOW + 1000,
        }),
        isCause("full_reversal_classification_conflict")
      );
      assert.equal(
        primed.store.docs.has(financialLedgerPath(sanitizeDocId(`android:chargeback:${ORDER1}`))),
        true
      );
      assert.equal(primed.store.docs.has(financialLedgerPath(sanitizeDocId(`android:refund:${ORDER1}`))), false);
      assert.deepEqual([...primed.store.docs.keys()].sort(), keysBefore);
      assert.equal(primed.taxCalls.filter((c) => c.eventType === "refund").length, 0);
    }

    // same-class OTHER / CHARGEBACK replay
    {
      const other = await seedPaid("OTHER");
      const first = await processAndroidVoidedPurchase(other.deps, {
        purchaseToken: TOKEN,
        orderId: ORDER1,
        productType: 1,
        refundType: 1,
        source: "rtdn",
        eventTimeMillis: NOW + 1000,
      });
      const replay = await processAndroidVoidedPurchase(other.deps, {
        purchaseToken: TOKEN,
        orderId: ORDER1,
        productType: 1,
        refundType: 1,
        source: "rtdn",
        eventTimeMillis: NOW + 1000,
      });
      assert.equal(first.financialEventWritten, true);
      assert.equal(replay.alreadyProcessed, true);
      assert.equal(other.store.docs.has(financialLedgerPath(sanitizeDocId(`android:refund:${ORDER1}`))), true);
      assert.equal(other.store.docs.has(financialLedgerPath(sanitizeDocId(`android:chargeback:${ORDER1}`))), false);

      const cb = await seedPaid("CHARGEBACK");
      const cbFirst = await processAndroidVoidedPurchase(cb.deps, {
        purchaseToken: TOKEN,
        orderId: ORDER1,
        productType: 1,
        refundType: 1,
        source: "rtdn",
        eventTimeMillis: NOW + 1000,
      });
      const cbReplay = await processAndroidVoidedPurchase(cb.deps, {
        purchaseToken: TOKEN,
        orderId: ORDER1,
        productType: 1,
        refundType: 1,
        source: "rtdn",
        eventTimeMillis: NOW + 1000,
      });
      assert.equal(cbFirst.financialEventWritten, true);
      assert.equal(cbReplay.alreadyProcessed, true);
      assert.equal(cb.store.docs.has(financialLedgerPath(sanitizeDocId(`android:chargeback:${ORDER1}`))), true);
      assert.equal(cb.store.docs.has(financialLedgerPath(sanitizeDocId(`android:refund:${ORDER1}`))), false);
      assert.equal(cb.taxCalls.filter((c) => c.eventType === "refund").length, 0);
    }
  }

  // Source-level: adapter never logs tokens
  {
    const src = [
      readFileSync(resolve(__dirname, "androidSubscriptionAdapter.ts"), "utf8"),
      readFileSync(resolve(__dirname, "rtdn.ts"), "utf8"),
      readFileSync(resolve(__dirname, "playApiClient.ts"), "utf8"),
    ].join("\n");
    assert.doesNotMatch(src, /console\.log\([^\)]*purchaseToken/);
    assert.match(src, /subscriptionsv2/);
    assert.doesNotMatch(src, /purchases\.subscriptions\.get/);
  }

  console.log("androidPlay.unit.test.ts: ok");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
