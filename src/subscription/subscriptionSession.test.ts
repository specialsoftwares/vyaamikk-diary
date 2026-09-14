/**
 * Subscription session: listener, uid races, cache vs server (K, J, U–Y, refresh).
 */
import assert from "node:assert/strict";

import { DEFAULT_CLIENT_SUBSCRIPTION, type ClientSubscriptionStatus } from "./types";
import { createSubscriptionSession } from "./subscriptionSession";
import {
  SUBSCRIPTION_CACHE_KEY,
  readSubscriptionCache,
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

function starterStatus(): ClientSubscriptionStatus {
  return {
    ...DEFAULT_CLIENT_SUBSCRIPTION,
    plan: "starter",
    billingStatus: "active",
    entitlementActive: true,
    entitlementReason: "storeSubscriptionActive",
    currentPeriodStart: NOW,
    currentPeriodEnd: FUTURE,
    platform: "android",
    autoRenewing: true,
  };
}

function businessDoc(): Record<string, unknown> {
  return {
    plan: "business",
    billingStatus: "active",
    entitlementActive: true,
    entitlementReason: "storeSubscriptionActive",
    currentPeriodStart: NOW,
    currentPeriodEnd: FUTURE,
    platform: "ios",
    autoRenewing: true,
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
  emit(uid: string, data: unknown | null, fromCache?: boolean): void;
  error(uid: string, code: string): void;
  unsubCount: number;
  liveCount(): number;
  observers: { uid: string; observer: SubscriptionDocObserver; live: boolean }[];
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
    emit(uid, data, fromCache = false) {
      for (const o of observers) {
        if (o.live && o.uid === uid) o.observer.next({ data, fromCache });
      }
    },
    error(uid, code) {
      for (const o of observers) {
        if (o.live && o.uid === uid) o.observer.error({ code });
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

  aObserver.observer.next({ data: professionalDoc(), fromCache: false });
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
  await session.flushWrites();
  assert.equal(session.getView().plan, "free");
  assert.equal(session.getView().error, "permission-denied");
  assert.equal(store.data[SUBSCRIPTION_CACHE_KEY], undefined);
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

{
  // A/B. Firestore fromCache=true expired professional → free, not server, no persist
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
  fake.emit(
    "uid-a",
    {
      ...professionalDoc(),
      currentPeriodEnd: NOW - 1,
    },
    true
  );
  await session.flushWrites();
  assert.notEqual(session.getView().source, "server");
  assert.equal(session.getView().plan, "free");
  assert.equal(session.getView().features.canUseProfessionalFeatures, false);
  assert.equal(store.data[SUBSCRIPTION_CACHE_KEY], undefined);
  session.dispose();
}

{
  // C. fromCache=true valid professional from default/free must NOT widen
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
  fake.emit("uid-a", professionalDoc(), true);
  await session.flushWrites();
  assert.equal(session.getView().plan, "free");
  assert.equal(session.getView().features.canUseProfessionalFeatures, false);
  assert.notEqual(session.getView().source, "server");
  assert.equal(store.data[SUBSCRIPTION_CACHE_KEY], undefined, "must not persist Firestore cache as server evidence");
  session.dispose();
}

{
  // D. metadata-only fromCache true→false upgrades to server even if bytes match
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
  fake.emit("uid-a", professionalDoc(), true);
  assert.notEqual(session.getView().source, "server");
  assert.equal(session.getView().plan, "free");
  fake.emit("uid-a", professionalDoc(), false);
  await session.flushWrites();
  assert.equal(session.getView().source, "server");
  assert.equal(session.getView().plan, "professional");
  const env = JSON.parse(store.data[SUBSCRIPTION_CACHE_KEY]!) as { uid: string; status: { plan: string } };
  assert.equal(env.uid, "uid-a");
  assert.equal(env.status.plan, "professional");
  session.dispose();
}

{
  // E/D. cached missing doc is not authoritative; later server professional wins
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
  fake.emit("uid-a", null, true);
  assert.equal(session.getView().source, "default");
  assert.equal(session.getView().plan, "free");
  fake.emit("uid-a", professionalDoc(), false);
  await session.flushWrites();
  assert.equal(session.getView().source, "server");
  assert.equal(session.getView().plan, "professional");
  session.dispose();
}

{
  // F. fromCache=false missing doc is authoritative free
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
  fake.emit("uid-a", null, false);
  await session.flushWrites();
  assert.equal(session.getView().source, "server");
  assert.equal(session.getView().plan, "free");
  assert.equal(session.getView().status.entitlementReason, "neverSubscribed");
  session.dispose();
}

{
  // J/K/L/M/N. offline expiry while app remains open + timer cleanup + foreground
  const clock = { now: NOW };
  const timers: { id: number; when: number; fn: () => void }[] = [];
  let timerId = 0;
  const fake = createFakeListener();
  const store = memoryStore();
  const session = createSubscriptionSession({
    listen: fake.listen,
    read: async () => null,
    store,
    now: () => clock.now,
    onChange: () => {},
    setTimeoutFn: (fn, ms) => {
      const id = ++timerId;
      timers.push({ id, when: clock.now + Number(ms), fn });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeoutFn: (handle) => {
      const id = Number(handle);
      const idx = timers.findIndex((t) => t.id === id);
      if (idx >= 0) timers.splice(idx, 1);
    },
  });
  function fireDue() {
    const due = timers.filter((t) => t.when <= clock.now);
    for (const t of due) {
      const idx = timers.indexOf(t);
      if (idx >= 0) timers.splice(idx, 1);
      t.fn();
    }
  }

  session.setAuth({ status: "signed_in", uid: "uid-a" });
  await wait();
  const activeEnd = NOW + 5_000;
  fake.emit(
    "uid-a",
    { ...professionalDoc(), currentPeriodEnd: activeEnd },
    false
  );
  session.setOffline(true);
  assert.equal(session.getView().plan, "professional");
  assert.ok(timers.length >= 1);
  clock.now = activeEnd;
  fireDue();
  assert.equal(session.getView().plan, "free", "J. offline active expires");
  assert.equal(session.getView().features.canUseProfessionalFeatures, false);

  const trialEnd = clock.now + 5_000;
  fake.emit(
    "uid-a",
    {
      plan: "professional",
      billingStatus: "trial",
      entitlementActive: true,
      trialEndsAt: trialEnd,
    },
    false
  );
  session.setOffline(true);
  assert.equal(session.getView().plan, "professional");
  clock.now = trialEnd;
  fireDue();
  assert.equal(session.getView().plan, "free", "K. offline trial expires");

  const graceEnd = clock.now + 5_000;
  fake.emit(
    "uid-a",
    {
      plan: "starter",
      billingStatus: "grace",
      entitlementActive: true,
      currentPeriodEnd: graceEnd + 10_000,
      gracePeriodEndsAt: graceEnd,
    },
    false
  );
  session.setOffline(true);
  assert.equal(session.getView().plan, "starter");
  clock.now = graceEnd;
  fireDue();
  assert.equal(session.getView().plan, "free", "L. offline grace expires");

  fake.emit("uid-a", { ...professionalDoc(), currentPeriodEnd: clock.now + 8_000 }, false);
  session.setOffline(true);
  const pending = timers.length;
  assert.ok(pending >= 1);
  session.setAuth({ status: "signed_in", uid: "uid-b" });
  await wait();
  fake.emit("uid-b", null, false);
  clock.now += 8_000;
  fireDue();
  assert.equal(session.getView().plan, "free");
  assert.equal(session.getView().ownerUid, "uid-b");
  session.dispose();
  assert.equal(timers.length, 0, "M. timers cleared on dispose");
}

{
  // N. foreground recheck catches passed boundary without waiting for timer
  const clock = { now: NOW };
  const fake = createFakeListener();
  const session = createSubscriptionSession({
    listen: fake.listen,
    read: async () => null,
    store: memoryStore(),
    now: () => clock.now,
    onChange: () => {},
  });
  session.setAuth({ status: "signed_in", uid: "uid-a" });
  await wait();
  fake.emit("uid-a", { ...professionalDoc(), currentPeriodEnd: NOW + 1_000 }, false);
  session.setOffline(true);
  clock.now = NOW + 2_000;
  session.notifyForeground();
  assert.equal(session.getView().plan, "free");
  session.dispose();
}

{
  // Network error after expiry must reduce before retaining access
  const store = memoryStore();
  const fake = createFakeListener();
  const clock = { now: NOW };
  const session = createSubscriptionSession({
    listen: fake.listen,
    read: async () => {
      throw { code: "unavailable" };
    },
    store,
    now: () => clock.now,
    onChange: () => {},
  });
  session.setAuth({ status: "signed_in", uid: "uid-a" });
  await wait();
  fake.emit("uid-a", { ...professionalDoc(), currentPeriodEnd: NOW + 1_000 }, false);
  await session.flushWrites();
  assert.equal(session.getView().plan, "professional");
  clock.now = NOW + 2_000;
  fake.error("uid-a", "unavailable");
  assert.equal(session.getView().plan, "free");
  assert.equal(session.getView().isOffline, true);
  assert.equal(session.getView().features.canUseProfessionalFeatures, false);
  session.dispose();
}

{
  // S/T. refresh auth failure clears cache
  for (const code of ["permission-denied", "unauthenticated", "auth/user-token-expired"] as const) {
    const store = memoryStore();
    const fake = createFakeListener();
    const session = createSubscriptionSession({
      listen: fake.listen,
      read: async () => {
        throw { code };
      },
      store,
      now: () => NOW,
      onChange: () => {},
    });
    session.setAuth({ status: "signed_in", uid: "uid-a" });
    await wait();
    fake.emit("uid-a", professionalDoc(), false);
    await session.flushWrites();
    assert.ok(store.data[SUBSCRIPTION_CACHE_KEY]);
    await session.refresh();
    await session.flushWrites();
    assert.equal(session.getView().plan, "free");
    assert.equal(session.getView().error, code);
    assert.equal(store.data[SUBSCRIPTION_CACHE_KEY], undefined, `${code} must clear cache`);
    session.dispose();
  }
}

{
  // U. in-flight A setItem cannot remain as B's final cache
  const data: Record<string, string> = {};
  let gate: Promise<void> | null = null;
  let releaseGate: () => void = () => {};
  const store: SubscriptionKeyValueStore & { data: Record<string, string> } = {
    data,
    async getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    async setItem(key, value) {
      if (gate) await gate;
      data[key] = value;
    },
    async removeItem(key) {
      delete data[key];
    },
  };
  gate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });
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
  fake.emit("uid-a", professionalDoc(), false);
  await wait();
  session.setAuth({ status: "signed_in", uid: "uid-b" });
  await wait();
  releaseGate();
  gate = null;
  await wait();
  fake.emit("uid-b", null, false);
  await session.flushWrites();
  await wait();
  const finalRaw = store.data[SUBSCRIPTION_CACHE_KEY];
  if (finalRaw) {
    const env = JSON.parse(finalRaw) as { uid: string; status: { plan: string } };
    assert.equal(env.uid, "uid-b");
    assert.notEqual(env.status.plan, "professional");
  }
  assert.equal(session.getView().plan, "free");
  assert.equal(session.getView().ownerUid, "uid-b");
  session.dispose();
}

{
  // V. late A clear cannot delete B cache
  const data: Record<string, string> = {};
  let removeGate: Promise<void> | null = null;
  let releaseRemove: () => void = () => {};
  const store: SubscriptionKeyValueStore & { data: Record<string, string> } = {
    data,
    async getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    async setItem(key, value) {
      data[key] = value;
    },
    async removeItem(key) {
      if (removeGate) await removeGate;
      delete data[key];
    },
  };
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
  fake.emit("uid-a", professionalDoc(), false);
  await session.flushWrites();
  removeGate = new Promise<void>((resolve) => {
    releaseRemove = resolve;
  });
  fake.error("uid-a", "permission-denied");
  await wait();
  session.setAuth({ status: "signed_in", uid: "uid-b" });
  await wait();
  releaseRemove();
  removeGate = null;
  await session.flushWrites();
  await wait();
  fake.emit("uid-b", professionalDoc(), false);
  await session.flushWrites();
  await wait();
  const env = JSON.parse(store.data[SUBSCRIPTION_CACHE_KEY]!) as { uid: string; status: { plan: string } };
  assert.equal(env.uid, "uid-b");
  assert.equal(env.status.plan, "professional");
  session.dispose();
}

{
  // Round 2 A. Firestore fromCache Professional from default/free stays free
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
  assert.equal(session.getView().plan, "free");
  fake.emit("uid-a", professionalDoc(), true);
  await session.flushWrites();
  assert.equal(session.getView().plan, "free");
  assert.equal(session.getView().features.canUseProfessionalFeatures, false);
  session.dispose();
}

{
  // Round 2 B. Firestore cache Business from no accepted entitlement stays free
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
  fake.emit("uid-a", businessDoc(), true);
  assert.equal(session.getView().plan, "free");
  assert.equal(session.getView().features.canUseBusinessFeatures, false);
  session.dispose();
}

{
  // Round 2 C. AsyncStorage Starter + Firestore cache Professional must not widen
  const store = memoryStore();
  await writeSubscriptionCache({
    store,
    uid: "uid-a",
    status: starterStatus(),
    nowMs: NOW,
  });
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
  assert.equal(session.getView().plan, "starter");
  fake.emit("uid-a", professionalDoc(), true);
  assert.equal(session.getView().plan, "starter");
  assert.equal(session.getView().features.canUseProfessionalFeatures, false);
  session.dispose();
}

{
  // Round 2 D. Accepted AsyncStorage Professional + same Firestore cache may remain
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
    read: async () => null,
    store,
    now: () => NOW,
    onChange: () => {},
  });
  session.setAuth({ status: "signed_in", uid: "uid-a" });
  await wait();
  fake.emit("uid-a", professionalDoc(), true);
  assert.equal(session.getView().plan, "professional");
  assert.equal(session.getView().source, "cache");
  session.dispose();
}

{
  // Round 2 E. Accepted paid continuity may be narrowed by cached expired/onHold
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
    read: async () => null,
    store,
    now: () => NOW,
    onChange: () => {},
  });
  session.setAuth({ status: "signed_in", uid: "uid-a" });
  await wait();
  assert.equal(session.getView().plan, "professional");
  fake.emit(
    "uid-a",
    {
      plan: "professional",
      billingStatus: "onHold",
      entitlementActive: true,
    },
    true
  );
  assert.equal(session.getView().plan, "free");
  assert.equal(session.getView().features.canUseProfessionalFeatures, false);
  session.dispose();
}

