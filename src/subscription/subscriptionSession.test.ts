/**
 * Subscription session: listener, uid races, cache vs server (K, J, U–Y, refresh).
 */
import assert from "node:assert/strict";

import { DEFAULT_CLIENT_SUBSCRIPTION, type ClientSubscriptionStatus } from "./types";
import { createSubscriptionSession } from "./subscriptionSession";
import {
  SUBSCRIPTION_CACHE_KEY,
  writeSubscriptionCache,
  type SubscriptionKeyValueStore,
} from "./subscriptionCache";
import type { SubscriptionDocListener, SubscriptionDocObserver } from "./subscriptionFirestore";
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

const NOW = 1_700_000_000_000;
const FUTURE = NOW + 30 * 86_400_000;

function professionalDoc(): Record<string, unknown> {
  return {
    plan: "professional",
    billingStatus: "active",
    entitlementActive: true,
    entitlementReason: "storeSubscriptionActive",
    currentPeriodStart: NOW,
    currentPeriodEnd: FUTURE,
    platform: "ios",
    autoRenewing: true,
    quotaEnforcementEnabled: false,
  };
}

function professionalStatus(): ClientSubscriptionStatus {
  return {
    ...DEFAULT_CLIENT_SUBSCRIPTION,
    plan: "professional",
    billingStatus: "active",
    entitlementActive: true,
    entitlementReason: "storeSubscriptionActive",
    currentPeriodStart: NOW,
    currentPeriodEnd: FUTURE,
    platform: "ios",
    autoRenewing: true,
  };
}

interface FakeListener {
  listen: SubscriptionDocListener;
  emit(uid: string, data: unknown | null): void;
  error(uid: string, code: string): void;
  unsubCount: number;
  liveCount(): number;
  observers: Array<{ uid: string; observer: SubscriptionDocObserver; live: boolean }>;
}

function createFakeListener(): FakeListener {
  const observers: FakeListener["observers"] = [];
  const fake: FakeListener = {
    observers,
    unsubCount: 0,
    liveCount() {
      return observers.filter((o) => o.live).length;
    },
    listen(uid, observer) {
      const entry = { uid, observer, live: true };
      observers.push(entry);
      return () => {
        fake.unsubCount += 1;
        entry.live = false;
      };
    },
    emit(uid, data) {
      for (const o of observers) {
        if (o.uid === uid) o.observer.next(data);
      }
    },
    error(uid, code) {
      for (const o of observers) {
        if (o.uid === uid) o.observer.error({ code });
      }
    },
  };
  return fake;
}

async function wait(ms = 0) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
{
  // J + K. missing doc → free; server snapshot updates provider
  const store = memoryStore();
  const fake = createFakeListener();
  const views: string[] = [];
  const session = createSubscriptionSession({
    listen: fake.listen,
    read: async () => null,
    store,
    now: () => NOW,
    onChange: (v) => views.push(`${v.source}:${v.plan}:${v.isLoading}`),
  });
  session.setAuth({ status: "signed_in", uid: "uid-a" });
  await wait();
  fake.emit("uid-a", null);
  await session.flushWrites();
  const missing = session.getView();
  assert.equal(missing.source, "server");
  assert.equal(missing.plan, "free");
  assert.equal(missing.status.entitlementActive, false);
  assert.equal(missing.status.entitlementReason, "neverSubscribed");

  fake.emit("uid-a", professionalDoc());
  await session.flushWrites();
  const live = session.getView();
  assert.equal(live.source, "server");
  assert.equal(live.plan, "professional");
  assert.equal(live.features.canUseProfessionalBrief, true);
  const cached = JSON.parse(store.data[SUBSCRIPTION_CACHE_KEY]!) as { uid: string };
  assert.equal(cached.uid, "uid-a");
  session.dispose();
}

{
  // X. server state replaces cache
  const store = memoryStore();
  await writeSubscriptionCache({
    store,
    uid: "uid-a",
    status: professionalStatus(),
    nowMs: NOW,
  });
  const fake = createFakeListener();
  const session = createSubscriptionSession({
    listen: fake.listen,
    read: async () => professionalDoc(),
    store,
    now: () => NOW,
    onChange: () => {},
  });
  session.setAuth({ status: "signed_in", uid: "uid-a" });
  await wait();
  assert.equal(session.getView().source, "cache");
  assert.equal(session.getView().plan, "professional");
  fake.emit("uid-a", {
    plan: "starter",
    billingStatus: "active",
    entitlementActive: true,
    entitlementReason: "storeSubscriptionActive",
    currentPeriodEnd: FUTURE,
  });
  await session.flushWrites();
  assert.equal(session.getView().source, "server");
  assert.equal(session.getView().plan, "starter");
  assert.equal(session.getView().features.canUseProfessionalBrief, false);
  session.dispose();
}

