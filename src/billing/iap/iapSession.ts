/**
 * Single native-store connection and purchase-listener owner.
 *
 * Do not attach listeners from screens. Do not launch a purchase sheet on
 * startup. Store events never mutate feature entitlement.
 */

import {
  ANDROID_SUBSCRIPTION_PRODUCT_IDS,
  IOS_SUBSCRIPTION_PRODUCT_IDS,
  getClientCatalogEntry,
  isCanonicalSku,
} from "./iapCatalog";
import { mapStoreProductsToCatalog } from "./iapCatalogMap";
import type { IapCapability } from "./iapCapability";
import {
  assertServerObfuscatedAccountId,
  isUuidAppAccountToken,
} from "./iapAccountBinding";
import {
  clearPendingPurchaseIfUid,
  readPendingPurchase,
  writePendingPurchase,
} from "./iapPendingPurchase";
import {
  pendingProductIdForSku,
  processPurchaseError,
  processStorePurchase,
  type PurchaseProcessorDeps,
} from "./iapPurchaseProcessor";
import type {
  CanonicalSkuAvailability,
  IapBackend,
  IapKeyValueStore,
  IapNativeAdapter,
  IapPlatform,
  IapView,
  PendingPurchaseEnvelope,
  PurchaseFlowResult,
  StorePurchase,
} from "./iapTypes";

export interface IapSessionDeps {
  native: IapNativeAdapter;
  backend: IapBackend;
  store: IapKeyValueStore;
  platform: IapPlatform | "web" | "other";
  capability: IapCapability;
  now: () => number;
  onChange: (view: IapView) => void;
}

export interface IapAuthInput {
  status: "signed_in" | "signed_out" | "unknown" | string;
  uid: string | null;
}

