/**
 * Strict Google Order validation for VYD-32 financial events.
 *
 * Matches the current Android Publisher Orders resource: subscriptionDetails
 * is a line-item field. Package authority is the package-scoped endpoint,
 * not a synthetic Order.packageName.
 *
 * Purchase/renewal and full-refund are distinct Order states and MUST NOT
 * share a PROCESSED-only validator.
 */

import { BillingError } from "../errors";
import { googlePaidOrderTotalToPaise } from "./playMoney";
import { parseRfc3339Millis } from "./playTime";
import type { GoogleOrder, GoogleOrderLineItem } from "./playTypes";

const PROCESSED_ORDER_STATES = new Set(["PROCESSED", "ORDER_STATE_PROCESSED"]);
const REFUNDED_ORDER_STATES = new Set(["REFUNDED", "ORDER_STATE_REFUNDED"]);
const PENDING_REFUND_STATES = new Set(["PENDING_REFUND", "ORDER_STATE_PENDING_REFUND"]);
const PARTIAL_REFUND_STATES = new Set(["PARTIALLY_REFUNDED", "ORDER_STATE_PARTIALLY_REFUNDED"]);

function fail(causeCode: string, clientCode: BillingError["clientCode"] = "verification_failed"): never {
  throw new BillingError({
    clientCode,
    causeCode,
  });
}

/**
 * Exact orderId + single supported subscription line item. No Order-state check.
 * Used when the purchase/renewal is already in the ledger (the Order may now
 * be REFUNDED) and when building the PROCESSED / full-refund validators.
 */
export function assertSubscriptionOrderLineItem(opts: {
  order: GoogleOrder;
  expectedOrderId: string;
  productId: string;
  basePlanId: string;
}): GoogleOrderLineItem {
  const { order, expectedOrderId, productId, basePlanId } = opts;
  if (typeof order.orderId !== "string" || order.orderId.length === 0) {
    fail("missing_order_id");
  }
  if (order.orderId !== expectedOrderId) {
    fail("order_id_mismatch");
  }
  const items = order.lineItems;
  if (!Array.isArray(items) || items.length === 0) {
    fail("missing_order_line_items");
  }
  if (items.length !== 1) {
    fail("unsupported_subscription_bundle");
  }
  const lineItem = items[0];
  if (!lineItem || typeof lineItem.productId !== "string" || lineItem.productId.length === 0) {
    fail("order_product_mismatch");
  }
  if (lineItem.productId !== productId) {
    fail("order_product_mismatch");
  }
  const details = lineItem.subscriptionDetails;
  if (details == null || typeof details !== "object") {
    fail("missing_order_subscription_details");
  }
  if (typeof details.basePlanId !== "string" || details.basePlanId.length === 0) {
    fail("missing_order_base_plan");
  }
  if (details.basePlanId !== basePlanId) {
    fail("order_base_plan_mismatch");
  }
  const offerId = details.offerId;
  if (typeof offerId === "string" && offerId.length > 0) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "unsupported_play_offer",
    });
  }
  if (lineItem.total) {
    const linePaise = googlePaidOrderTotalToPaise(lineItem.total);
    const orderPaise = googlePaidOrderTotalToPaise(order.total);
    if (linePaise !== orderPaise) {
      fail("order_line_total_mismatch");
    }
  }
  return lineItem;
}

/**
 * Authoritative purchase/renewal financial timestamp.
 * `Order.createTime` is not used — pending payment can complete in a later month.
 */
export function requireProcessedEventMillis(order: GoogleOrder): number {
  const eventTime = order.orderHistory?.processedEvent?.eventTime;
  return parseRfc3339Millis(eventTime, "missing_order_processed_event");
}

export function requireRefundEventAuthority(order: GoogleOrder): {
  occurredAt: number;
  grossAmountInPaise: number;
} {
  const refundEvent = order.orderHistory?.refundEvent;
  if (refundEvent == null || typeof refundEvent !== "object") {
    fail("missing_order_refund_event");
  }
  const occurredAt = parseRfc3339Millis(refundEvent.eventTime, "missing_order_refund_event_time");
  const total = refundEvent.refundDetails?.total;
  const grossAmountInPaise = googlePaidOrderTotalToPaise(total);
  return { occurredAt, grossAmountInPaise };
}

