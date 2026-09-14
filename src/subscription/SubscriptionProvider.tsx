/**
 * Root subscription entitlement provider.
 *
 * Mounts once after `AuthProvider` (uid source) and stays mounted for the
 * whole app — never per-screen, never path-gated.
 *
 * Consumes server `users/{uid}/subscription/status` only. Does not talk to
 * Play Billing or App Store purchase APIs and does not render paywalls.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useAuth } from "@/state/auth";
import { useIsOnline } from "@/state/network";
import { DEFAULT_CLIENT_SUBSCRIPTION } from "./types";
import { featuresForSubscription } from "./subscriptionFeatures";
import {
  createSubscriptionSession,
  type SubscriptionView,
} from "./subscriptionSession";
import {
  listenFirestoreSubscriptionStatus,
  readFirestoreSubscriptionStatus,
} from "./subscriptionFirestore";

export interface UseSubscriptionResult extends SubscriptionView {
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<UseSubscriptionResult | null>(null);

const INITIAL: SubscriptionView = {
  status: DEFAULT_CLIENT_SUBSCRIPTION,
  plan: "free",
  features: featuresForSubscription(DEFAULT_CLIENT_SUBSCRIPTION),
  source: "default",
  isLoading: true,
  isRefreshing: false,
  isOffline: false,
  isStale: false,
  error: null,
};

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { status: authStatus, user } = useAuth();
  const online = useIsOnline();
  const [view, setView] = useState<SubscriptionView>(INITIAL);
  const sessionRef = useRef<ReturnType<typeof createSubscriptionSession> | null>(null);

  useEffect(() => {
    const session = createSubscriptionSession({
      listen: listenFirestoreSubscriptionStatus,
      read: readFirestoreSubscriptionStatus,
      store: AsyncStorage,
      now: () => Date.now(),
      onChange: setView,
    });
    sessionRef.current = session;
    return () => {
      session.dispose();
      sessionRef.current = null;
    };
  }, []);

  useEffect(() => {
    sessionRef.current?.setAuth({
      status: authStatus,
      uid: user?.uid ?? null,
    });
  }, [authStatus, user?.uid]);

  useEffect(() => {
    sessionRef.current?.setOffline(!online);
  }, [online]);

  const refresh = useCallback(async () => {
    await sessionRef.current?.refresh();
  }, []);

  const api = useMemo<UseSubscriptionResult>(
    () => ({
      ...view,
      refresh,
    }),
    [view, refresh]
  );

  return (
    <SubscriptionContext.Provider value={api}>{children}</SubscriptionContext.Provider>
  );
}

export function useSubscription(): UseSubscriptionResult {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error("useSubscription must be used within <SubscriptionProvider>");
  }
  return ctx;
}
