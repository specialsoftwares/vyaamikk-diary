/**
 * UID-bound cache (tests L–T, N, O, P).
 */
import assert from "node:assert/strict";

import {
  DEFAULT_CLIENT_SUBSCRIPTION,
  type ClientSubscriptionStatus,
} from "./types";
import {
  SUBSCRIPTION_CACHE_KEY,
  SUBSCRIPTION_CACHE_VERSION,
  clearSubscriptionCache,
  parseSubscriptionCacheEnvelope,
  readSubscriptionCache,
  writeSubscriptionCache,
  type SubscriptionKeyValueStore,
} from "./subscriptionCache";
import { reduceCachedEntitlement } from "./reduceCachedEntitlement";
import { featuresForSubscription } from "./subscriptionFeatures";

function memoryStore(seed: Record<string, string> = {}): SubscriptionKeyValueStore & {
  data: Record<string, string>;
} {
  const data = { ...seed };
  return {
    data,
    async getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    async setItem(key, value) {
      data[key] = value;
    },
    async removeItem(key) {
      delete data[key];
    },
  };
}

function entitledProfessional(periodEnd: number): ClientSubscriptionStatus {
  return {
    ...DEFAULT_CLIENT_SUBSCRIPTION,
    plan: "professional",
    billingStatus: "active",
    entitlementActive: true,
    entitlementReason: "storeSubscriptionActive",
    currentPeriodStart: periodEnd - 86_400_000,
    currentPeriodEnd: periodEnd,
    platform: "android",
    autoRenewing: true,
  };
}

const NOW = 1_700_000_000_000;
const FUTURE = NOW + 86_400_000;
const PAST = NOW - 86_400_000;

