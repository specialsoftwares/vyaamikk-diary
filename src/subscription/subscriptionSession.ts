/**
 * Auth-bound subscription session.
 *
 * Generation tokens prevent a late uid-A Firestore callback from publishing
 * A state or overwriting uid-B's cache. Cache mutations are serialized.
 * The React provider still applies render-time owner binding separately.
 *
 * Firestore `metadata.fromCache` is the snapshot provenance. NetInfo is only
 * reachability. Offline AsyncStorage is UX continuity for the same uid only.
 */

import { parseSubscriptionStatus } from "./parseSubscriptionStatus";
import {
  effectivePlanForSubscription,
  featuresForSubscription,
  type SubscriptionFeatures,
} from "./subscriptionFeatures";
import {
  SUBSCRIPTION_CACHE_KEY,
  clearSubscriptionCacheIfUid,
  parseSubscriptionCacheEnvelope,
  readSubscriptionCache,
  writeSubscriptionCache,
  type SubscriptionKeyValueStore,
} from "./subscriptionCache";
import {
  entitlementExpiryBoundaryMs,
  reduceCachedEntitlement,
} from "./reduceCachedEntitlement";
import {
  DEFAULT_CLIENT_SUBSCRIPTION,
  type ClientSubscriptionStatus,
  type SubscriptionSource,
  type VyaamikkPlan,
} from "./types";
import type {
  SubscriptionDocListener,
  SubscriptionDocReader,
  SubscriptionDocSnapshot,
} from "./subscriptionFirestore";

export type SubscriptionAuthStatus = "loading" | "signed_out" | "signed_in";

/** Internal owner identity — stripped before public `useSubscription()`. */
export interface SubscriptionView {
  status: ClientSubscriptionStatus;
  plan: VyaamikkPlan;
  features: SubscriptionFeatures;
  source: SubscriptionSource;
  isLoading: boolean;
  isRefreshing: boolean;
  isOffline: boolean;
  isStale: boolean;
  error: string | null;
  ownerUid: string | null;
}

export type SubscriptionTimeoutHandle = ReturnType<typeof setTimeout> | number;

export interface SubscriptionSessionDeps {
  listen: SubscriptionDocListener;
  read: SubscriptionDocReader;
  store: SubscriptionKeyValueStore;
  now: () => number;
  onChange: (view: SubscriptionView) => void;
  setTimeoutFn?: (fn: () => void, ms: number) => SubscriptionTimeoutHandle;
  clearTimeoutFn?: (handle: SubscriptionTimeoutHandle) => void;
}

/** JS setTimeout 32-bit signed max; clamp rather than overflow. */
export const MAX_EXPIRY_TIMEOUT_MS = 2_147_483_647;

function viewFrom(
  status: ClientSubscriptionStatus,
  source: SubscriptionSource,
  extra: Partial<SubscriptionView>
): SubscriptionView {
  return {
    status,
    plan: effectivePlanForSubscription(status),
    features: featuresForSubscription(status),
    source,
    isLoading: false,
    isRefreshing: false,
    isOffline: false,
    isStale: false,
    error: null,
    ownerUid: extra.ownerUid ?? null,
    ...extra,
  };
}

function isAuthFailure(code: string): boolean {
  return (
    code === "permission-denied" ||
    code === "unauthenticated" ||
    code === "auth/user-token-expired"
  );
}

function shouldWatchExpiry(view: SubscriptionView, offline: boolean): boolean {
  if (effectivePlanForSubscription(view.status) === "free") return false;
  if (view.source === "cache") return true;
  return offline && view.source === "server";
}