{
  // Round 2 F. fromCache=false Professional after local-safe free is accepted
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
  fake.emit("uid-a", professionalDoc(), true);
  assert.equal(session.getView().plan, "free");
  fake.emit("uid-a", professionalDoc(), false);
  await session.flushWrites();
  assert.equal(session.getView().source, "server");
  assert.equal(session.getView().plan, "professional");
  session.dispose();
}

{
  // Round 2 G. getDocFromServer Professional is accepted
  const store = memoryStore();
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
  fake.emit("uid-a", professionalDoc(), true);
  assert.equal(session.getView().plan, "free");
  await session.refresh();
  assert.equal(session.getView().source, "server");
  assert.equal(session.getView().plan, "professional");
  session.dispose();
}

{
  // Round 2 auth-failure latch: fromCache paid must stay free
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
  fake.emit("uid-a", professionalDoc(), false);
  await session.flushWrites();
  assert.equal(session.getView().plan, "professional");
  fake.error("uid-a", "permission-denied");
  await session.flushWrites();
  assert.equal(session.getView().plan, "free");
  fake.emit("uid-a", professionalDoc(), true);
  assert.equal(session.getView().plan, "free");
  assert.equal(session.getView().features.canUseProfessionalFeatures, false);
  fake.emit("uid-a", professionalDoc(), false);
  await session.flushWrites();
  assert.equal(session.getView().plan, "professional");
  session.dispose();
}