{
  // U. uid A professional → uid B free, no leakage
  const store = memoryStore();
  const fake = createFakeListener();
  const session = createSubscriptionSession({
    listen: fake.listen,
    read: async () => null,
    store,
    now: () => NOW,
    onChange: () => {},
  });
  session.setAuth({ status: "signed_in", uid: "uid-a" });
  await wait();
  fake.emit("uid-a", professionalDoc());
  await session.flushWrites();
  assert.equal(session.getView().plan, "professional");

  session.setAuth({ status: "signed_out", uid: null });
  await session.flushWrites();
  assert.equal(session.getView().plan, "free");
  assert.equal(session.getView().features.canUseProfessionalFeatures, false);

  session.setAuth({ status: "signed_in", uid: "uid-b" });
  await wait();
  fake.emit("uid-b", null);
  await session.flushWrites();
  assert.equal(session.getView().plan, "free");
  assert.equal(session.getView().features.canUseProfessionalBrief, false);
  assert.notEqual(session.getView().status.plan, "professional");
  session.dispose();
}

{
  // V. late uid-A listener cannot overwrite uid-B state/cache
  const store = memoryStore();
  const fake = createFakeListener();
  const session = createSubscriptionSession({
    listen: fake.listen,
    read: async () => null,
    store,
    now: () => NOW,
    onChange: () => {},
  });
  session.setAuth({ status: "signed_in", uid: "uid-a" });
  await wait();
  const aObserver = fake.observers[0];
  session.setAuth({ status: "signed_in", uid: "uid-b" });
  await wait();
  fake.emit("uid-b", {
    plan: "free",
    billingStatus: "expired",
    entitlementActive: false,
    entitlementReason: "neverSubscribed",
  });
  await session.flushWrites();

  aObserver.observer.next(professionalDoc());
  await session.flushWrites();
  assert.equal(session.getView().plan, "free");
  assert.equal(session.getView().features.canUseProfessionalFeatures, false);
  const envelope = store.data[SUBSCRIPTION_CACHE_KEY]
    ? (JSON.parse(store.data[SUBSCRIPTION_CACHE_KEY]!) as { uid: string; status: { plan: string } })
    : null;
  if (envelope) {
    assert.equal(envelope.uid, "uid-b");
    assert.notEqual(envelope.status.plan, "professional");
  }
  session.dispose();
}

{
  // W. listener cleanup on auth change
  const store = memoryStore();
  const fake = createFakeListener();
  const session = createSubscriptionSession({
    listen: fake.listen,
    read: async () => null,
    store,
    now: () => NOW,
    onChange: () => {},
  });
  session.setAuth({ status: "signed_in", uid: "uid-a" });
  await wait();
  assert.equal(fake.liveCount(), 1);
  session.setAuth({ status: "signed_in", uid: "uid-b" });
  await wait();
  assert.ok(fake.unsubCount >= 1);
  assert.equal(fake.liveCount(), 1);
  session.setAuth({ status: "signed_out", uid: null });
  assert.equal(fake.liveCount(), 0);
  session.dispose();
}

{
  // Y. temporary network failure retains valid same-uid cache
  const store = memoryStore();
  const fake = createFakeListener();
  const session = createSubscriptionSession({
    listen: fake.listen,
    read: async () => {
      throw { code: "unavailable" };
    },
    store,
    now: () => NOW,
    onChange: () => {},
  });
  session.setAuth({ status: "signed_in", uid: "uid-a" });
  await wait();
  fake.emit("uid-a", professionalDoc());
  await session.flushWrites();
  fake.error("uid-a", "unavailable");
  const after = session.getView();
  assert.equal(after.plan, "professional");
  assert.equal(after.features.canUseProfessionalBrief, true);
  assert.equal(after.error, null);
  assert.equal(after.isOffline, true);

  fake.error("uid-a", "permission-denied");
  assert.equal(session.getView().plan, "free");
  assert.equal(session.getView().error, "permission-denied");
  session.dispose();
}

{
  // refresh re-reads Firestore only
  const store = memoryStore();
  let reads = 0;
  const fake = createFakeListener();
  const session = createSubscriptionSession({
    listen: fake.listen,
    read: async () => {
      reads += 1;
      return {
        plan: "business",
        billingStatus: "active",
        entitlementActive: true,
        currentPeriodEnd: FUTURE,
      };
    },
    store,
    now: () => NOW,
    onChange: () => {},
  });
  session.setAuth({ status: "signed_in", uid: "uid-a" });
  await wait();
  fake.emit("uid-a", professionalDoc());
  await session.flushWrites();
  await session.refresh();
  assert.equal(reads, 1);
  assert.equal(session.getView().plan, "business");
  assert.equal(session.getView().source, "server");
  session.dispose();
}

{
  // signed-out never shows cached professional
  const store = memoryStore();
  await writeSubscriptionCache({
    store,
    uid: "uid-a",
    status: professionalStatus(),
    nowMs: NOW,
  });
  const fake = createFakeListener();
  const session = createSubscriptionSession({
    listen: fake.listen,
    read: async () => professionalDoc(),
    store,
    now: () => NOW,
    onChange: () => {},
  });
  session.setAuth({ status: "signed_out", uid: null });
  await wait();
  assert.equal(session.getView().plan, "free");
  assert.equal(featuresForSubscription(session.getView().status).canUseProfessionalFeatures, false);
  session.dispose();
}

console.log("subscriptionSession.test.ts: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
