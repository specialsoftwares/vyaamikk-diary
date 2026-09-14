/**
 * Render-time owner binding.
 *
 * React effects run after commit, so Auth uid can change while the previous
 * subscription view is still on screen. This helper is the synchronous
 * visibility gate: uid B must never inherit uid A's paid capability.
 */

import { DEFAULT_CLIENT_SUBSCRIPTION } from "./types";
import { featuresForSubscription } from "./subscriptionFeatures";
import type { SubscriptionAuthStatus, SubscriptionView } from "./subscriptionSession";

export function activeAuthUid(
  authStatus: SubscriptionAuthStatus,
  authUid: string | null | undefined
): string | null {
  if (authStatus !== "signed_in") return null;
  return authUid || null;
}

export function defaultSafeSubscriptionView(args: {
  isLoading: boolean;
  ownerUid: string | null;
  isOffline?: boolean;
}): SubscriptionView {
  return {
    status: DEFAULT_CLIENT_SUBSCRIPTION,
    plan: "free",
    features: featuresForSubscription(DEFAULT_CLIENT_SUBSCRIPTION),
    source: "default",
    isLoading: args.isLoading,
    isRefreshing: false,
    isOffline: args.isOffline === true,
    isStale: false,
    error: null,
    ownerUid: args.ownerUid,
  };
}

/**
 * Only expose a paid/cached/server view when it belongs to the current auth uid.
 * Signed-out and uid-mismatch renders are free in the same frame — no effect.
 */
export function bindSubscriptionViewToAuth(args: {
  view: SubscriptionView;
  authStatus: SubscriptionAuthStatus;
  authUid: string | null | undefined;
}): SubscriptionView {
  const activeUid = activeAuthUid(args.authStatus, args.authUid);
  if (activeUid != null && args.view.ownerUid === activeUid) {
    return args.view;
  }
  return defaultSafeSubscriptionView({
    isLoading: args.authStatus === "loading",
    ownerUid: activeUid,
    isOffline: args.view.isOffline,
  });
}