{
  // Round 2 clock-rollback hydration + Firestore cache cannot restore paid
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
    read: async () => null,
    store,
    now: () => NOW - 1,
    onChange: () => {},
  });
  session.setAuth({ status: "signed_in", uid: "uid-a" });
  await wait();
  assert.equal(session.getView().plan, "free");
  fake.emit("uid-a", professionalDoc(), true);
  assert.equal(session.getView().plan, "free");
  assert.equal(session.getView().features.canUseProfessionalFeatures, false);
  session.dispose();
}

{
  // Round 2 runtime clock rollback A/C/D
  const clock = { now: NOW };
  const fake = createFakeListener();
  const session = createSubscriptionSession({
    listen: fake.listen,
    read: async () => professionalDoc(),
    store: memoryStore(),
    now: () => clock.now,
    onChange: () => {},
  });
  session.setAuth({ status: "signed_in", uid: "uid-a" });
  await wait();
  fake.emit("uid-a", professionalDoc(), false);
  session.setOffline(true);
  assert.equal(session.getView().plan, "professional");
  clock.now = NOW - 1;
  session.notifyForeground();
  assert.equal(session.getView().plan, "free", "A. post-hydration rollback → free");
  fake.emit("uid-a", professionalDoc(), true);
  assert.equal(session.getView().plan, "free", "C. rollback + Firestore cache stays free");
  clock.now = NOW - 1;
  fake.emit("uid-a", professionalDoc(), false);
  await session.flushWrites();
  assert.equal(session.getView().plan, "professional", "D. fresh server restores after rollback");
  session.dispose();
}