export function createIapSession(deps: IapSessionDeps) {
  let generation = 0;
  let uid: string | null = null;
  let connected = false;
  let purchaseInFlight = false;
  let catalog: CanonicalSkuAvailability[] = [];
  let pending: PendingPurchaseEnvelope | null = null;
  let lastResult: PurchaseFlowResult | null = null;
  let removeUpdated: (() => void) | null = null;
  let removeError: (() => void) | null = null;
  const processedTokens = new Set<string>();
  let processQueue: Promise<void> = Promise.resolve();

  const storePlatform: IapPlatform | null =
    deps.platform === "android" || deps.platform === "ios" ? deps.platform : null;

  function emit() {
    deps.onChange({
      ownerUid: uid,
      available: deps.capability.available && storePlatform != null && uid != null,
      unavailableReason: !uid
        ? "not_signed_in"
        : deps.capability.reason,
      connected,
      catalog,
      pending,
      lastResult,
      purchaseInFlight,
    });
  }

  function processorDeps(forGen: number): PurchaseProcessorDeps | null {
    if (!storePlatform) return null;
    return {
      native: deps.native,
      backend: deps.backend,
      store: deps.store,
      platform: storePlatform,
      now: deps.now,
      currentUid: () => uid,
      currentGeneration: () => generation,
      generation: forGen,
    };
  }

  function detachListeners() {
    removeUpdated?.();
    removeError?.();
    removeUpdated = null;
    removeError = null;
  }

  function handlePurchase(
    purchase: StorePurchase,
    source: "purchase" | "recovery" | "restore"
  ): Promise<void> {
    const forGen = generation;
    const run = async () => {
      if (generation !== forGen) return;
      const pdeps = processorDeps(forGen);
      if (!pdeps) return;
      const latest = uid ? await readPendingPurchase({ store: deps.store, uid }) : null;
      if (generation !== forGen) return;
      pending = latest;
      const out = await processStorePurchase({
        deps: pdeps,
        purchase,
        pending,
        source,
        processedTokens,
      });
      if (generation !== forGen) return;
      pending = out.pending;
      lastResult = out.result;
      if (out.result.kind !== "store_pending") {
        purchaseInFlight = false;
      }
      emit();
    };
    const queued = processQueue.then(run, run);
    processQueue = queued.then(
      () => undefined,
      () => undefined
    );
    return queued;
  }

  function attachListeners(forGen: number) {
    detachListeners();
    removeUpdated = deps.native.addPurchaseUpdatedListener((purchase) => {
      if (generation !== forGen) return;
      void handlePurchase(purchase, "purchase");
    });
    removeError = deps.native.addPurchaseErrorListener((error) => {
      if (generation !== forGen) return;
      const pdeps = processorDeps(forGen);
      if (!pdeps) return;
      void (async () => {
        const latest = uid ? await readPendingPurchase({ store: deps.store, uid }) : null;
        if (generation !== forGen) return;
        pending = latest;
        const out = await processPurchaseError({ deps: pdeps, error, pending });
        if (generation !== forGen) return;
        pending = out.pending;
        lastResult = out.result;
        if (out.result.kind === "cancelled") {
          purchaseInFlight = false;
        }
        emit();
      })();
    });
  }

  async function recover(forGen: number) {
    if (!uid || !storePlatform) return;
    const existing = await readPendingPurchase({ store: deps.store, uid });
    if (generation !== forGen) return;
    pending = existing;
    if (!existing) {
      emit();
      return;
    }
    pending = {
      ...existing,
      stage: "awaiting_recovery",
      updatedAt: deps.now(),
    };
    await writePendingPurchase({
      store: deps.store,
      envelope: pending,
      expectedUid: uid,
      generation: forGen,
      currentGeneration: () => generation,
    });
    let purchases: StorePurchase[] = [];
    try {
      purchases = await deps.native.getAvailablePurchases({
        onlyIncludeActiveItemsIOS: true,
        includeSuspendedAndroid: false,
      });
    } catch {
      emit();
      return;
    }
    if (generation !== forGen) return;
    const matching = purchases.filter((p) => p.productId === existing.productId);
    if (matching.length === 0) {
      emit();
      return;
    }
    for (const purchase of matching) {
      if (generation !== forGen) return;
      await handlePurchase(purchase, "recovery");
    }
  }

  async function setAuth(input: IapAuthInput) {
    const previousUid = uid;
    generation += 1;
    const forGen = generation;
    processedTokens.clear();
    purchaseInFlight = false;
    catalog = [];
    lastResult = null;
    detachListeners();

    const nextUid = input.status === "signed_in" ? input.uid : null;
    uid = nextUid;

    if (previousUid && previousUid !== nextUid) {
      await clearPendingPurchaseIfUid(deps.store, previousUid);
    }

    if (connected) {
      try {
        await deps.native.endConnection();
      } catch {
        // ignore
      }
      connected = false;
    }

    if (!nextUid) {
      pending = null;
      emit();
      return;
    }

    pending = await readPendingPurchase({ store: deps.store, uid: nextUid });
    if (generation !== forGen) return;

    if (!deps.capability.available || !storePlatform) {
      emit();
      return;
    }

    try {
      await deps.native.initConnection();
    } catch {
      connected = false;
      emit();
      return;
    }
    if (generation !== forGen) return;
    connected = true;
    attachListeners(forGen);
    await recover(forGen);
    emit();
  }

  async function loadCatalog(): Promise<CanonicalSkuAvailability[]> {
    if (!uid || !deps.capability.available || !storePlatform || !connected) {
      catalog = [];
      emit();
      return catalog;
    }
    const skus =
      storePlatform === "android"
        ? [...ANDROID_SUBSCRIPTION_PRODUCT_IDS]
        : [...IOS_SUBSCRIPTION_PRODUCT_IDS];
    let products: Awaited<ReturnType<IapNativeAdapter["fetchProducts"]>> = [];
    try {
      products = await deps.native.fetchProducts({ skus, type: "subs" });
    } catch {
      products = [];
    }
    catalog = mapStoreProductsToCatalog({
      platform: storePlatform,
      products,
    });
    emit();
    return catalog;
  }

  async function purchase(canonicalSku: string): Promise<PurchaseFlowResult> {
    if (!isCanonicalSku(canonicalSku)) {
      const result: PurchaseFlowResult = {
        kind: "unavailable",
        reason: "products_unavailable",
      };
      lastResult = result;
      emit();
      return result;
    }
    if (!uid) {
      const result: PurchaseFlowResult = { kind: "unavailable", reason: "not_signed_in" };
      lastResult = result;
      emit();
      return result;
    }
    if (!deps.capability.available || !storePlatform) {
      const result: PurchaseFlowResult = {
        kind: "unavailable",
        reason: deps.capability.reason ?? "native_build_required",
      };
      lastResult = result;
      emit();
      return result;
    }
    if (purchaseInFlight || pending) {
      const result: PurchaseFlowResult = { kind: "already_in_flight" };
      lastResult = result;
      emit();
      return result;
    }
    if (!connected) {
      const result: PurchaseFlowResult = {
        kind: "failed",
        recoverable: true,
        message: "Store is not connected.",
      };
      lastResult = result;
      emit();
      return result;
    }

    const forGen = generation;
    const entry = getClientCatalogEntry(canonicalSku);
    if (catalog.length === 0) {
      await loadCatalog();
      if (generation !== forGen) {
        return { kind: "failed", recoverable: true, message: "Signed out." };
      }
    }
    const skuState = catalog.find((item) => item.canonicalSku === canonicalSku);
    if (!skuState?.available) {
      const result: PurchaseFlowResult = {
        kind: "unavailable",
        reason: skuState?.unavailableReason ?? "products_unavailable",
      };
      lastResult = result;
      emit();
      return result;
    }

    purchaseInFlight = true;
    emit();
    try {
      const ids = pendingProductIdForSku(storePlatform, canonicalSku);
      if (storePlatform === "android") {
        const prepared = await deps.backend.prepareAndroidBillingAccount();
        if (generation !== forGen) {
          purchaseInFlight = false;
          return { kind: "failed", recoverable: true, message: "Signed out." };
        }
        const obfuscatedAccountId = assertServerObfuscatedAccountId({
          obfuscatedAccountId: prepared.obfuscatedAccountId,
          uid,
        });
        const offerToken = skuState.androidOfferToken;
        if (!offerToken) {
          purchaseInFlight = false;
          const result: PurchaseFlowResult = {
            kind: "unavailable",
            reason: "unsupported_offer",
          };
          lastResult = result;
          emit();
          return result;
        }
        const envelope: PendingPurchaseEnvelope = {
          version: 1,
          uid,
          platform: "android",
          canonicalSku,
          productId: ids.productId,
          androidBasePlanId: ids.androidBasePlanId,
          stage: "intent_created",
          initiatedAt: deps.now(),
          updatedAt: deps.now(),
        };
        const wrote = await writePendingPurchase({
          store: deps.store,
          envelope,
          expectedUid: uid,
          generation: forGen,
          currentGeneration: () => generation,
        });
        if (!wrote) {
          purchaseInFlight = false;
          const result: PurchaseFlowResult = {
            kind: "failed",
            recoverable: true,
            message: "Couldn't start purchase.",
          };
          lastResult = result;
          emit();
          return result;
        }
        pending = envelope;
        emit();
        await deps.native.requestPurchase({
          type: "subs",
          request: {
            google: {
              skus: [entry.android.productId],
              subscriptionOffers: [
                { sku: entry.android.productId, offerToken },
              ],
              obfuscatedAccountId,
            },
          },
        });
      } else {
        const prepared = await deps.backend.prepareIOSBillingAccount();
        if (generation !== forGen) {
          purchaseInFlight = false;
          return { kind: "failed", recoverable: true, message: "Signed out." };
        }
        if (!isUuidAppAccountToken(prepared.appAccountToken)) {
          purchaseInFlight = false;
          const result: PurchaseFlowResult = {
            kind: "failed",
            recoverable: true,
            message: "Couldn't start purchase.",
          };
          lastResult = result;
          emit();
          return result;
        }
        const envelope: PendingPurchaseEnvelope = {
          version: 1,
          uid,
          platform: "ios",
          canonicalSku,
          productId: ids.productId,
          stage: "intent_created",
          initiatedAt: deps.now(),
          updatedAt: deps.now(),
        };
        const wrote = await writePendingPurchase({
          store: deps.store,
          envelope,
          expectedUid: uid,
          generation: forGen,
          currentGeneration: () => generation,
        });
        if (!wrote) {
          purchaseInFlight = false;
          const result: PurchaseFlowResult = {
            kind: "failed",
            recoverable: true,
            message: "Couldn't start purchase.",
          };
          lastResult = result;
          emit();
          return result;
        }
        pending = envelope;
        emit();
        await deps.native.requestPurchase({
          type: "subs",
          request: {
            apple: {
              sku: entry.ios.productId,
              appAccountToken: prepared.appAccountToken,
            },
          },
        });
      }
      const result: PurchaseFlowResult = { kind: "sheet_launched" };
      lastResult = result;
      emit();
      return result;
    } catch (e) {
      purchaseInFlight = false;
      const message = e instanceof Error ? e.message : "Purchase didn't complete.";
      const cancelled = /user-cancelled|user cancelled/i.test(message);
      if (cancelled && uid) {
        await clearPendingPurchaseIfUid(deps.store, uid);
        pending = null;
        lastResult = { kind: "cancelled" };
        emit();
        return lastResult;
      }
      lastResult = { kind: "failed", recoverable: true, message: "Purchase didn't complete." };
      emit();
      return lastResult;
    }
  }

  async function restorePurchases(): Promise<PurchaseFlowResult> {
    if (!uid || !deps.capability.available || !storePlatform || !connected) {
      const result: PurchaseFlowResult = {
        kind: "unavailable",
        reason: !uid
          ? "not_signed_in"
          : deps.capability.reason ?? "native_build_required",
      };
      lastResult = result;
      emit();
      return result;
    }
    const forGen = generation;
    let purchases: StorePurchase[] = [];
    try {
      purchases = await deps.native.getAvailablePurchases({
        onlyIncludeActiveItemsIOS: true,
        includeSuspendedAndroid: false,
      });
    } catch {
      lastResult = {
        kind: "failed",
        recoverable: true,
        message: "Couldn't refresh store purchases.",
      };
      emit();
      return lastResult;
    }
    if (generation !== forGen) {
      return { kind: "failed", recoverable: true, message: "Signed out." };
    }
    if (purchases.length === 0) {
      lastResult = { kind: "verified" };
      emit();
      return lastResult;
    }
    let last: PurchaseFlowResult = { kind: "verified" };
    for (const purchase of purchases) {
      if (generation !== forGen) break;
      await handlePurchase(purchase, "restore");
      last = lastResult ?? last;
    }
    return last;
  }

  async function dispose() {
    generation += 1;
    detachListeners();
    if (connected) {
      try {
        await deps.native.endConnection();
      } catch {
        // ignore
      }
    }
    connected = false;
    uid = null;
    pending = null;
    purchaseInFlight = false;
  }

  return {
    setAuth,
    loadCatalog,
    purchase,
    restorePurchases,
    dispose,
    getGeneration: () => generation,
    getView: (): IapView => ({
      ownerUid: uid,
      available: deps.capability.available && storePlatform != null && uid != null,
      unavailableReason: !uid ? "not_signed_in" : deps.capability.reason,
      connected,
      catalog,
      pending,
      lastResult,
      purchaseInFlight,
    }),
  };
}

export type IapSession = ReturnType<typeof createIapSession>;
