/**
 * Root subscription entitlement provider.
 *
 * Mounts once after `AuthProvider` (uid source) and stays mounted for the
 * whole app — never per-screen, never path-gated.
 *
 * Consumes server `users/{uid}/subscription/status` only. Does not talk to
 * Play Billing or App Store purchase APIs and does not render paywalls.
 *
 * Render-time owner binding is the zero-frame uid isolation gate. Effects
 * only drive the session; they must not be the visibility authority.
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
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useAuth } from "@/state/auth";
import { useIsOnline } from "@/state/network";
import {
  createSubscriptionSession,
  type SubscriptionView,
} from "./subscriptionSession";
import {
  bindSubscriptionViewToAuth,
  defaultSafeSubscriptionView,
} from "./subscriptionViewBinding";
import {
  listenFirestoreSubscriptionStatus,
  readFirestoreSubscriptionStatus,
} from "./subscriptionFirestore";

export type UseSubscriptionResult = Omit<SubscriptionView, "ownerUid"> & {
  refresh: () => Promise<void>;
};

const SubscriptionContext = createContext<UseSubscriptionResult | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { status: authStatus, user } = useAuth();
  const online = useIsOnline();
  const [view, setView] = useState<SubscriptionView>(() =>
    defaultSafeSubscriptionView({ isLoading: true, ownerUid: null })
  );
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
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") session.notifyForeground();
    });
    return () => {
      sub.remove();
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

  const bound = bindSubscriptionViewToAuth({
    view,
    authStatus,
    authUid: user?.uid ?? null,
  });
  const { ownerUid: _ownerUid, ...publicView } = bound;

  const api = useMemo<UseSubscriptionResult>(
    () => ({
      ...publicView,
      refresh,
    }),
    [publicView, refresh]
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
