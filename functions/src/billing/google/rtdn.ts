/**
 * Play RTDN envelope + dispatch (VYD-32).
 *
 * Pub/Sub wrapper is validated before DeveloperNotification decode.
 * subscriptionNotification.purchaseToken is a pointer only — live state is
 * always fetched via subscriptionsv2.get. notificationType never mutates
 * entitlement by itself.
 */

import { BillingError } from "../errors";
import { billingLog } from "../log";
import { CANONICAL_PLAY_PACKAGE_NAME } from "./playConstants";
import {
  processAndroidPurchaseToken,
  processAndroidVoidedPurchase,
  processAndroidPendingRefundReview,
  type AndroidBillingDeps,
  type AndroidBillingResult,
} from "./androidSubscriptionAdapter";
import { parseGoogleEventTimeMillis } from "./playTime";
import {
  RTDN_SUBSCRIPTION_NOTIFICATION_TYPES,
  VOID_PRODUCT_TYPE_SUBSCRIPTION,
  type GoogleDeveloperNotification,
} from "./playTypes";

export interface RtdnHandlerResult {
  httpStatus: number;
  action: string;
  billing?: AndroidBillingResult;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "rtdn_malformed",
    });
  }
  return value as Record<string, unknown>;
}

export function parsePubSubPushBody(body: unknown): { messageId: string; dataB64: string } {
  const root = asRecord(body);
  const message = asRecord(root.message);
  const data = message.data;
  if (typeof data !== "string" || data.length === 0) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "rtdn_malformed",
    });
  }
  const messageId =
    (typeof message.messageId === "string" && message.messageId) ||
    (typeof message.message_id === "string" && message.message_id) ||
    (typeof root.messageId === "string" && root.messageId) ||
    "";
  if (!messageId) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "rtdn_malformed",
    });
  }
  return { messageId, dataB64: data };
}

export function decodeDeveloperNotification(dataB64: string): GoogleDeveloperNotification {
  let json: string;
  try {
    json = Buffer.from(dataB64, "base64").toString("utf8");
  } catch {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "rtdn_invalid_base64",
    });
  }
  if (!json) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "rtdn_invalid_base64",
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "rtdn_invalid_base64",
    });
  }
  return asRecord(parsed) as GoogleDeveloperNotification;
}

export async function handleAndroidRtdn(
  deps: AndroidBillingDeps,
  body: unknown
): Promise<RtdnHandlerResult> {
  const { messageId, dataB64 } = parsePubSubPushBody(body);
  const notification = decodeDeveloperNotification(dataB64);
  if (notification.packageName !== CANONICAL_PLAY_PACKAGE_NAME) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "rtdn_wrong_package",
    });
  }

  if (notification.testNotification) {
    billingLog("info", {
      platform: "android",
      messageId,
      result: "test_notification",
    });
    return { httpStatus: 200, action: "test_notification" };
  }

  if (notification.pendingRefundReviewNotification) {
    const pending = notification.pendingRefundReviewNotification;
    return processAndroidPendingRefundReview(deps, {
      pendingRefundToken: pending.pendingRefundToken,
      orderId: pending.orderId,
      obfuscatedAccountId: pending.obfuscatedAccountId,
      refundReason: pending.refundReason,
      eventTimeMillis: notification.eventTimeMillis,
      messageId,
    });
  }

  if (notification.oneTimeProductNotification) {
    billingLog("info", {
      platform: "android",
      messageId,
      result: "one_time_product_ignored",
    });
    return { httpStatus: 200, action: "one_time_product_ignored" };
  }

  if (notification.voidedPurchaseNotification) {
    const voided = notification.voidedPurchaseNotification;
    if (voided.productType !== VOID_PRODUCT_TYPE_SUBSCRIPTION) {
      billingLog("info", {
        platform: "android",
        messageId,
        result: "voided_non_subscription_ignored",
      });
      return { httpStatus: 200, action: "voided_non_subscription_ignored" };
    }
    const eventTimeMillis = parseGoogleEventTimeMillis(
      notification.eventTimeMillis,
      "missing_rtdn_event_time"
    );
    const billing = await processAndroidVoidedPurchase(deps, {
      purchaseToken: voided.purchaseToken,
      orderId: voided.orderId,
      productType: voided.productType,
      refundType: voided.refundType,
      source: "rtdn",
      eventTimeMillis,
    });
    return { httpStatus: 200, action: "voided_subscription", billing };
  }

  if (notification.subscriptionNotification) {
    const subN = notification.subscriptionNotification;
    const typeName =
      typeof subN.notificationType === "number"
        ? RTDN_SUBSCRIPTION_NOTIFICATION_TYPES[subN.notificationType] ?? "UNKNOWN"
        : "UNKNOWN";
    const eventTimeMillis = parseGoogleEventTimeMillis(
      notification.eventTimeMillis,
      "missing_rtdn_event_time"
    );
    const billing = await processAndroidPurchaseToken(deps, {
      purchaseToken: subN.purchaseToken,
      source: "rtdn",
      eventSource: "webhook",
      eventTimeMillis,
    });
    billingLog("info", {
      diagnosticUid: billing.diagnosticUid,
      platform: "android",
      messageId,
      notificationType: typeName,
      googleSubscriptionState: billing.googleSubscriptionState ?? undefined,
      canonicalSku: billing.canonicalSku ?? undefined,
      result: billing.skipped ?? (billing.alreadyProcessed ? "already_processed" : "ok"),
    });
    return { httpStatus: 200, action: "subscription_reconciled", billing };
  }

  billingLog("info", {
    platform: "android",
    messageId,
    result: "ignored_unknown_notification",
  });
  return { httpStatus: 200, action: "ignored_unknown_notification" };
}
