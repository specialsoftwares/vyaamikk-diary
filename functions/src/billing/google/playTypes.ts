/**
 * Narrow Google Play Developer API types used by VYD-32.
 *
 * These are adapter-boundary shapes. They never enter the Phase-B engine.
 * Raw purchase tokens / linked tokens / pending-refund tokens are NOT fields
 * on persisted documents and must not be copied into logs or errors.
 */

export type GoogleSubscriptionState =
  | "SUBSCRIPTION_STATE_UNSPECIFIED"
  | "SUBSCRIPTION_STATE_PENDING"
  | "SUBSCRIPTION_STATE_ACTIVE"
  | "SUBSCRIPTION_STATE_PAUSED"
  | "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"
  | "SUBSCRIPTION_STATE_ON_HOLD"
  | "SUBSCRIPTION_STATE_CANCELED"
  | "SUBSCRIPTION_STATE_EXPIRED"
  | "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED";

export type GoogleAcknowledgementState =
  | "ACKNOWLEDGEMENT_STATE_UNSPECIFIED"
  | "ACKNOWLEDGEMENT_STATE_PENDING"
  | "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";

/** Google Money: int64 units + nanos. Never interpret as JS number until paise conversion. */
export interface GoogleMoney {
  currencyCode?: string;
  units?: string | number;
  nanos?: number;
}

export interface GoogleOfferDetails {
  basePlanId?: string;
  offerId?: string;
  offerTags?: string[];
}

export interface GoogleAutoRenewingPlan {
  autoRenewEnabled?: boolean;
  recurringPrice?: GoogleMoney;
  priceChangeDetails?: unknown;
}

export interface GooglePrepaidPlan {
  allowExtendAfterTime?: string;
}

export interface GoogleSubscriptionPurchaseLineItem {
  productId?: string;
  expiryTime?: string;
  latestSuccessfulOrderId?: string;
  autoRenewingPlan?: GoogleAutoRenewingPlan;
  prepaidPlan?: GooglePrepaidPlan;
  offerDetails?: GoogleOfferDetails;
  deferredItemReplacement?: unknown;
  signupPromotion?: unknown;
}

export interface GoogleExternalAccountIdentifiers {
  obfuscatedExternalAccountId?: string;
  obfuscatedExternalProfileId?: string;
}

export interface GoogleOutOfAppPurchaseContext {
  expiredExternalAccountIdentifiers?: GoogleExternalAccountIdentifiers;
}

export interface GoogleUserInitiatedCancellation {
  cancelTime?: string;
}

export interface GoogleCanceledStateContext {
  userInitiatedCancellation?: GoogleUserInitiatedCancellation;
  systemInitiatedCancellation?: unknown;
  replacementCancellation?: unknown;
}

export interface GoogleSubscriptionPurchaseV2 {
  regionCode?: string;
  startTime?: string;
  subscriptionState?: string;
  latestOrderId?: string;
  acknowledgementState?: string;
  linkedPurchaseToken?: string;
  lineItems?: GoogleSubscriptionPurchaseLineItem[];
  externalAccountIdentifiers?: GoogleExternalAccountIdentifiers;
  outOfAppPurchaseContext?: GoogleOutOfAppPurchaseContext;
  canceledStateContext?: GoogleCanceledStateContext;
  pausedStateContext?: unknown;
  testPurchase?: unknown;
}

export type GoogleOrderState =
  | "ORDER_STATE_UNSPECIFIED"
  | "PENDING"
  | "PROCESSED"
  | "CANCELED"
  | string;

export interface GoogleOrderSubscriptionDetails {
  basePlanId?: string;
  offerId?: string;
  servicePeriodStartTime?: string;
  servicePeriodEndTime?: string;
}

export interface GoogleOrderLineItem {
  productId?: string;
  total?: GoogleMoney;
  subscriptionDetails?: GoogleOrderSubscriptionDetails;
}

/**
 * Sanitized Order matching the current Android Publisher Orders resource.
 * `subscriptionDetails` lives on each line item, not the order root.
 * `packageName` is not an Order field — package authority is the
 * package-scoped GET URL. `purchaseToken` is deliberately omitted.
 */
export interface GoogleOrder {
  orderId?: string;
  state?: GoogleOrderState;
  total?: GoogleMoney;
  tax?: GoogleMoney;
  developerRevenueInBuyerCurrency?: GoogleMoney;
  lineItems?: GoogleOrderLineItem[];
  createTime?: string;
}

export interface GoogleDeveloperNotification {
  version?: string;
  packageName?: string;
  eventTimeMillis?: string;
  subscriptionNotification?: {
    version?: string;
    notificationType?: number;
    purchaseToken?: string;
  };
  oneTimeProductNotification?: {
    version?: string;
    notificationType?: number;
    purchaseToken?: string;
    sku?: string;
  };
  voidedPurchaseNotification?: {
    purchaseToken?: string;
    orderId?: string;
    productType?: number;
    refundType?: number;
  };
  testNotification?: {
    version?: string;
  };
  pendingRefundReviewNotification?: {
    pendingRefundToken?: string;
  };
}

/** VoidedPurchaseNotification.productType */
export const VOID_PRODUCT_TYPE_SUBSCRIPTION = 1;
export const VOID_PRODUCT_TYPE_ONE_TIME = 2;

/** VoidedPurchaseNotification.refundType */
export const VOID_REFUND_TYPE_FULL = 1;
export const VOID_REFUND_TYPE_QUANTITY_BASED_PARTIAL = 2;

/**
 * RTDN subscriptionNotification.notificationType numeric values.
 * Used only as sanitized diagnostics. Entitlement is NEVER derived from these.
 */
export const RTDN_SUBSCRIPTION_NOTIFICATION_TYPES: Readonly<Record<number, string>> = {
  1: "SUBSCRIPTION_RECOVERED",
  2: "SUBSCRIPTION_RENEWED",
  3: "SUBSCRIPTION_CANCELED",
  4: "SUBSCRIPTION_PURCHASED",
  5: "SUBSCRIPTION_ON_HOLD",
  6: "SUBSCRIPTION_IN_GRACE_PERIOD",
  7: "SUBSCRIPTION_RESTARTED",
  8: "SUBSCRIPTION_PRICE_CHANGE_CONFIRMED",
  9: "SUBSCRIPTION_DEFERRED",
  10: "SUBSCRIPTION_PAUSED",
  11: "SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED",
  12: "SUBSCRIPTION_REVOKED",
  13: "SUBSCRIPTION_EXPIRED",
  20: "SUBSCRIPTION_PENDING_PURCHASE_CANCELED",
};
