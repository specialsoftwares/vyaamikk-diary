/**
 * Purchase / restore processor.
 *
 * STORE EVENT != ENTITLEMENT.
 * Never grant paid capability from purchaseToken, JWS, SKU, purchaseState,
 * or restore results. Backend validateAndActivate* writes subscription/status;
 * VYD-34 SubscriptionProvider observes that document.
 *
 * Android: server owns Play acknowledgment (VYD-32). Do not call
 * expo-iap finishTransaction on Android — 5.6.0 acknowledges again.
 * iOS: finishTransaction only after successful backend verification.
 */

import { getClientCatalogEntry } from "./iapCatalog";
import {
  clearPendingPurchaseIfUid,
  writePendingPurchase,
} from "./iapPendingPurchase";
import { EXPO_IAP_USER_CANCELLED } from "./iapNativeCodes";
import type {
  CanonicalSku,
  IapBackend,
  IapKeyValueStore,
  IapNativeAdapter,
  IapPlatform,
  PendingPurchaseEnvelope,
  PurchaseFlowResult,
  StorePurchase,
  StorePurchaseError,
} from "./iapTypes";

export type ProcessSource = "purchase" | "recovery" | "restore";

export interface PurchaseProcessorDeps {
  native: IapNativeAdapter;
  backend: IapBackend;
  store: IapKeyValueStore;
  platform: IapPlatform;
  now: () => number;
  currentUid: () => string | null;
  currentGeneration: () => number;
  generation: number;
}

