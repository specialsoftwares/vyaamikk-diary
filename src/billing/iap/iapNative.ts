/**
 * expo-iap 5.6.0 native boundary.
 *
 * Inspected from node_modules/expo-iap@5.6.0:
 * - requestPurchase({ type: "subs", request: { google | apple } })
 * - Purchase.purchaseToken is Android token / iOS StoreKit JWS
 * - Purchase.purchaseState is "pending" | "purchased" | "unknown"
 * - finishTransaction on Android calls acknowledgePurchaseAndroid
 *
 * VYD-32 already acknowledges on the backend. This adapter therefore
 * exposes finishTransactionIOS only. Do not add an Android finish/ack path.
 */

import {
  endConnection,
  fetchProducts,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  finishTransaction,
  type ProductSubscription,
  type Purchase,
} from "expo-iap";

import type {
  GetAvailablePurchasesOptions,
  IapNativeAdapter,
  NativePurchaseRequest,
  StoreProductLike,
  StorePurchase,
  StorePurchaseError,
} from "./iapTypes";

function mapProduct(product: ProductSubscription): StoreProductLike {
  return {
    id: product.id,
    type: "subs",
    platform: product.platform,
    displayPrice: product.displayPrice,
    currency: product.currency,
    subscriptionOffers: product.subscriptionOffers ?? null,
    introductoryPriceIOS:
      product.platform === "ios" ? product.introductoryPriceIOS ?? null : null,
    introductoryPricePaymentModeIOS:
      product.platform === "ios" ? product.introductoryPricePaymentModeIOS : null,
    pricingTermsIOS: product.platform === "ios" ? product.pricingTermsIOS ?? null : null,
  };
}

function mapPurchase(purchase: Purchase): StorePurchase {
  return {
    store: purchase.store,
    productId: purchase.productId,
    purchaseState: purchase.purchaseState,
    purchaseToken: purchase.purchaseToken ?? null,
    currentPlanId: purchase.currentPlanId ?? null,
    isAcknowledgedAndroid:
      "isAcknowledgedAndroid" in purchase ? purchase.isAcknowledgedAndroid ?? null : null,
    nativePurchase: purchase,
  };
}

function mapError(error: {
  code?: string;
  message: string;
  productId?: string | null;
}): StorePurchaseError {
  return {
    code: error.code ?? "unknown",
    message: error.message,
    productId: error.productId ?? null,
  };
}

export function createExpoIapNativeAdapter(): IapNativeAdapter {
  return {
    async initConnection() {
      return initConnection();
    },
    async endConnection() {
      await endConnection();
    },
    async fetchProducts(query) {
      const result = await fetchProducts({ skus: query.skus, type: "subs" });
      const list = Array.isArray(result) ? result : [];
      return list
        .filter((item): item is ProductSubscription => item != null && item.type === "subs")
        .map(mapProduct);
    },
    async requestPurchase(request: NativePurchaseRequest) {
      await requestPurchase({
        type: "subs",
        request: request.request,
      });
    },
    async getAvailablePurchases(options: GetAvailablePurchasesOptions) {
      const purchases = await getAvailablePurchases({
        onlyIncludeActiveItemsIOS: options.onlyIncludeActiveItemsIOS,
        includeSuspendedAndroid: options.includeSuspendedAndroid,
      });
      return (purchases ?? []).map(mapPurchase);
    },
    async finishTransactionIOS(purchase: StorePurchase) {
      const native = purchase.nativePurchase as Purchase;
      await finishTransaction({ purchase: native, isConsumable: false });
    },
    addPurchaseUpdatedListener(listener) {
      const sub = purchaseUpdatedListener((purchase) => {
        listener(mapPurchase(purchase));
      });
      return () => sub.remove();
    },
    addPurchaseErrorListener(listener) {
      const sub = purchaseErrorListener((error) => {
        listener(mapError(error));
      });
      return () => sub.remove();
    },
  };
}
