/**
 * Google Play subscription management destination. Restore is not cancellation.
 * Package is the real Android application id.
 */

import type { VyaamikkPlan } from "@/subscription/types";

import { androidProductIdForPlan } from "@/subscription/subscriptionManagementPresentation";

export const PLAY_SUBSCRIPTIONS_PACKAGE = "com.specialsoftwares.vyaamikkdiary";

export const PLAY_SUBSCRIPTIONS_BASE = "https://play.google.com/store/account/subscriptions";

export const APP_STORE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";

export function playSubscriptionsManageUrl(plan: VyaamikkPlan): string {
  const sku = androidProductIdForPlan(plan);
  const params = new URLSearchParams({ package: PLAY_SUBSCRIPTIONS_PACKAGE });
  if (sku) params.set("sku", sku);
  return `${PLAY_SUBSCRIPTIONS_BASE}?${params.toString()}`;
}

export function storeSubscriptionsManageUrl(input: {
  platform: "android" | "ios" | string;
  plan: VyaamikkPlan;
}): string {
  if (input.platform === "ios") return APP_STORE_SUBSCRIPTIONS_URL;
  return playSubscriptionsManageUrl(input.plan);
}
