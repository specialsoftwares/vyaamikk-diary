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
import { companyBillingPath, financialLedgerPath, playAccountIndexPath, sanitizeDocId } from "../paths";
import { ALL_CANONICAL_SKUS, SUBSCRIPTION_CATALOG, canonicalSkuForAndroid } from "../products";
import { MemoryBillingStore } from "../store";
import type { CompanyBillingDoc } from "../types";
import {
  processAndroidPurchaseToken,
  processAndroidVoidedPurchase,
  resolveAndroidCatalogFromLineItem,
  type AndroidBillingDeps,
  type PostCommitTaxHandoff,
} from "./androidSubscriptionAdapter";
import type { PlayApi } from "./playApiClient";
import { PlayApiClient } from "./playApiClient";
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

function paidOrder(orderId: string, totalUnits: string, nanos = 0): GoogleOrder {
  return {
    orderId,
    state: "PROCESSED",
    packageName: "com.specialsoftwares.vyaamikkdiary",
    createTime: rfc(NOW),
    total: { currencyCode: "INR", units: totalUnits, nanos },
    developerRevenueInBuyerCurrency: { currencyCode: "INR", units: "1", nanos: 0 },
    lineItems: [{ productId: "vyd_professional" }],
    subscriptionDetails: {
      basePlanId: "monthly",
      servicePeriodStartTime: rfc(NOW),
    },
  };
}

class FakePlay implements PlayApi {
  sub: GoogleSubscriptionPurchaseV2;
  orders = new Map<string, GoogleOrder>();
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
  return blob.includes(TOKEN) || blob.includes(TOKEN2) || blob.includes(LINKED);
}

function assertNoSecrets(store: MemoryBillingStore, extra?: unknown): void {
  assert.equal(secretsIn([...store.docs.entries()]), false);
  if (extra !== undefined) assert.equal(secretsIn(extra), false);
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
    const body = {
      message: {
        messageId: `msg-restore-${notificationType}`,
        data: Buffer.from(
          JSON.stringify({
            packageName: "com.specialsoftwares.vyaamikkdiary",
            subscriptionNotification: { notificationType, purchaseToken: TOKEN },
          })
        ).toString("base64"),
      },
    };
    const handled = await handleAndroidRtdn(deps, body);
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

    const canceledNote = {
      message: {
        messageId: "note-canceled",
        data: Buffer.from(
          JSON.stringify({
            packageName: "com.specialsoftwares.vyaamikkdiary",
            subscriptionNotification: { notificationType: 3, purchaseToken: TOKEN },
          })
        ).toString("base64"),
      },
    };
    const liveActive = await handleAndroidRtdn(deps, canceledNote);
    assert.equal(liveActive.billing?.to?.billingStatus, "active");
    assert.equal(play.getSubCalls >= 1, true, "RTDN must refetch subscriptionsv2");

    const duplicate = await handleAndroidRtdn(deps, canceledNote);
    assert.equal(duplicate.billing?.financialEventWritten, false);
    assert.equal(
      [...store.docs.keys()].filter((k) => k.startsWith("_billingEventLedger/")).length,
      1
    );

    play.sub.subscriptionState = "SUBSCRIPTION_STATE_EXPIRED";
    play.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
    const purchasedNote = {
      message: {
        messageId: "note-purchased",
        data: Buffer.from(
          JSON.stringify({
            packageName: "com.specialsoftwares.vyaamikkdiary",
            subscriptionNotification: { notificationType: 4, purchaseToken: TOKEN },
          })
        ).toString("base64"),
      },
    };
    const liveExpired = await handleAndroidRtdn(deps, purchasedNote);
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
    const refunded = await processAndroidVoidedPurchase(deps, {
      purchaseToken: TOKEN,
      orderId: ORDER1,
      productType: 1,
      refundType: 1,
      source: "rtdn",
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
    expPlay.orders.set(ORDER1, paidOrder(ORDER1, "249"));
    const revoked = await processAndroidVoidedPurchase(expired.deps, {
      purchaseToken: TOKEN,
      orderId: ORDER1,
      productType: 1,
      refundType: 1,
      source: "rtdn",
    });
    assert.equal(revoked.to?.entitlementActive, false);
    assert.equal(revoked.to?.billingStatus, "expired");

    const review = await handleAndroidRtdn(deps, {
      message: {
        messageId: "pending-review",
        data: Buffer.from(
          JSON.stringify({
            packageName: "com.specialsoftwares.vyaamikkdiary",
            pendingRefundReviewNotification: { pendingRefundToken: "PENDING_REFUND_TOKEN_SECRET" },
          })
        ).toString("base64"),
      },
    });
    assert.equal(review.action, "pending_refund_review_ignored");
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