{
  // Round 2 runtime clock B. timer callback after rollback fail-closes, no extend
  const clock = { now: NOW };
  const timers: { id: number; when: number; fn: () => void }[] = [];
  let timerId = 0;
  const fake = createFakeListener();
  const session = createSubscriptionSession({
    listen: fake.listen,
    read: async () => null,
    store: memoryStore(),
    now: () => clock.now,
    onChange: () => {},
    setTimeoutFn: (fn, ms) => {
      const id = ++timerId;
      timers.push({ id, when: clock.now + Number(ms), fn });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeoutFn: (handle) => {
      const id = Number(handle);
      const idx = timers.findIndex((t) => t.id === id);
      if (idx >= 0) timers.splice(idx, 1);
    },
  });
  session.setAuth({ status: "signed_in", uid: "uid-a" });
  await wait();
  fake.emit("uid-a", { ...professionalDoc(), currentPeriodEnd: NOW + 8_000 }, false);
  session.setOffline(true);
  assert.equal(session.getView().plan, "professional");
  assert.ok(timers.length >= 1);
  const created = timerId;
  const pending = timers[0];
  clock.now = NOW - 1;
  pending.fn();
  assert.equal(session.getView().plan, "free");
  assert.equal(session.getView().features.canUseProfessionalFeatures, false);
  assert.equal(timerId, created, "must not reschedule an extending timer");
  session.dispose();
}

{
  // Round 3 A. Professional T1 + cached Starter T2 must not survive to T2
  const T1 = NOW + 5 * 60_000;
  const T2 = NOW + 30 * 86_400_000;
  const clock = { now: NOW };
  const store = memoryStore();
  await writeSubscriptionCache({
    store,
    uid: "uid-a",
    status: { ...professionalStatus(), currentPeriodEnd: T1 },
    nowMs: NOW,
  });
  const fake = createFakeListener();
  const session = createSubscriptionSession({
    listen: fake.listen,
    read: async () => null,
    store,
    now: () => clock.now,
    onChange: () => {},
  });
  session.setAuth({ status: "signed_in", uid: "uid-a" });
  await wait();
  fake.emit(
    "uid-a",
    {
      plan: "starter",
      billingStatus: "active",
      entitlementActive: true,
      currentPeriodEnd: T2,
    },
    true
  );
  assert.equal(session.getView().plan, "professional");
  assert.equal(session.getView().status.currentPeriodEnd, T1);
  clock.now = T1;
  session.notifyForeground();
  assert.equal(session.getView().plan, "free");
  assert.equal(session.getView().features.canUseStarterFeatures, false);
  session.dispose();
}

{
  // Round 3 B. Business T1 + cached Professional T2 → free at T1
  const T1 = NOW + 5 * 60_000;
  const T2 = NOW + 30 * 86_400_000;
  const clock = { now: NOW };
  const store = memoryStore();
  await writeSubscriptionCache({
    store,
    uid: "uid-a",
    status: {
      ...professionalStatus(),
      plan: "business",
      currentPeriodEnd: T1,
    },
    nowMs: NOW,
  });
  const fake = createFakeListener();
  const session = createSubscriptionSession({
    listen: fake.listen,
    read: async () => null,
    store,
    now: () => clock.now,
    onChange: () => {},
  });
  session.setAuth({ status: "signed_in", uid: "uid-a" });
  await wait();
  fake.emit("uid-a", { ...professionalDoc(), currentPeriodEnd: T2 }, true);
  assert.equal(session.getView().plan, "business");
  clock.now = T1;
  session.notifyForeground();
  assert.equal(session.getView().plan, "free");
  session.dispose();
}

{
  // Round 3 C. trial T1 + cached Starter T2 cannot outlive the trial ceiling
  const T1 = NOW + 5 * 60_000;
  const T2 = NOW + 30 * 86_400_000;
  const clock = { now: NOW };
  const store = memoryStore();
  await writeSubscriptionCache({
    store,
    uid: "uid-a",
    status: {
      ...DEFAULT_CLIENT_SUBSCRIPTION,
      plan: "professional",
      billingStatus: "trial",
      entitlementActive: true,
      entitlementReason: "trialActive",
      trialEndsAt: T1,
    },
    nowMs: NOW,
  });
  const fake = createFakeListener();
  const session = createSubscriptionSession({
    listen: fake.listen,
    read: async () => null,
    store,
    now: () => clock.now,
    onChange: () => {},
  });
  session.setAuth({ status: "signed_in", uid: "uid-a" });
  await wait();
  fake.emit(
    "uid-a",
    {
      plan: "starter",
      billingStatus: "active",
      entitlementActive: true,
      currentPeriodEnd: T2,
    },
    true
  );
  assert.equal(session.getView().plan, "professional");
  assert.equal(session.getView().status.billingStatus, "trial");
  clock.now = T1;
  session.notifyForeground();
  assert.equal(session.getView().plan, "free");
  session.dispose();
}

{
  // Round 3 D. cached effective-Free still revokes accepted paid
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
    read: async () => null,
    store,
    now: () => NOW,
    onChange: () => {},
  });
  session.setAuth({ status: "signed_in", uid: "uid-a" });
  await wait();
  fake.emit(
    "uid-a",
    { plan: "professional", billingStatus: "expired", entitlementActive: false },
    true
  );
  assert.equal(session.getView().plan, "free");
  session.dispose();
}