function nonempty(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

async function patchPending(
  deps: PurchaseProcessorDeps,
  pending: PendingPurchaseEnvelope | null,
  stage: PendingPurchaseEnvelope["stage"]
): Promise<PendingPurchaseEnvelope | null> {
  const uid = deps.currentUid();
  if (!pending || !uid || pending.uid !== uid) return pending;
  const next: PendingPurchaseEnvelope = {
    ...pending,
    stage,
    updatedAt: deps.now(),
  };
  const ok = await writePendingPurchase({
    store: deps.store,
    envelope: next,
    expectedUid: uid,
    generation: deps.generation,
    currentGeneration: deps.currentGeneration,
  });
  return ok ? next : pending;
}

/**
 * Android Purchase.currentPlanId / similar fields are ignored on purpose.
 * Canonical SKU hint comes only from the client pending intent (non-authoritative).
 */
export function expectedCanonicalSkuHint(
  pending: PendingPurchaseEnvelope | null,
  purchase: StorePurchase
): CanonicalSku | undefined {
  if (!pending) return undefined;
  if (pending.productId !== purchase.productId) return undefined;
  return pending.canonicalSku;
}

export async function processStorePurchase(args: {
  deps: PurchaseProcessorDeps;
  purchase: StorePurchase;
  pending: PendingPurchaseEnvelope | null;
  source: ProcessSource;
  processedTokens: Set<string>;
}): Promise<{ result: PurchaseFlowResult; pending: PendingPurchaseEnvelope | null }> {
  const { deps, purchase, source } = args;
  let pending = args.pending;
  const uid = deps.currentUid();
  if (!uid) {
    return {
      result: { kind: "unavailable", reason: "not_signed_in" },
      pending,
    };
  }

  void purchase.currentPlanId;

  if (purchase.purchaseState === "unknown") {
    pending = await patchPending(deps, pending, "awaiting_recovery");
    return {
      result: {
        kind: "failed",
        recoverable: true,
        message: "Purchase state is unknown.",
      },
      pending,
    };
  }

  if (purchase.purchaseState === "pending") {
    if (deps.platform === "android") {
      pending = await patchPending(deps, pending, "store_pending");
      return { result: { kind: "store_pending" }, pending };
    }
    pending = await patchPending(deps, pending, "awaiting_recovery");
    return {
      result: {
        kind: "failed",
        recoverable: true,
        message: "Purchase is not complete.",
      },
      pending,
    };
  }

  if (purchase.purchaseState !== "purchased") {
    return {
      result: { kind: "failed", recoverable: true, message: "Purchase is not complete." },
      pending,
    };
  }

  if (!nonempty(purchase.purchaseToken)) {
    return {
      result: { kind: "failed", recoverable: true, message: "Purchase credential missing." },
      pending,
    };
  }

  const alreadyValidatedIos =
    pending?.stage === "verified_unfinished_ios" &&
    args.processedTokens.has(purchase.purchaseToken);

  if (deps.platform === "android") {
    if (purchase.store !== "google") {
      return {
        result: { kind: "failed", recoverable: true, message: "Unexpected store." },
        pending,
      };
    }
    if (source !== "restore" && pending && pending.productId !== purchase.productId) {
      return {
        result: { kind: "failed", recoverable: true, message: "Product mismatch." },
        pending,
      };
    }
    pending = await patchPending(deps, pending, "verifying");
    const hint = expectedCanonicalSkuHint(pending, purchase);
    let validation;
    try {
      validation = await deps.backend.validateAndActivateAndroid({
        purchaseToken: purchase.purchaseToken,
        expectedCanonicalSku: hint,
      });
    } catch {
      pending = await patchPending(deps, pending, "awaiting_recovery");
      return {
        result: {
          kind: "failed",
          recoverable: true,
          message: "Couldn't verify this purchase.",
        },
        pending,
      };
    }
    void validation.acknowledged;
    void validation.entitlementActive;
    args.processedTokens.add(purchase.purchaseToken);
    await clearPendingPurchaseIfUid(deps.store, uid);
    return { result: { kind: "verified" }, pending: null };
  }

  if (purchase.store !== "apple") {
    return {
      result: { kind: "failed", recoverable: true, message: "Unexpected store." },
      pending,
    };
  }
  if (source !== "restore" && pending && pending.productId !== purchase.productId) {
    return {
      result: { kind: "failed", recoverable: true, message: "Product mismatch." },
      pending,
    };
  }

  const shouldFinish =
    source === "purchase" ||
    source === "recovery" ||
    pending?.stage === "verified_unfinished_ios";

  if (!alreadyValidatedIos) {
    pending = await patchPending(deps, pending, "verifying");
    const hint = expectedCanonicalSkuHint(pending, purchase);
    try {
      await deps.backend.validateAndActivateIOS({
        signedTransactionInfo: purchase.purchaseToken,
        expectedCanonicalSku: hint,
      });
    } catch {
      pending = await patchPending(deps, pending, "awaiting_recovery");
      return {
        result: {
          kind: "failed",
          recoverable: true,
          message: "Couldn't verify this purchase.",
        },
        pending,
      };
    }
  }

  args.processedTokens.add(purchase.purchaseToken);

  if (shouldFinish) {
    try {
      await deps.native.finishTransactionIOS(purchase);
    } catch {
      pending = await patchPending(deps, pending, "verified_unfinished_ios");
      return { result: { kind: "verified_unfinished_ios" }, pending };
    }
  }

  await clearPendingPurchaseIfUid(deps.store, uid);
  return { result: { kind: "verified" }, pending: null };
}

export async function processPurchaseError(args: {
  deps: PurchaseProcessorDeps;
  error: StorePurchaseError;
  pending: PendingPurchaseEnvelope | null;
}): Promise<{ result: PurchaseFlowResult; pending: PendingPurchaseEnvelope | null }> {
  const uid = args.deps.currentUid();
  const cancelled =
    args.error.code === EXPO_IAP_USER_CANCELLED || args.error.code === "user-cancelled";
  if (
    cancelled &&
    args.pending &&
    args.pending.stage !== "store_pending" &&
    args.pending.stage !== "verifying" &&
    args.pending.stage !== "verified_unfinished_ios"
  ) {
    if (uid) await clearPendingPurchaseIfUid(args.deps.store, uid);
    return { result: { kind: "cancelled" }, pending: null };
  }
  return {
    result: {
      kind: "failed",
      recoverable: true,
      message: "Purchase didn't complete.",
    },
    pending: args.pending,
  };
}

export function pendingProductIdForSku(
  platform: IapPlatform,
  sku: CanonicalSku
): { productId: string; androidBasePlanId?: PendingPurchaseEnvelope["androidBasePlanId"] } {
  const entry = getClientCatalogEntry(sku);
  if (platform === "android") {
    return {
      productId: entry.android.productId,
      androidBasePlanId: entry.android.basePlanId,
    };
  }
  return { productId: entry.ios.productId };
}