export function createSubscriptionSession(deps: SubscriptionSessionDeps) {
  const scheduleTimeout: (fn: () => void, ms: number) => SubscriptionTimeoutHandle =
    deps.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms) as SubscriptionTimeoutHandle);
  const cancelTimeout: (handle: SubscriptionTimeoutHandle) => void =
    deps.clearTimeoutFn ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let generation = 0;
  let uid: string | null = null;
  let authStatus: SubscriptionAuthStatus = "loading";
  let unsubscribe: (() => void) | null = null;
  let offline = false;
  let writeQueue: Promise<void> = Promise.resolve();
  let expiryTimer: SubscriptionTimeoutHandle | null = null;
  let current: SubscriptionView = viewFrom(DEFAULT_CLIENT_SUBSCRIPTION, "default", {
    isLoading: true,
    ownerUid: null,
  });

  function publish(next: SubscriptionView) {
    current = next;
    deps.onChange(next);
    syncExpiryTimer();
  }

  function enqueue(task: () => Promise<void>) {
    writeQueue = writeQueue.then(task).catch(() => {});
  }

  function clearExpiryTimer() {
    if (expiryTimer != null) {
      cancelTimeout(expiryTimer);
      expiryTimer = null;
    }
  }

  function applyReducedIfNeeded(view: SubscriptionView): SubscriptionView {
    const reduced = reduceCachedEntitlement(view.status, deps.now());
    if (!reduced.reduced) return view;
    return viewFrom(reduced.status, view.source === "server" ? view.source : "cache", {
      ownerUid: view.ownerUid,
      isOffline: offline || view.isOffline,
      isStale: true,
      isLoading: false,
      isRefreshing: false,
      error: view.error,
    });
  }

  function syncExpiryTimer() {
    clearExpiryTimer();
    if (!shouldWatchExpiry(current, offline)) return;
    const boundary = entitlementExpiryBoundaryMs(current.status);
    const nowMs = deps.now();
    if (boundary == null) {
      const reduced = applyReducedIfNeeded(current);
      if (reduced !== current) publish(reduced);
      return;
    }
    const delay = Math.max(0, boundary - nowMs);
    const wait = Math.min(delay, MAX_EXPIRY_TIMEOUT_MS);
    const forGen = generation;
    const forUid = uid;
    expiryTimer = scheduleTimeout(() => {
      expiryTimer = null;
      if (generation !== forGen || uid !== forUid) return;
      const reduced = applyReducedIfNeeded(current);
      if (reduced !== current) {
        publish(reduced);
        return;
      }
      syncExpiryTimer();
    }, wait);
  }

  function persist(forUid: string, forGen: number, status: ClientSubscriptionStatus) {
    enqueue(async () => {
      if (generation !== forGen || uid !== forUid) return;
      await writeSubscriptionCache({
        store: deps.store,
        uid: forUid,
        status,
        nowMs: deps.now(),
      });
      if (generation !== forGen || uid !== forUid) {
        try {
          const raw = await deps.store.getItem(SUBSCRIPTION_CACHE_KEY);
          if (!raw) return;
          const env = parseSubscriptionCacheEnvelope(JSON.parse(raw) as unknown);
          if (env?.uid === forUid) {
            await clearSubscriptionCacheIfUid(deps.store, forUid);
          }
        } catch {
          // optional UX cache
        }
      }
    });
  }

  function invalidateCache(forUid: string, _forGen?: number) {
    enqueue(async () => {
      // Always uid-scoped: a late A clear must not delete B's envelope
      // even if this task started before the auth switch.
      await clearSubscriptionCacheIfUid(deps.store, forUid);
    });
  }

  function failClosedAuth(forUid: string, forGen: number, code: string) {
    publish(
      viewFrom(DEFAULT_CLIENT_SUBSCRIPTION, "default", {
        ownerUid: forUid,
        isOffline: offline,
        error: code,
        isLoading: false,
        isRefreshing: false,
      })
    );
    invalidateCache(forUid, forGen);
  }

  function applyServerDoc(raw: unknown | null, forUid: string, forGen: number) {
    if (generation !== forGen || uid !== forUid) return;
    const status =
      raw == null ? { ...DEFAULT_CLIENT_SUBSCRIPTION } : parseSubscriptionStatus(raw);
    publish(
      viewFrom(status, "server", {
        ownerUid: forUid,
        isOffline: offline,
        isStale: false,
        error: null,
        isLoading: false,
        isRefreshing: false,
      })
    );
    persist(forUid, forGen, status);
  }

  function applyCachedFirestoreDoc(raw: unknown | null, forUid: string, forGen: number) {
    if (generation !== forGen || uid !== forUid) return;
    if (raw == null) {
      // Cached miss is not proof the server doc is absent.
      if (current.ownerUid === forUid) {
        publish({
          ...current,
          isLoading: false,
          isRefreshing: false,
        });
        return;
      }
      publish(
        viewFrom(DEFAULT_CLIENT_SUBSCRIPTION, "default", {
          ownerUid: forUid,
          isLoading: false,
          isOffline: offline,
        })
      );
      return;
    }
    const parsed = parseSubscriptionStatus(raw);
    const reduced = reduceCachedEntitlement(parsed, deps.now());
    publish(
      viewFrom(reduced.status, "cache", {
        ownerUid: forUid,
        isOffline: offline,
        isStale: reduced.reduced,
        error: null,
        isLoading: false,
        isRefreshing: false,
      })
    );
  }

  function onListenerSnapshot(snap: SubscriptionDocSnapshot, forUid: string, forGen: number) {
    if (snap.fromCache) {
      applyCachedFirestoreDoc(snap.data, forUid, forGen);
      return;
    }
    applyServerDoc(snap.data, forUid, forGen);
  }

  function attachListener(forUid: string, forGen: number) {
    unsubscribe?.();
    unsubscribe = deps.listen(forUid, {
      next: (snap) => {
        onListenerSnapshot(snap, forUid, forGen);
      },
      error: (err) => {
        if (generation !== forGen || uid !== forUid) return;
        if (isAuthFailure(err.code)) {
          failClosedAuth(forUid, forGen, err.code);
          return;
        }
        const reduced = applyReducedIfNeeded({
          ...current,
          ownerUid: forUid,
        });
        publish({
          ...reduced,
          isOffline: true,
          isLoading: false,
          isRefreshing: false,
          error: null,
        });
      },
    });
  }

  async function hydrateAndListen(forUid: string, forGen: number) {
    publish(
      viewFrom(DEFAULT_CLIENT_SUBSCRIPTION, "default", {
        ownerUid: forUid,
        isLoading: true,
        isOffline: offline,
      })
    );
    await writeQueue;
    if (generation !== forGen || uid !== forUid) return;

    const cached = await readSubscriptionCache({
      store: deps.store,
      uid: forUid,
      nowMs: deps.now(),
    });
    if (generation !== forGen || uid !== forUid) return;

    if (cached) {
      publish(
        viewFrom(cached.status, "cache", {
          ownerUid: forUid,
          isLoading: false,
          isOffline: offline,
          isStale: cached.reduced,
          error: null,
        })
      );
    } else {
      publish(
        viewFrom(DEFAULT_CLIENT_SUBSCRIPTION, "default", {
          ownerUid: forUid,
          isLoading: false,
          isOffline: offline,
        })
      );
    }

    if (generation !== forGen || uid !== forUid) return;
    attachListener(forUid, forGen);
  }

  function setAuth(next: { status: SubscriptionAuthStatus; uid: string | null }) {
    const nextUid = next.status === "signed_in" && next.uid ? next.uid : null;
    const sameSession =
      authStatus === next.status && uid === nextUid && next.status !== "loading";
    if (sameSession && next.status === "signed_in") return;

    generation += 1;
    const forGen = generation;
    const previousUid = uid;
    authStatus = next.status;
    uid = nextUid;
    unsubscribe?.();
    unsubscribe = null;
    clearExpiryTimer();

    if (next.status === "loading" || !nextUid) {
      publish(
        viewFrom(DEFAULT_CLIENT_SUBSCRIPTION, "default", {
          ownerUid: null,
          isLoading: next.status === "loading",
          isOffline: offline,
        })
      );
      if (next.status === "signed_out" && previousUid) {
        invalidateCache(previousUid, forGen);
      }
      return;
    }

    void hydrateAndListen(nextUid, forGen);
  }

  async function refresh() {
    const forUid = uid;
    const forGen = generation;
    if (!forUid || authStatus !== "signed_in") return;
    publish({ ...current, isRefreshing: true });
    try {
      const data = await deps.read(forUid);
      if (generation !== forGen || uid !== forUid) return;
      applyServerDoc(data, forUid, forGen);
    } catch (e) {
      if (generation !== forGen || uid !== forUid) return;
      const code =
        e && typeof e === "object" && "code" in e && typeof (e as { code: unknown }).code === "string"
          ? (e as { code: string }).code
          : "unavailable";
      if (isAuthFailure(code)) {
        failClosedAuth(forUid, forGen, code);
        return;
      }
      const reduced = applyReducedIfNeeded(current);
      publish({
        ...reduced,
        isRefreshing: false,
        isOffline: true,
        error: null,
      });
    }
  }

  function setOffline(next: boolean) {
    const was = offline;
    offline = next;
    if (was === next && current.isOffline === next) {
      if (next) syncExpiryTimer();
      return;
    }
    const reduced = next ? applyReducedIfNeeded(current) : current;
    publish({
      ...reduced,
      isOffline: next,
    });
  }

  function notifyForeground() {
    if (!uid) return;
    const reduced = applyReducedIfNeeded(current);
    if (reduced !== current) {
      publish({ ...reduced, isOffline: offline });
      return;
    }
    syncExpiryTimer();
  }

  function dispose() {
    generation += 1;
    unsubscribe?.();
    unsubscribe = null;
    uid = null;
    authStatus = "signed_out";
    clearExpiryTimer();
  }

  function getView(): SubscriptionView {
    return current;
  }

  function debugGeneration(): number {
    return generation;
  }

  async function flushWrites() {
    await writeQueue;
  }

  return {
    setAuth,
    setOffline,
    refresh,
    notifyForeground,
    dispose,
    getView,
    flushWrites,
    debugGeneration,
  };
}

export type SubscriptionSession = ReturnType<typeof createSubscriptionSession>;
