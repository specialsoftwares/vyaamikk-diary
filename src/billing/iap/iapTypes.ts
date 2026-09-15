/**
 * Client IAP domain types (VYD-35).
 *
 * Store purchase events are never entitlement. Backend subscription/status
 * remains the only paid-capability authority (VYD-34 SubscriptionProvider).
 */

export type CanonicalSku =
  | "vyd_starter_monthly"
  | "vyd_starter_quarterly"
  | "vyd_starter_yearly"
  | "vyd_professional_monthly"
  | "vyd_professional_quarterly"
  | "vyd_professional_yearly"
  | "vyd_business_monthly"
  | "vyd_business_quarterly"
  | "vyd_business_yearly";

export type PaidPlan = "starter" | "professional" | "business";
export type BillingPeriod = "monthly" | "quarterly" | "yearly";
export type IapPlatform = "android" | "ios";
export type IapStore = "google" | "apple" | "unknown" | "horizon" | "amazon";

export type PurchaseState = "pending" | "purchased" | "unknown";

export type IapUnavailableReason =
  | "web"
  | "expo_go"
  | "native_build_required"
  | "store_not_configured"
  | "products_unavailable"
  | "unsupported_offer"
  | "not_signed_in";

export type PendingPurchaseStage =
  | "intent_created"
  | "store_pending"
  | "verifying"
  | "verified_unfinished_ios"
  | "awaiting_recovery";

export interface ClientCatalogEntry {
  canonicalSku: CanonicalSku;
  plan: PaidPlan;
  period: BillingPeriod;
  android: {
    productId: "vyd_starter" | "vyd_professional" | "vyd_business";
    basePlanId: BillingPeriod;
  };
  ios: {
    productId: string;
  };
}

export interface AndroidSubscriptionOfferLike {
  id: string;
  basePlanIdAndroid?: string | null;
  offerTokenAndroid?: string | null;
  displayPrice: string;
  currency?: string | null;
  type?: string | null;
  paymentMode?: string | null;
  installmentPlanDetailsAndroid?: {
    commitmentPaymentsCount: number;
    subsequentCommitmentPaymentsCount: number;
  } | null;
  pricingPhasesAndroid?: {
    pricingPhaseList: {
      billingCycleCount: number;
      billingPeriod: string;
      formattedPrice: string;
      priceAmountMicros: string;
      priceCurrencyCode: string;
      recurrenceMode: number;
    }[];
  } | null;
}

export interface SelectedAndroidOffer {
  offerToken: string;
  displayPrice: string;
  currency: string;
  basePlanId: string;
}

export type AndroidOfferSelection =
  | { ok: true; offer: SelectedAndroidOffer }
  | {
      ok: false;
      reason:
        | "missing"
        | "ambiguous"
        | "missing_token"
        | "trial_or_promo"
        | "installment"
        | "unsupported";
    };

export interface StoreProductLike {
  id: string;
  type: "in-app" | "subs";
  platform: "android" | "ios";
  displayPrice: string;
  currency: string;
  subscriptionOffers?: AndroidSubscriptionOfferLike[] | null;
  introductoryPriceIOS?: string | null;
  introductoryPricePaymentModeIOS?: string | null;
  pricingTermsIOS?: { billingPlanType?: string | null }[] | null;
}

export interface StorePurchase {
  store: IapStore;
  productId: string;
  purchaseState: PurchaseState;
  /** Android purchaseToken or Apple StoreKit JWS. Never persist. */
  purchaseToken: string | null;
  /**
   * OpenIAP plan hint. NEVER used as canonical SKU / base-plan authority.
   * Backend Play / App Store APIs decide the purchased plan.
   */
  currentPlanId?: string | null;
  isAcknowledgedAndroid?: boolean | null;
  /** Opaque native Purchase required for iOS finishTransaction only. */
  nativePurchase: unknown;
}

export interface StorePurchaseError {
  code: string;
  message: string;
  productId?: string | null;
}

export interface NativePurchaseRequest {
  type: "subs";
  request: {
    google?: {
      skus: string[];
      subscriptionOffers: { sku: string; offerToken: string }[];
      obfuscatedAccountId: string;
    };
    apple?: {
      sku: string;
      appAccountToken: string;
    };
  };
}

export interface GetAvailablePurchasesOptions {
  onlyIncludeActiveItemsIOS: boolean;
  includeSuspendedAndroid: boolean;
}

export interface IapNativeAdapter {
  initConnection(): Promise<boolean>;
  endConnection(): Promise<void>;
  fetchProducts(query: { skus: string[]; type: "subs" }): Promise<StoreProductLike[]>;
  requestPurchase(request: NativePurchaseRequest): Promise<void>;
  getAvailablePurchases(options: GetAvailablePurchasesOptions): Promise<StorePurchase[]>;
  /** iOS StoreKit finish only. Android adapter must not acknowledge. */
  finishTransactionIOS(purchase: StorePurchase): Promise<void>;
  addPurchaseUpdatedListener(listener: (purchase: StorePurchase) => void): () => void;
  addPurchaseErrorListener(listener: (error: StorePurchaseError) => void): () => void;
}

export interface AndroidValidationResult {
  alreadyProcessed: boolean;
  acknowledged: boolean;
  resultSummary?: string;
  canonicalSku?: string | null;
  billingStatus?: string | null;
  entitlementActive?: boolean;
}

export interface IosValidationResult {
  alreadyProcessed: boolean;
  resultSummary?: string;
  canonicalSku?: string | null;
  billingStatus?: string | null;
  entitlementActive?: boolean;
}

export interface IapBackend {
  prepareAndroidBillingAccount(): Promise<{ obfuscatedAccountId: string }>;
  validateAndActivateAndroid(input: {
    purchaseToken: string;
    expectedCanonicalSku?: CanonicalSku;
  }): Promise<AndroidValidationResult>;
  prepareIOSBillingAccount(): Promise<{ appAccountToken: string }>;
  validateAndActivateIOS(input: {
    signedTransactionInfo: string;
    expectedCanonicalSku?: CanonicalSku;
  }): Promise<IosValidationResult>;
}

export interface IapKeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface PendingPurchaseEnvelope {
  version: 1;
  uid: string;
  platform: IapPlatform;
  canonicalSku: CanonicalSku;
  productId: string;
  androidBasePlanId?: BillingPeriod;
  stage: PendingPurchaseStage;
  initiatedAt: number;
  updatedAt: number;
}

export interface CanonicalSkuAvailability {
  canonicalSku: CanonicalSku;
  available: boolean;
  unavailableReason: IapUnavailableReason | null;
  storeProductId: string;
  androidBasePlanId?: BillingPeriod;
  displayPrice: string | null;
  currency: string | null;
  androidOfferToken?: string;
}

export type PurchaseFlowResult =
  | { kind: "sheet_launched" }
  | { kind: "cancelled" }
  | { kind: "store_pending" }
  | { kind: "verified" }
  | { kind: "verified_unfinished_ios" }
  | { kind: "unavailable"; reason: IapUnavailableReason }
  | { kind: "already_in_flight" }
  | { kind: "failed"; recoverable: boolean; message: string };

export interface IapView {
  ownerUid: string | null;
  available: boolean;
  unavailableReason: IapUnavailableReason | null;
  connected: boolean;
  catalog: CanonicalSkuAvailability[];
  pending: PendingPurchaseEnvelope | null;
  lastResult: PurchaseFlowResult | null;
  purchaseInFlight: boolean;
}
