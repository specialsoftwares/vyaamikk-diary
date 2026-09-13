/**
 * Strict Google Order validation for VYD-32 paid financial events.
 *
 * Matches the current Android Publisher Orders resource: subscriptionDetails
 * is a line-item field. Package authority is the package-scoped endpoint,
 * not a synthetic Order.packageName.
 */

import { BillingError } from "../errors";
import { googlePaidOrderTotalToPaise } from "./playMoney";
import type { GoogleOrder, GoogleOrderLineItem } from "./playTypes";

const PAID_ORDER_STATES = new Set(["PROCESSED", "ORDER_STATE_PROCESSED"]);

function fail(causeCode: string): never {
  throw new BillingError({
    clientCode: "verification_failed",
    causeCode,
  });
}

/**
 * Require exactly one supported subscription line item that matches the
 * verified product + base plan. Missing orderId / lineItems /
 * subscriptionDetails / basePlanId all fail closed.
 */
export function assertPaidSubscriptionOrder(opts: {
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
  const state = order.state ?? "";
  if (!PAID_ORDER_STATES.has(state)) {
    fail("order_not_processable");
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
