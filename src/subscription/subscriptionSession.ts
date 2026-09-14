/**
 * Auth-bound subscription session.
 *
 * Generation tokens prevent a late uid-A Firestore callback from publishing
 * A state or overwriting uid-B's cache. The React provider is a thin wrapper.
 *
 * Offline AsyncStorage cache is UX continuity for the same uid only.
 * It is never authority for writes, quota, purchase completion, financial
 * state, restoration, or tax/invoice eligibility.
 */

import { parseSubscriptionStatus } from "./parseSubscriptionStatus";
import {
  effectivePlanForSubscription,
  featuresForSubscription,
  type SubscriptionFeatures,
} from "./subscriptionFeatures";
import {
  clearSubscriptionCache,
  readSubscriptionCache,
  writeSubscriptionCache,
  type SubscriptionKeyValueStore,
} from "./subscriptionCache";
import {
  DEFAULT_CLIENT_SUBSCRIPTION,
  type ClientSubscriptionStatus,
  type SubscriptionSource,
  type VyaamikkPlan,
} from "./types";
import type { SubscriptionDocListener, SubscriptionDocReader } from "./subscriptionFirestore";

export type SubscriptionAuthStatus = "loading" | "signed_out" | "signed_in";

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
}

export interface SubscriptionSessionDeps {
  listen: SubscriptionDocListener;
  read: SubscriptionDocReader;
  store: SubscriptionKeyValueStore;
  now: () => number;
  onChange: (view: SubscriptionView) => void;
}

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

export function createSubscriptionSession(deps: SubscriptionSessionDeps) {
  let generation = 0;
  let uid: string | null = null;
  let authStatus: SubscriptionAuthStatus = "loading";
  let unsubscribe: (() => void) | null = null;
  let offline = false;
  let writeQueue: Promise<void> = Promise.resolve();
  let current: SubscriptionView = viewFrom(DEFAULT_CLIENT_SUBSCRIPTION, "default", {
    isLoading: true,
  });

  function publish(next: SubscriptionView) {
    current = next;
    deps.onChange(next);
  }

  function enqueue(task: () => Promise<void>) {
    writeQueue = writeQueue.then(task).catch(() => {});
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
    });
  }

  function applyServerDoc(raw: unknown | null, forUid: string, forGen: number) {
    if (generation !== forGen || uid !== forUid) return;
    const status =
      raw == null ? { ...DEFAULT_CLIENT_SUBSCRIPTION } : parseSubscriptionStatus(raw);
    publish(
      viewFrom(status, "server", {
        isOffline: offline,
        isStale: false,
        error: null,
        isLoading: false,
        isRefreshing: false,
      })
    );
    persist(forUid, forGen, status);
  }

  function attachListener(forUid: string, forGen: number) {
    unsubscribe?.();
    unsubscribe = deps.listen(forUid, {
      next: (data) => {
        applyServerDoc(data, forUid, forGen);
      },
      error: (err) => {
        if (generation !== forGen || uid !== forUid) return;
        if (isAuthFailure(err.code)) {
          publish(
            viewFrom(DEFAULT_CLIENT_SUBSCRIPTION, "default", {
              isOffline: offline,
              error: err.code,
              isLoading: false,
              isRefreshing: false,
            })
          );
          enqueue(async () => {
            if (generation !== forGen) return;
            await clearSubscriptionCache(deps.store);
          });
          return;
        }
        // Temporary network / backend failure: keep same-uid cache if still valid.
        if (current.source !== "default" && current.status.entitlementActive) {
          publish({
            ...current,
            isOffline: true,
            isLoading: false,
            isRefreshing: false,
            error: null,
          });
          return;
        }
        publish({
          ...current,
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
        isLoading: true,
        isOffline: offline,
      })
    );
    const cached = await readSubscriptionCache({
      store: deps.store,
      uid: forUid,
      nowMs: deps.now(),
    });
    if (generation !== forGen || uid !== forUid) return;

    if (cached) {
      publish(
        viewFrom(cached.status, "cache", {
          isLoading: false,
          isOffline: offline,
          isStale: cached.reduced,
          error: null,
        })
      );
    } else {
      publish(
        viewFrom(DEFAULT_CLIENT_SUBSCRIPTION, "default", {
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
    authStatus = next.status;
    uid = nextUid;
    unsubscribe?.();
    unsubscribe = null;

    if (next.status === "loading" || !nextUid) {
      publish(
        viewFrom(DEFAULT_CLIENT_SUBSCRIPTION, "default", {
          isLoading: next.status === "loading",
          isOffline: offline,
        })
      );
      if (next.status === "signed_out") {
        enqueue(async () => {
          if (generation !== forGen) return;
          await clearSubscriptionCache(deps.store);
        });
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
        publish(
          viewFrom(DEFAULT_CLIENT_SUBSCRIPTION, "default", {
            isOffline: offline,
            error: code,
            isRefreshing: false,
            isLoading: false,
          })
        );
        return;
      }
      publish({
        ...current,
        isRefreshing: false,
        isOffline: true,
        error: null,
      });
    }
  }

  function setOffline(next: boolean) {
    offline = next;
    if (current.isOffline === next) return;
    publish({ ...current, isOffline: next });
  }

  function dispose() {
    generation += 1;
    unsubscribe?.();
    unsubscribe = null;
    uid = null;
    authStatus = "signed_out";
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
    dispose,
    getView,
    flushWrites,
    debugGeneration,
  };
}

export type SubscriptionSession = ReturnType<typeof createSubscriptionSession>;