async function main() {
{
  // L. valid cache hydrates for same uid
  const store = memoryStore();
  await writeSubscriptionCache({
    store,
    uid: "uid-a",
    status: entitledProfessional(FUTURE),
    nowMs: NOW,
  });
  const raw = store.data[SUBSCRIPTION_CACHE_KEY];
  assert.ok(raw);
  const json = JSON.parse(raw) as Record<string, unknown>;
  assert.equal(json.version, SUBSCRIPTION_CACHE_VERSION);
  assert.equal(json.uid, "uid-a");
  assert.equal(typeof json.savedAt, "number");
  assert.equal("purchaseToken" in json, false);
  assert.doesNotMatch(raw, /purchaseToken|signedTransaction|GSTIN|gstin|email|phone/i);

  const hydrated = await readSubscriptionCache({ store, uid: "uid-a", nowMs: NOW });
  assert.ok(hydrated);
  assert.equal(hydrated.status.plan, "professional");
  assert.equal(hydrated.reduced, false);
  assert.equal(featuresForSubscription(hydrated.status).canUseProfessionalBrief, true);
}

{
  // M. cache uid mismatch rejected + cleared
  const store = memoryStore();
  await writeSubscriptionCache({
    store,
    uid: "uid-a",
    status: entitledProfessional(FUTURE),
    nowMs: NOW,
  });
  const mismatch = await readSubscriptionCache({ store, uid: "uid-b", nowMs: NOW });
  assert.equal(mismatch, null);
  assert.equal(store.data[SUBSCRIPTION_CACHE_KEY], undefined);
}

{
  // N. signed-out user cannot hydrate paid cache
  const store = memoryStore();
  await writeSubscriptionCache({
    store,
    uid: "uid-a",
    status: entitledProfessional(FUTURE),
    nowMs: NOW,
  });
  const signedOut = await readSubscriptionCache({ store, uid: null, nowMs: NOW });
  assert.equal(signedOut, null);
  assert.ok(store.data[SUBSCRIPTION_CACHE_KEY], "signed-out read must not need the key to hydrate");
}

{
  // O. malformed cache rejected
  const store = memoryStore({ [SUBSCRIPTION_CACHE_KEY]: "{not-json" });
  const bad = await readSubscriptionCache({ store, uid: "uid-a", nowMs: NOW });
  assert.equal(bad, null);
  assert.equal(store.data[SUBSCRIPTION_CACHE_KEY], undefined);
}

{
  // P. unknown cache version rejected
  const store = memoryStore({
    [SUBSCRIPTION_CACHE_KEY]: JSON.stringify({
      version: 99,
      uid: "uid-a",
      savedAt: NOW,
      status: entitledProfessional(FUTURE),
    }),
  });
  assert.equal(parseSubscriptionCacheEnvelope(JSON.parse(store.data[SUBSCRIPTION_CACHE_KEY]!)), null);
  const unknown = await readSubscriptionCache({ store, uid: "uid-a", nowMs: NOW });
  assert.equal(unknown, null);
}

{
  // Q. cached currentPeriodEnd expired → free
  const expired = reduceCachedEntitlement(entitledProfessional(PAST), NOW);
  assert.equal(expired.reduced, true);
  assert.equal(expired.status.entitlementActive, false);
  assert.equal(featuresForSubscription(expired.status).canUseProfessionalFeatures, false);
  assert.equal(expired.status.currentPeriodEnd, PAST, "must not manufacture a later expiry");
}

{
  // R. cached trial expiration enforced
  const trial = {
    ...DEFAULT_CLIENT_SUBSCRIPTION,
    plan: "professional" as const,
    billingStatus: "trial" as const,
    entitlementActive: true,
    entitlementReason: "trialActive" as const,
    trialEndsAt: PAST,
  };
  const reduced = reduceCachedEntitlement(trial, NOW);
  assert.equal(reduced.reduced, true);
  assert.equal(featuresForSubscription(reduced.status).canUseProfessionalBrief, false);

  const liveTrial = reduceCachedEntitlement({ ...trial, trialEndsAt: FUTURE }, NOW);
  assert.equal(liveTrial.reduced, false);
  assert.equal(featuresForSubscription(liveTrial.status).canUseProfessionalBrief, true);
}

{
  // S. cached grace expiration enforced
  const grace = {
    ...DEFAULT_CLIENT_SUBSCRIPTION,
    plan: "starter" as const,
    billingStatus: "grace" as const,
    entitlementActive: true,
    entitlementReason: "graceRetained" as const,
    currentPeriodEnd: FUTURE,
    gracePeriodEndsAt: PAST,
  };
  const reduced = reduceCachedEntitlement(grace, NOW);
  assert.equal(reduced.reduced, true);
  assert.equal(featuresForSubscription(reduced.status).canUseStarterFeatures, false);

  const liveGrace = reduceCachedEntitlement({ ...grace, gracePeriodEndsAt: FUTURE }, NOW);
  assert.equal(liveGrace.reduced, false);
  assert.equal(featuresForSubscription(liveGrace.status).canUseStarterFeatures, true);
}

{
  // T. device time shortens stale cache but cannot extend entitlement timestamps
  const original = entitledProfessional(FUTURE);
  const later = reduceCachedEntitlement(original, FUTURE + 1);
  assert.equal(later.reduced, true);
  assert.ok((later.status.currentPeriodEnd ?? 0) <= original.currentPeriodEnd!);

  const earlierClock = reduceCachedEntitlement(original, NOW - 10_000);
  assert.equal(earlierClock.reduced, false);
  assert.equal(earlierClock.status.currentPeriodEnd, original.currentPeriodEnd);

  const missingTs = reduceCachedEntitlement(
    { ...entitledProfessional(FUTURE), currentPeriodEnd: null },
    NOW
  );
  assert.equal(missingTs.reduced, true);
  assert.equal(missingTs.status.entitlementActive, false);

  const cannotGrant = reduceCachedEntitlement(
    { ...DEFAULT_CLIENT_SUBSCRIPTION, currentPeriodEnd: FUTURE },
    NOW
  );
  assert.equal(cannotGrant.status.entitlementActive, false);
}

{
  await clearSubscriptionCache(memoryStore({ [SUBSCRIPTION_CACHE_KEY]: "x" }));
}

console.log("subscriptionCache.test.ts: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
