/**
 * Map fetched store products onto the nine canonical SKUs.
 * Display prices come only from store metadata. Missing products are
 * controlled unavailable states — never fake INR fallbacks.
 */

import {
  ALL_CANONICAL_SKUS,
  CLIENT_SUBSCRIPTION_CATALOG,
} from "./iapCatalog";
import { iosProductAllowsPlainPurchase, selectStandardAndroidOffer } from "./iapOffers";
import type {
  CanonicalSkuAvailability,
  IapPlatform,
  StoreProductLike,
} from "./iapTypes";

export function mapStoreProductsToCatalog(args: {
  platform: IapPlatform;
  products: StoreProductLike[];
}): CanonicalSkuAvailability[] {
  const byId = new Map(args.products.map((p) => [p.id, p]));
  const anyStoreProduct = args.products.length > 0;

  return ALL_CANONICAL_SKUS.map((sku) => {
    const entry = CLIENT_SUBSCRIPTION_CATALOG[sku];
    if (args.platform === "android") {
      const product = byId.get(entry.android.productId);
      if (!product || product.type !== "subs") {
        return {
          canonicalSku: sku,
          available: false,
          unavailableReason: anyStoreProduct ? "products_unavailable" : "store_not_configured",
          storeProductId: entry.android.productId,
          androidBasePlanId: entry.android.basePlanId,
          displayPrice: null,
          currency: null,
        };
      }
      const selected = selectStandardAndroidOffer({
        offers: product.subscriptionOffers ?? [],
        expectedBasePlanId: entry.android.basePlanId,
      });
      if (!selected.ok) {
        return {
          canonicalSku: sku,
          available: false,
          unavailableReason: "unsupported_offer",
          storeProductId: entry.android.productId,
          androidBasePlanId: entry.android.basePlanId,
          displayPrice: null,
          currency: null,
        };
      }
      return {
        canonicalSku: sku,
        available: true,
        unavailableReason: null,
        storeProductId: entry.android.productId,
        androidBasePlanId: entry.android.basePlanId,
        displayPrice: selected.offer.displayPrice,
        currency: selected.offer.currency || product.currency,
        androidOfferToken: selected.offer.offerToken,
      };
    }

    const product = byId.get(entry.ios.productId);
    if (!product || product.type !== "subs") {
      return {
        canonicalSku: sku,
        available: false,
        unavailableReason: anyStoreProduct ? "products_unavailable" : "store_not_configured",
        storeProductId: entry.ios.productId,
        displayPrice: null,
        currency: null,
      };
    }
    if (!iosProductAllowsPlainPurchase(product)) {
      return {
        canonicalSku: sku,
        available: false,
        unavailableReason: "unsupported_offer",
        storeProductId: entry.ios.productId,
        displayPrice: null,
        currency: null,
      };
    }
    if (!product.displayPrice) {
      return {
        canonicalSku: sku,
        available: false,
        unavailableReason: "products_unavailable",
        storeProductId: entry.ios.productId,
        displayPrice: null,
        currency: null,
      };
    }
    return {
      canonicalSku: sku,
      available: true,
      unavailableReason: null,
      storeProductId: entry.ios.productId,
      displayPrice: product.displayPrice,
      currency: product.currency,
    };
  });
}
