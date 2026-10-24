/**
 * Team 5 independent INJECTED reproduction of application 60c4bc1.
 *
 * Already-owned same-uid Play token lifecycle after tester delist.
 * New grants stay fail-closed. FakePlay only — not live Play, not REAL-CHARGE.
 *
 * Label: INJECTED. Not EMULATOR. Not LIVE_BACKEND. Not LIVE_STORE.
 * Do not import into production Functions.
 *
 *   GRIN_QA_REPO_ROOT=/Users/shivamsaurav/vyd-worktrees/grin-combined \
 *     npx --yes tsx docs/release/proposals/team5/already-owned-play-lifecycle.injected.ts
 *
 * Exit 0 = stated INJECTED checks held. Exit 1 = defect.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const siblingCombined = join(here, "../../../../../grin-combined");
const selfRepo = join(here, "../../../..");
const ROOT =
  process.env.GRIN_QA_REPO_ROOT ??
  (existsSync(join(siblingCombined, "functions/src/billing/google/androidSubscriptionAdapter.ts"))
    ? siblingCombined
    : selfRepo);

const APP_SHA = "60c4bc179c46b8986ab0dbd2c95db0e4a5ceb49a";
const PRIOR_SHA = "fcda7cd64e9622e50c38223a7156f0f6b8ca5576";

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;
const FUTURE = NOW + 30 * DAY;
const SECRET = "team5-injected-billing-diag-uid-secret-60c4bc1";
const UID = "uid-t5-alice-60c4bc1";
const OTHER = "uid-t5-bob-60c4bc1";
const TOKEN = "T5_OWNED_PURCHASE_TOKEN_DO_NOT_PERSIST";
const TOKEN_NEW = "T5_NEW_GRANT_PURCHASE_TOKEN_DO_NOT_PERSIST";
const ORDER1 = "GPA.T5-60C4BC1-1";
const ORDER2 = "GPA.T5-60C4BC1-2";

async function load(rel: string) {
  return import(pathToFileURL(join(ROOT, rel)).href);
}

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function rfc(ms: number): string {
  return new Date(ms).toISOString();
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function isCause(BillingError: new (...args: never[]) => { causeCode?: string }, code: string) {
  return (e: unknown) => e instanceof BillingError && (e as { causeCode?: string }).causeCode === code;
}

function restrictedTesterEnv(uids: readonly string[]): NodeJS.ProcessEnv {
  return {
    PLAY_BILLING_ENABLED: "true",
    PLAY_BILLING_TESTER_UIDS:
      uids.length === 0 ? "" : JSON.stringify({ uids: [...uids] }),
  };
}

function rtdnBody(payload: Record<string, unknown>, messageId: string, eventTimeMillis: number = NOW) {
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

type PlaySub = {
  subscriptionState: string;
  acknowledgementState: string;
  startTime: string;
  etag: string;
  lineItems: Array<{
    productId: string;
    expiryTime: string;
    latestSuccessfulOrderId: string;
    autoRenewingPlan: { autoRenewEnabled: boolean };
    offerDetails: { basePlanId: string };
  }>;
  externalAccountIdentifiers: { obfuscatedExternalAccountId: string };
};

type PlayOrder = {
  orderId: string;
  state: string;
  createTime: string;
  total: { currencyCode: "INR"; units: string; nanos: number };
  developerRevenueInBuyerCurrency: { currencyCode: "INR"; units: string; nanos: number };
  lineItems: Array<{
    productId: string;
    total: { currencyCode: "INR"; units: string; nanos: number };
    subscriptionDetails: { basePlanId: string; servicePeriodStartTime: string };
  }>;
  orderHistory: {
    processedEvent: { eventTime: string };
    refundEvent?: {
      eventTime: string;
      refundDetails: { total: PlayOrder["total"] };
      refundReason?: string;
    };
  };
};

class FakePlay {
  sub: PlaySub;
  orders = new Map<string, PlayOrder>();
  subsByToken = new Map<string, PlaySub>();
  unqueryableTokens = new Set<string>();
  ackCalls = 0;

  constructor(sub: PlaySub, order?: PlayOrder) {
    this.sub = sub;
    if (order?.orderId) this.orders.set(order.orderId, order);
  }

  async getSubscriptionV2(purchaseToken: string): Promise<PlaySub> {
    if (this.unqueryableTokens.has(purchaseToken)) {
      const { BillingError } = await load("functions/src/billing/errors.ts");
      throw new BillingError({
        clientCode: "verification_failed",
        causeCode: "play_api_not_found",
      });
    }
    const mapped = this.subsByToken.get(purchaseToken);
    if (mapped) return clone(mapped);
    return clone(this.sub);
  }

  async getOrder(orderId: string): Promise<PlayOrder> {
    const order = this.orders.get(orderId);
    if (!order) {
      const { BillingError } = await load("functions/src/billing/errors.ts");
      throw new BillingError({
        clientCode: "verification_failed",
        causeCode: "play_api_not_found",
      });
    }
    return clone(order);
  }

  async acknowledgeSubscription(): Promise<void> {
    this.ackCalls += 1;
    if (this.sub.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING") {
      this.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
    }
  }

  async reviewRefund(): Promise<void> {}
}

async function main(): Promise<void> {
  console.log("TEAM5_ALREADY_OWNED_PLAY_LIFECYCLE");
  console.log(`ROOT=${ROOT}`);
  console.log("label=INJECTED");
  console.log(`expected_application_sha=${APP_SHA}`);
  console.log(`prior_sha=${PRIOR_SHA}`);

  const head = git(["rev-parse", "HEAD"]);
  console.log(`imported_repo_HEAD=${head}`);
  const billingDiff = git([
    "diff",
    "--stat",
    APP_SHA,
    "HEAD",
    "--",
    "functions/src/billing",
    "src/billing",
    "eas.json",
    "app.json",
    "app",
    "firebase.json",
    "package.json",
    "tools/billing-acceptance",
  ]);
  assert.equal(billingDiff, "", "imported billing/client blobs must match 60c4bc1");
  const otherAppDiff = git([
    "diff",
    "--stat",
    APP_SHA,
    "HEAD",
    "--",
    "functions",
    "src",
  ]);
  if (otherAppDiff) {
    console.log("NOTE later_combined_application_paths_outside_this_slice:");
    console.log(otherAppDiff);
  }

  const {
    processAndroidPurchaseToken,
    processAndroidVoidedPurchase,
  } = await load("functions/src/billing/google/androidSubscriptionAdapter.ts");
  const { handleValidateAndActivateAndroid } = await load(
    "functions/src/billing/callables/validateAndActivateAndroid.ts"
  );
  const { handlePrepareAndroidBillingAccount } = await load(
    "functions/src/billing/callables/prepareAndroidBillingAccount.ts"
  );
  const { handleAndroidRtdnHttp } = await load("functions/src/billing/callables/androidRtdn.ts");
  const { handleAndroidRtdn } = await load("functions/src/billing/google/rtdn.ts");
  const { InMemoryCredentialCipher, credentialFingerprint } = await load(
    "functions/src/billing/crypto.ts"
  );
  const { diagnosticUidHmac } = await load("functions/src/billing/diagnosticUid.ts");
  const { BillingError } = await load("functions/src/billing/errors.ts");
  const { companyBillingPath, subscriptionStatusPath } = await load(
    "functions/src/billing/paths.ts"
  );
  const { MemoryBillingStore } = await load("functions/src/billing/store.ts");
  const { obfuscatedAccountIdForUid } = await load(
    "functions/src/billing/google/playOwnership.ts"
  );
  const { isPlayBillingEnabled } = await load("functions/src/billing/google/playConstants.ts");
  const grinCleanupAtApp = git(["show", `${APP_SHA}:functions/src/deletion/grinCleanupLists.ts`]);
  assert.match(grinCleanupAtApp, /export const INCLUDE_GRIN_IN_ACCOUNT_PURGE = false/);

  function activeSub(uid = UID, orderId = ORDER1): PlaySub {
    return {
      subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
      acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
      startTime: rfc(NOW),
      etag: "etag-t5-active-1",
      lineItems: [
        {
          productId: "vyd_professional",
          expiryTime: rfc(FUTURE),
          latestSuccessfulOrderId: orderId,
          autoRenewingPlan: { autoRenewEnabled: true },
          offerDetails: { basePlanId: "monthly" },
        },
      ],
      externalAccountIdentifiers: {
        obfuscatedExternalAccountId: obfuscatedAccountIdForUid(uid),
      },
    };
  }

  function paidOrder(orderId: string, createTime = rfc(NOW)): PlayOrder {
    const total = { currencyCode: "INR" as const, units: "249", nanos: 0 };
    return {
      orderId,
      state: "PROCESSED",
      createTime,
      total,
      developerRevenueInBuyerCurrency: { currencyCode: "INR", units: "1", nanos: 0 },
      lineItems: [
        {
          productId: "vyd_professional",
          total,
          subscriptionDetails: {
            basePlanId: "monthly",
            servicePeriodStartTime: createTime,
          },
        },
      ],
      orderHistory: {
        processedEvent: { eventTime: createTime },
      },
    };
  }

  function refundedOrder(order: PlayOrder, refundEventTime: string): PlayOrder {
    return {
      ...order,
      state: "REFUNDED",
      orderHistory: {
        processedEvent: order.orderHistory.processedEvent,
        refundEvent: {
          eventTime: refundEventTime,
          refundDetails: { total: order.total },
          refundReason: "OTHER",
        },
      },
    };
  }

  async function primedDeps(play: FakePlay) {
    const store = new MemoryBillingStore();
    const cipher = new InMemoryCredentialCipher();
    await handlePrepareAndroidBillingAccount(store, UID, NOW);
    const deps = {
      store,
      play,
      cipher,
      diagnosticUidFor: (uid: string) => diagnosticUidHmac(SECRET, uid),
      nowMs: () => NOW,
      enforceRestrictedTesters: true,
      restrictedTesterEnv: restrictedTesterEnv([UID]),
    };
    return { deps, store };
  }

  async function grantWhileListed() {
    const play = new FakePlay(activeSub(), paidOrder(ORDER1));
    const { deps, store } = await primedDeps(play);
    const granted = await processAndroidPurchaseToken(deps, {
      purchaseToken: TOKEN,
      callerUid: UID,
      source: "androidValidation",
      eventSource: "callable",
    });
    assert.equal(granted.to?.entitlementActive, true);
    assert.equal(granted.to?.billingStatus, "active");
    play.sub.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
    return { deps, store, play, granted };
  }

  // 1. listed tester gets entitlement
  {
    const { granted, store } = await grantWhileListed();
    assert.equal(granted.to?.entitlementActive, true);
    assert.equal(granted.to?.billingStatus, "active");
    const status = store.docs.get(subscriptionStatusPath(UID)) as {
      entitlementActive?: boolean;
    };
    assert.equal(status.entitlementActive, true);
    console.log("PASS 1 listed_tester_gets_entitlement");
  }

  // 2+3. remove from allowlist → expire / voided refund update entitlement
  {
    const { deps, store, play } = await grantWhileListed();
    deps.restrictedTesterEnv = restrictedTesterEnv([]);
    play.sub.subscriptionState = "SUBSCRIPTION_STATE_EXPIRED";
    const expired = await processAndroidPurchaseToken(deps, {
      purchaseToken: TOKEN,
      source: "rtdn",
      eventSource: "webhook",
      eventTimeMillis: NOW + 1000,
    });
    assert.notEqual(expired.resultSummary, "play_billing_tester_not_allowlisted");
    assert.equal(expired.to?.billingStatus, "expired");
    assert.equal(expired.to?.entitlementActive, false);
    const afterExpire = store.docs.get(subscriptionStatusPath(UID)) as {
      billingStatus?: string;
      entitlementActive?: boolean;
    };
    assert.equal(afterExpire.billingStatus, "expired");
    assert.equal(afterExpire.entitlementActive, false);
    console.log("PASS 2/3a delist_then_expire_updates_entitlement");
  }

  {
    const { deps, store, play } = await grantWhileListed();
    deps.restrictedTesterEnv = restrictedTesterEnv([]);
    play.sub.subscriptionState = "SUBSCRIPTION_STATE_EXPIRED";
    play.orders.set(ORDER1, refundedOrder(play.orders.get(ORDER1)!, rfc(NOW + 1000)));
    const revoked = await processAndroidVoidedPurchase(deps, {
      purchaseToken: TOKEN,
      orderId: ORDER1,
      productType: 1,
      refundType: 1,
      source: "rtdn",
      eventTimeMillis: NOW + 1000,
    });
    assert.notEqual(revoked.resultSummary, "play_billing_tester_not_allowlisted");
    assert.equal(revoked.reconciliationRequired, false);
    assert.equal(revoked.to?.billingStatus, "expired");
    assert.equal(revoked.to?.entitlementActive, false);
    assert.equal(revoked.financialEventWritten, true);
    const status = store.docs.get(subscriptionStatusPath(UID)) as {
      billingStatus?: string;
      entitlementActive?: boolean;
    };
    assert.equal(status.billingStatus, "expired");
    assert.equal(status.entitlementActive, false);

    const viaRtdnGrant = await grantWhileListed();
    viaRtdnGrant.deps.restrictedTesterEnv = restrictedTesterEnv([]);
    viaRtdnGrant.play.sub.subscriptionState = "SUBSCRIPTION_STATE_EXPIRED";
    viaRtdnGrant.play.orders.set(
      ORDER1,
      refundedOrder(viaRtdnGrant.play.orders.get(ORDER1)!, rfc(NOW + 2000))
    );
    const rtdnVoid = await handleAndroidRtdn(
      viaRtdnGrant.deps,
      rtdnBody(
        {
          voidedPurchaseNotification: {
            purchaseToken: TOKEN,
            orderId: ORDER1,
            productType: 1,
            refundType: 1,
          },
        },
        "t5-voided-after-delist",
        NOW + 2000
      )
    );
    assert.notEqual(rtdnVoid.billing?.resultSummary, "play_billing_tester_not_allowlisted");
    assert.equal(rtdnVoid.billing?.to?.entitlementActive, false);
    console.log("PASS 3b delist_then_voided_refund_updates_entitlement");
  }

  // 4. new grant / RTDN type 4 with no owned token still denied when not listed
  {
    const play = new FakePlay(activeSub(), paidOrder(ORDER1));
    const { deps, store } = await primedDeps(play);
    deps.restrictedTesterEnv = restrictedTesterEnv([]);
    await assert.rejects(
      processAndroidPurchaseToken(deps, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      }),
      isCause(BillingError, "play_billing_tester_not_allowlisted")
    );
    assert.equal(store.docs.has(subscriptionStatusPath(UID)), false);

    const rtdnPlay = new FakePlay(activeSub(), paidOrder(ORDER2));
    const rtdnPrimed = await primedDeps(rtdnPlay);
    rtdnPrimed.deps.restrictedTesterEnv = restrictedTesterEnv([]);
    await assert.rejects(
      handleAndroidRtdn(
        rtdnPrimed.deps,
        rtdnBody(
          { subscriptionNotification: { notificationType: 4, purchaseToken: TOKEN } },
          "t5-type4-deny"
        )
      ),
      isCause(BillingError, "play_billing_tester_not_allowlisted")
    );
    assert.equal(rtdnPrimed.store.docs.has(subscriptionStatusPath(UID)), false);

    const { deps: ownedDeps, store: ownedStore, play: ownedPlay } = await grantWhileListed();
    ownedDeps.restrictedTesterEnv = restrictedTesterEnv([]);
    ownedPlay.subsByToken.set(TOKEN_NEW, activeSub(UID, ORDER2));
    ownedPlay.orders.set(ORDER2, paidOrder(ORDER2));
    await assert.rejects(
      processAndroidPurchaseToken(ownedDeps, {
        purchaseToken: TOKEN_NEW,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      }),
      isCause(BillingError, "play_billing_tester_not_allowlisted")
    );
    const still = ownedStore.docs.get(subscriptionStatusPath(UID)) as {
      entitlementActive?: boolean;
    };
    assert.equal(still.entitlementActive, true);
    const company = ownedStore.docs.get(companyBillingPath(UID)) as {
      credentialFingerprint?: string;
    };
    assert.equal(company.credentialFingerprint, credentialFingerprint(TOKEN));

    const restored = await handleValidateAndActivateAndroid(ownedDeps, {
      uid: UID,
      purchaseToken: TOKEN,
    });
    assert.equal(restored.to?.entitlementActive, true);
    assert.notEqual(restored.resultSummary, "play_billing_tester_not_allowlisted");
    console.log("PASS 4 new_grant_and_type4_denied_existing_not_cleared");
  }

  // 5. different uid cannot receive the token
  {
    const { deps, store, play } = await grantWhileListed();
    deps.restrictedTesterEnv = restrictedTesterEnv([OTHER]);
    await handlePrepareAndroidBillingAccount(store, OTHER, NOW);
    await assert.rejects(
      processAndroidPurchaseToken(deps, {
        purchaseToken: TOKEN,
        callerUid: OTHER,
        source: "androidValidation",
        eventSource: "callable",
      }),
      isCause(BillingError, "play_account_owner_mismatch")
    );
    assert.equal(store.docs.has(subscriptionStatusPath(OTHER)), false);
    assert.equal(
      (store.docs.get(subscriptionStatusPath(UID)) as { entitlementActive?: boolean })
        .entitlementActive,
      true
    );

    play.sub.externalAccountIdentifiers = {
      obfuscatedExternalAccountId: obfuscatedAccountIdForUid(OTHER),
    };
    await assert.rejects(
      processAndroidPurchaseToken(deps, {
        purchaseToken: TOKEN,
        callerUid: OTHER,
        source: "androidValidation",
        eventSource: "callable",
      }),
      isCause(BillingError, "play_credential_index_collision")
    );
    assert.equal(store.docs.has(subscriptionStatusPath(OTHER)), false);
    assert.equal(
      (store.docs.get(subscriptionStatusPath(UID)) as { entitlementActive?: boolean })
        .entitlementActive,
      true
    );
    console.log("PASS 5 different_uid_cannot_receive_token");
  }

  // 6. failed verification does not clear valid paid entitlement
  {
    const { deps, store, play } = await grantWhileListed();
    deps.restrictedTesterEnv = restrictedTesterEnv([]);
    play.unqueryableTokens.add(TOKEN);
    await assert.rejects(
      processAndroidPurchaseToken(deps, {
        purchaseToken: TOKEN,
        callerUid: UID,
        source: "androidValidation",
        eventSource: "callable",
      }),
      isCause(BillingError, "play_api_not_found")
    );
    const stillActive = store.docs.get(subscriptionStatusPath(UID)) as {
      entitlementActive?: boolean;
      billingStatus?: string;
    };
    assert.equal(stillActive.entitlementActive, true);
    assert.equal(stillActive.billingStatus, "active");

    play.orders.set(ORDER1, refundedOrder(play.orders.get(ORDER1)!, rfc(NOW + 8000)));
    const unqueryableVoid = await processAndroidVoidedPurchase(deps, {
      purchaseToken: TOKEN,
      orderId: ORDER1,
      productType: 1,
      refundType: 1,
      source: "rtdn",
      eventTimeMillis: NOW + 8000,
    });
    assert.equal(unqueryableVoid.financialEventWritten, true);
    assert.equal(unqueryableVoid.reconciliationRequired, true);
    assert.equal(unqueryableVoid.resultSummary, "play_subscription_unqueryable");
    assert.notEqual(unqueryableVoid.resultSummary, "play_billing_tester_not_allowlisted");
    const afterVoid = store.docs.get(subscriptionStatusPath(UID)) as {
      entitlementActive?: boolean;
      billingStatus?: string;
    };
    assert.equal(afterVoid.entitlementActive, true);
    assert.equal(afterVoid.billingStatus, "active");
    console.log("PASS 6 failed_verification_does_not_clear_paid_entitlement");
  }

  // 7. duplicate / out-of-order voided events idempotent
  {
    const { deps, store, play } = await grantWhileListed();
    deps.restrictedTesterEnv = restrictedTesterEnv([]);
    play.sub.subscriptionState = "SUBSCRIPTION_STATE_EXPIRED";
    play.orders.set(ORDER1, refundedOrder(play.orders.get(ORDER1)!, rfc(NOW + 1000)));
    const first = await processAndroidVoidedPurchase(deps, {
      purchaseToken: TOKEN,
      orderId: ORDER1,
      productType: 1,
      refundType: 1,
      source: "rtdn",
      eventTimeMillis: NOW + 1000,
    });
    const dup = await processAndroidVoidedPurchase(deps, {
      purchaseToken: TOKEN,
      orderId: ORDER1,
      productType: 1,
      refundType: 1,
      source: "rtdn",
      eventTimeMillis: NOW + 1000,
    });
    const outOfOrder = await processAndroidVoidedPurchase(deps, {
      purchaseToken: TOKEN,
      orderId: ORDER1,
      productType: 1,
      refundType: 1,
      source: "rtdn",
      eventTimeMillis: NOW,
    });
    assert.equal(first.financialEventWritten, true);
    assert.equal(dup.alreadyProcessed, true);
    assert.equal(outOfOrder.alreadyProcessed, true);
    assert.notEqual(dup.resultSummary, "play_billing_tester_not_allowlisted");
    assert.notEqual(outOfOrder.resultSummary, "play_billing_tester_not_allowlisted");
    assert.equal(dup.to?.billingStatus, "expired");
    assert.equal(outOfOrder.to?.billingStatus, "expired");
    const ledgerCount = [...store.docs.keys()].filter((k: string) =>
      k.startsWith("_billingEventLedger/")
    ).length;
    assert.equal(ledgerCount, 2);
    console.log("PASS 7 duplicate_out_of_order_voided_idempotent");
  }

  // 8. purchase-entry still "0"
  {
    const eas = JSON.parse(readFileSync(join(ROOT, "eas.json"), "utf8")) as {
      build: Record<string, { env?: Record<string, string> }>;
    };
    for (const name of ["preview", "production", "internal-grin"] as const) {
      const env = eas.build[name]?.env ?? {};
      assert.equal(env.EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED, "0", name);
      assert.equal(env.EXPO_PUBLIC_QUOTA_UPSELL_ENABLED, "0", name);
    }
    console.log("PASS 8 purchase_entry_still_0");
  }

  // 9. PLAY_BILLING_ENABLED fail-closed
  {
    assert.equal(isPlayBillingEnabled({}), false);
    assert.equal(isPlayBillingEnabled({ PLAY_BILLING_ENABLED: "false" }), false);
    assert.equal(isPlayBillingEnabled({ PLAY_BILLING_ENABLED: "TRUE" }), false);
    assert.equal(isPlayBillingEnabled({ PLAY_BILLING_ENABLED: "true" }), true);
    await assert.rejects(
      handleAndroidRtdnHttp({
        authorizationHeader: undefined,
        body: {},
        deps: {} as never,
        oidcVerifier: async () => {
          throw new Error("oidc must not run while billing disabled");
        },
        playBillingEnabled: false,
        oidcExpected: { audience: "unused", serviceAccountEmail: "unused@example.com" },
      }),
      isCause(BillingError, "play_billing_disabled")
    );
    console.log("PASS 9 play_billing_enabled_fail_closed");
  }

  console.log("TEAM5_ALREADY_OWNED_PLAY_LIFECYCLE: ok");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