/**
 * Map a verified full-refund Order's refundReason onto the financial event class.
 * Entitlement is never derived from this. Unknown / unspecified fail closed.
 */
export function classifyVerifiedFullRefundReason(order: GoogleOrder): "refund" | "chargeback" {
  const reason = order.orderHistory?.refundEvent?.refundReason;
  if (reason === "OTHER") return "refund";
  if (reason === "CHARGEBACK") return "chargeback";
  throw new BillingError({
    clientCode: "verification_failed",
    causeCode: "unknown_order_refund_reason",
  });
}

/**
 * RTDN `eventTimeMillis` is signal/diagnostic timing. The Order refund event
 * is the financial timestamp. Grounded checks only: both timestamps must
 * already have parsed strictly; refund must not precede processedEvent.
 * There is no documented Google validity window between the two clocks.
 */
export function assertRefundSignalAgreesWithOrder(opts: {
  rtdnEventTimeMillis: number;
  refundEventTimeMillis: number;
  processedEventTimeMillis: number;
}): void {
  if (
    !Number.isFinite(opts.rtdnEventTimeMillis) ||
    !Number.isFinite(opts.refundEventTimeMillis) ||
    !Number.isFinite(opts.processedEventTimeMillis)
  ) {
    fail("invalid_refund_event_time");
  }
  if (opts.refundEventTimeMillis < opts.processedEventTimeMillis) {
    fail("refund_before_processed");
  }
}

/**
 * PROCESSED paid subscription Order used for purchase/renewal ledger writes.
 */
export function assertProcessedSubscriptionOrder(opts: {
  order: GoogleOrder;
  expectedOrderId: string;
  productId: string;
  basePlanId: string;
}): GoogleOrderLineItem {
  const lineItem = assertSubscriptionOrderLineItem(opts);
  const state = opts.order.state ?? "";
  if (!PROCESSED_ORDER_STATES.has(state)) {
    fail("order_not_processable");
  }
  requireProcessedEventMillis(opts.order);
  return lineItem;
}

/**
 * Completed FULL refund Order. PENDING_REFUND and PARTIALLY_REFUNDED fail closed.
 */
export function assertFullyRefundedSubscriptionOrder(opts: {
  order: GoogleOrder;
  expectedOrderId: string;
  productId: string;
  basePlanId: string;
}): GoogleOrderLineItem {
  const lineItem = assertSubscriptionOrderLineItem(opts);
  const state = opts.order.state ?? "";
  if (PENDING_REFUND_STATES.has(state)) {
    fail("order_refund_pending");
  }
  if (PARTIAL_REFUND_STATES.has(state)) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "unsupported_partial_refund",
    });
  }
  if (!REFUNDED_ORDER_STATES.has(state)) {
    fail("order_not_fully_refunded");
  }
  requireProcessedEventMillis(opts.order);
  requireRefundEventAuthority(opts.order);
  classifyVerifiedFullRefundReason(opts.order);
  return lineItem;
}

/** VoidedPurchaseNotification.refundType: VYD-32 requires FULL_REFUND only. */
export function assertVoidedPurchaseFullRefundType(refundType: unknown): void {
  if (refundType === 2 || refundType === "QUANTITY_BASED_PARTIAL_REFUND") {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "unsupported_partial_refund",
    });
  }
  if (refundType === 1 || refundType === "FULL_REFUND") return;
  if (refundType == null) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "missing_void_refund_type",
    });
  }
  throw new BillingError({
    clientCode: "verification_failed",
    causeCode: "unknown_void_refund_type",
  });
}

/** @deprecated Use assertProcessedSubscriptionOrder — PROCESSED paid orders only. */
export function assertPaidSubscriptionOrder(opts: {
  order: GoogleOrder;
  expectedOrderId: string;
  productId: string;
  basePlanId: string;
}): GoogleOrderLineItem {
  return assertProcessedSubscriptionOrder(opts);
}
