/**
 * Root IAP provider — one store connection and one purchase listener.
 *
 * Mounts once after AuthProvider / SubscriptionProvider. Never grants
 * entitlement; SubscriptionProvider remains the capability authority.
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
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

import { useAuth } from "@/state/auth";

import { resolveIapCapability } from "./iapCapability";
import { createFirebaseIapBackend } from "./iapBackend";
import { createExpoIapNativeAdapter } from "./iapNative";
import { createIapSession, type IapSession } from "./iapSession";
import type {
  CanonicalSku,
  IapNativeAdapter,
  IapView,
  PurchaseFlowResult,
} from "./iapTypes";

export type UseIapResult = IapView & {
  loadCatalog: () => Promise<void>;
  purchase: (sku: CanonicalSku) => Promise<PurchaseFlowResult>;
  restorePurchases: () => Promise<PurchaseFlowResult>;
};

const IapContext = createContext<UseIapResult | null>(null);

function defaultView(): IapView {
  return {
    ownerUid: null,
    available: false,
    unavailableReason: "native_build_required",
    connected: false,
    catalog: [],
    pending: null,
    lastResult: null,
    purchaseInFlight: false,
  };
}

function noopNativeAdapter(): IapNativeAdapter {
  return {
    async initConnection() {
      return false;
    },
    async endConnection() {},
    async fetchProducts() {
      return [];
    },
    async requestPurchase() {
      throw new Error("native_build_required");
    },
    async getAvailablePurchases() {
      return [];
    },
    async finishTransactionIOS() {},
    addPurchaseUpdatedListener() {
      return () => {};
    },
    addPurchaseErrorListener() {
      return () => {};
    },
  };
}

function nativeModulePresent(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("expo-iap");
    return true;
  } catch {
    return false;
  }
}

export function IapProvider({ children }: { children: React.ReactNode }) {
  const { status: authStatus, user } = useAuth();
  const [view, setView] = useState<IapView>(defaultView);
  const sessionRef = useRef<IapSession | null>(null);

  const capability = useMemo(
    () =>
      resolveIapCapability({
        platform: Platform.OS,
        appOwnership: Constants.appOwnership ?? null,
        nativeModulePresent: nativeModulePresent(),
      }),
    []
  );

  useEffect(() => {
    const platform =
      Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : Platform.OS === "web" ? "web" : "other";
    const session = createIapSession({
      native: capability.available ? createExpoIapNativeAdapter() : noopNativeAdapter(),
      backend: createFirebaseIapBackend(),
      store: AsyncStorage,
      platform,
      capability,
      now: () => Date.now(),
      onChange: setView,
    });
    sessionRef.current = session;
    return () => {
      void session.dispose();
      sessionRef.current = null;
    };
  }, [capability]);

  useEffect(() => {
    sessionRef.current?.setAuth({
      status: authStatus,
      uid: user?.uid ?? null,
    });
  }, [authStatus, user?.uid]);

  const loadCatalog = useCallback(async () => {
    await sessionRef.current?.loadCatalog();
  }, []);

  const purchase = useCallback(async (sku: CanonicalSku) => {
    if (!sessionRef.current) {
      return {
        kind: "unavailable" as const,
        reason: "native_build_required" as const,
      };
    }
    return sessionRef.current.purchase(sku);
  }, []);

  const restorePurchases = useCallback(async () => {
    if (!sessionRef.current) {
      return {
        kind: "unavailable" as const,
        reason: "native_build_required" as const,
      };
    }
    return sessionRef.current.restorePurchases();
  }, []);

  const value = useMemo<UseIapResult>(
    () => ({
      ...view,
      loadCatalog,
      purchase,
      restorePurchases,
    }),
    [view, loadCatalog, purchase, restorePurchases]
  );

  return <IapContext.Provider value={value}>{children}</IapContext.Provider>;
}

export function useIap(): UseIapResult {
  const ctx = useContext(IapContext);
  if (!ctx) {
    throw new Error("useIap must be used within <IapProvider>");
  }
  return ctx;
}
