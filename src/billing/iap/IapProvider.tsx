/**
 * Root IAP provider — one store connection and one purchase listener.
 *
 * Mounts once after AuthProvider / SubscriptionProvider. Never grants
 * entitlement; SubscriptionProvider remains the capability authority.
 *
 * Render-time owner binding is the zero-frame uid isolation gate. Effects
 * only drive the session; they must not be the visibility or action authority.
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
import {
  activeIapAuthUid,
  bindIapViewToAuth,
  runGuardedIapAction,
} from "./iapViewBinding";
import type {
  CanonicalSku,
  IapNativeAdapter,
  IapView,
  PurchaseFlowResult,
} from "./iapTypes";

export type UseIapResult = Omit<IapView, "ownerUid"> & {
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
      Platform.OS === "ios" || Platform.OS === "android"
        ? Platform.OS
        : Platform.OS === "web"
          ? "web"
          : "other";
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

  const activeUid = activeIapAuthUid(authStatus, user?.uid ?? null);
  const activeUidRef = useRef(activeUid);
  activeUidRef.current = activeUid;

  const bound = bindIapViewToAuth({
    view,
    authStatus,
    authUid: user?.uid ?? null,
  });
  const { ownerUid: _ownerUid, ...publicView } = bound;

  const loadCatalog = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    await runGuardedIapAction({
      activeUid: activeUidRef.current,
      sessionOwnerUid: session.getView().ownerUid,
      blockedResult: undefined,
      action: () => session.loadCatalog().then(() => undefined),
    });
  }, []);

  const purchase = useCallback(async (sku: CanonicalSku) => {
    const session = sessionRef.current;
    if (!session) {
      return {
        kind: "unavailable" as const,
        reason: "native_build_required" as const,
      };
    }
    return runGuardedIapAction({
      activeUid: activeUidRef.current,
      sessionOwnerUid: session.getView().ownerUid,
      blockedResult: { kind: "unavailable" as const, reason: "not_signed_in" as const },
      action: () => session.purchase(sku),
    });
  }, []);

  const restorePurchases = useCallback(async (): Promise<PurchaseFlowResult> => {
    const session = sessionRef.current;
    if (!session) {
      return {
        kind: "unavailable",
        reason: "native_build_required",
      };
    }
    return runGuardedIapAction({
      activeUid: activeUidRef.current,
      sessionOwnerUid: session.getView().ownerUid,
      blockedResult: { kind: "unavailable", reason: "not_signed_in" },
      action: () => session.restorePurchases(),
    });
  }, []);

  const value = useMemo<UseIapResult>(
    () => ({
      ...publicView,
      loadCatalog,
      purchase,
      restorePurchases,
    }),
    [publicView, loadCatalog, purchase, restorePurchases]
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