{
  // Round 3 queued persist: savedAt is acceptance-time, not a later rolled-back now()
  const T1 = NOW + 5_000;
  const T0 = NOW - 1_000;
  const clock = { now: NOW };
  const data: Record<string, string> = {};
  let gate: Promise<void> | null = null;
  let releaseGate: () => void = () => {};
  const store: SubscriptionKeyValueStore & { data: Record<string, string> } = {
    data,
    async getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    async setItem(key, value) {
      if (gate) await gate;
      data[key] = value;
    },
    async removeItem(key) {
      delete data[key];
    },
  };
  const fake = createFakeListener();
  const session = createSubscriptionSession({
    listen: fake.listen,
    read: async () => null,
    store,
    now: () => clock.now,
    onChange: () => {},
  });
  gate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });
  session.setAuth({ status: "signed_in", uid: "uid-a" });
  await wait();
  fake.emit("uid-a", professionalDoc(), false);
  await wait();
  clock.now = T1;
  fake.emit(
    "uid-a",
    {
      plan: "starter",
      billingStatus: "active",
      entitlementActive: true,
      currentPeriodEnd: FUTURE,
    },
    false
  );
  clock.now = T0;
  releaseGate();
  gate = null;
  await session.flushWrites();
  const env = JSON.parse(store.data[SUBSCRIPTION_CACHE_KEY]!) as {
    uid: string;
    savedAt: number;
    status: { plan: string };
  };
  assert.equal(env.uid, "uid-a");
  assert.equal(env.status.plan, "starter");
  assert.equal(env.savedAt, T1);
  assert.notEqual(env.savedAt, T0);
  const restarted = await readSubscriptionCache({ store, uid: "uid-a", nowMs: T0 });
  assert.equal(restarted, null);
  session.dispose();
}

{
  // Ordinary no-rollback authoritative persist still records acceptance-time savedAt
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
  fake.emit("uid-a", professionalDoc(), false);
  await session.flushWrites();
  const env = JSON.parse(store.data[SUBSCRIPTION_CACHE_KEY]!) as { savedAt: number; status: { plan: string } };
  assert.equal(env.savedAt, NOW);
  assert.equal(env.status.plan, "professional");
  session.dispose();
}

console.log("subscriptionSession.test.ts: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
