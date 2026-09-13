/**
 * Narrow Android Publisher REST client (VYD-32).
 *
 * Uses ADC-supplied access tokens + Node 20 fetch. Does NOT pull `googleapis`.
 * Request URLs contain the purchase token; errors/logs must NEVER echo them
 * or Google response bodies (those can contain credentials).
 */

import { BillingError } from "../errors";
import {
  ANDROID_PUBLISHER_SCOPE,
  CANONICAL_PLAY_PACKAGE_NAME,
  PLAY_API_BASE,
} from "./playConstants";
import type {
  GoogleCancellationEvent,
  GoogleOrder,
  GoogleOrderHistory,
  GooglePartialRefundEvent,
  GoogleProcessedEvent,
  GoogleRefundDetails,
  GoogleRefundEvent,
  GoogleSubscriptionPurchaseV2,
} from "./playTypes";

export const PLAY_API_TIMEOUT_MS = 15_000;

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export interface PlayApi {
  getSubscriptionV2(purchaseToken: string): Promise<GoogleSubscriptionPurchaseV2>;
  getOrder(orderId: string): Promise<GoogleOrder>;
  acknowledgeSubscription(purchaseToken: string, productId: string): Promise<void>;
}

export type PlayFetcher = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal }
) => Promise<{ status: number; ok: boolean; json?: unknown }>;

export interface PlayApiClientDeps {
  getAccessToken: () => Promise<string>;
  packageName?: string;
  timeoutMs?: number;
  fetchImpl?: PlayFetcher;
}

function playHttpError(status: number): BillingError {
  if (RETRYABLE_STATUS.has(status) || status === 0) {
    return new BillingError({
      clientCode: "temporary_unavailable",
      causeCode: "play_api_temporary_unavailable",
      retryable: true,
    });
  }
  if (status === 404) {
    return new BillingError({
      clientCode: "verification_failed",
      causeCode: "play_api_not_found",
    });
  }
  if (status === 401 || status === 403) {
    return new BillingError({
      clientCode: "temporary_unavailable",
      causeCode: "play_api_unauthorized",
      retryable: true,
    });
  }
  return new BillingError({
    clientCode: "verification_failed",
    causeCode: "play_api_invalid_purchase",
  });
}

function asObject(value: unknown): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "play_api_malformed_json",
    });
  }
  return value as Record<string, unknown>;
}

function asMoney(value: unknown): GoogleOrder["total"] | undefined {
  return value && typeof value === "object" ? (value as GoogleOrder["total"]) : undefined;
}

function sanitizeLineSubscriptionDetails(raw: unknown): NonNullable<GoogleOrder["lineItems"]>[number]["subscriptionDetails"] {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const d = raw as Record<string, unknown>;
  return {
    basePlanId: typeof d.basePlanId === "string" ? d.basePlanId : undefined,
    offerId: typeof d.offerId === "string" ? d.offerId : undefined,
    servicePeriodStartTime:
      typeof d.servicePeriodStartTime === "string" ? d.servicePeriodStartTime : undefined,
    servicePeriodEndTime:
      typeof d.servicePeriodEndTime === "string" ? d.servicePeriodEndTime : undefined,
  };
}

function sanitizeRefundDetails(raw: unknown): GoogleRefundDetails | undefined {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const d = raw as Record<string, unknown>;
  return {
    total: asMoney(d.total),
    tax: asMoney(d.tax),
  };
}

function sanitizeProcessedEvent(raw: unknown): GoogleProcessedEvent | undefined {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const d = raw as Record<string, unknown>;
  return {
    eventTime: typeof d.eventTime === "string" ? d.eventTime : undefined,
  };
}

function sanitizeCancellationEvent(raw: unknown): GoogleCancellationEvent | undefined {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const d = raw as Record<string, unknown>;
  return {
    eventTime: typeof d.eventTime === "string" ? d.eventTime : undefined,
  };
}

function sanitizeRefundEvent(raw: unknown): GoogleRefundEvent | undefined {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const d = raw as Record<string, unknown>;
  return {
    eventTime: typeof d.eventTime === "string" ? d.eventTime : undefined,
    refundDetails: sanitizeRefundDetails(d.refundDetails),
    refundReason: typeof d.refundReason === "string" ? d.refundReason : undefined,
  };
}

function sanitizePartialRefundEvent(raw: unknown): GooglePartialRefundEvent | undefined {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const d = raw as Record<string, unknown>;
  return {
    state: typeof d.state === "string" ? d.state : undefined,
    refundDetails: sanitizeRefundDetails(d.refundDetails),
  };
}

function sanitizeOrderHistory(raw: unknown): GoogleOrderHistory | undefined {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const h = raw as Record<string, unknown>;
  const partialRaw = Array.isArray(h.partialRefundEvents) ? h.partialRefundEvents : [];
  return {
    processedEvent: sanitizeProcessedEvent(h.processedEvent),
    cancellationEvent: sanitizeCancellationEvent(h.cancellationEvent),
    refundEvent: sanitizeRefundEvent(h.refundEvent),
    partialRefundEvents: partialRaw
      .map(sanitizePartialRefundEvent)
      .filter((e): e is GooglePartialRefundEvent => e != null),
  };
}

/**
 * Drop secret-bearing Order fields. Ignore synthetic root subscriptionDetails
 * and packageName — they are not current Orders-resource fields. Never copy
 * purchaseToken, buyerAddress, or raw response extras.
 */
export function sanitizePlayOrder(raw: unknown): GoogleOrder {
  const o = asObject(raw);
  const lineItemsRaw = Array.isArray(o.lineItems) ? o.lineItems : [];
  return {
    orderId: typeof o.orderId === "string" ? o.orderId : undefined,
    state: typeof o.state === "string" ? o.state : undefined,
    total: asMoney(o.total),
    tax: asMoney(o.tax),
    developerRevenueInBuyerCurrency: asMoney(o.developerRevenueInBuyerCurrency),
    lineItems: lineItemsRaw
      .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
      .map((item) => ({
        productId: typeof item.productId === "string" ? item.productId : undefined,
        total: asMoney(item.total),
        subscriptionDetails: sanitizeLineSubscriptionDetails(item.subscriptionDetails),
      })),
    createTime: typeof o.createTime === "string" ? o.createTime : undefined,
    orderHistory: sanitizeOrderHistory(o.orderHistory),
  };
}

export class PlayApiClient implements PlayApi {
  private readonly getAccessToken: () => Promise<string>;
  private readonly packageName: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: PlayFetcher;

  constructor(deps: PlayApiClientDeps) {
    this.getAccessToken = deps.getAccessToken;
    this.packageName = deps.packageName ?? CANONICAL_PLAY_PACKAGE_NAME;
    this.timeoutMs = deps.timeoutMs ?? PLAY_API_TIMEOUT_MS;
    this.fetchImpl =
      deps.fetchImpl ??
      (async (url, init) => {
        const res = await fetch(url, init);
        let json: unknown = undefined;
        const contentType = res.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          try {
            json = await res.json();
          } catch {
            json = undefined;
          }
        } else if (res.status !== 204) {
          try {
            await res.text();
          } catch {
            /* ignore body — never surface it */
          }
        }
        return { status: res.status, ok: res.ok, json };
      });
  }

  private async requestJson(url: string): Promise<{ status: number; json: unknown }> {
    const token = await this.getAccessToken();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal: ac.signal,
      });
      if (!res.ok) throw playHttpError(res.status);
      return { status: res.status, json: res.json };
    } catch (err) {
      if (err instanceof BillingError) throw err;
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError" || name === "TimeoutError") {
        throw new BillingError({
          clientCode: "temporary_unavailable",
          causeCode: "play_api_timeout",
          retryable: true,
        });
      }
      throw new BillingError({
        clientCode: "temporary_unavailable",
        causeCode: "play_api_network",
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async getSubscriptionV2(purchaseToken: string): Promise<GoogleSubscriptionPurchaseV2> {
    const url =
      `${PLAY_API_BASE}/${encodeURIComponent(this.packageName)}` +
      `/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
    const { json } = await this.requestJson(url);
    return asObject(json) as GoogleSubscriptionPurchaseV2;
  }

  async getOrder(orderId: string): Promise<GoogleOrder> {
    const url =
      `${PLAY_API_BASE}/${encodeURIComponent(this.packageName)}` +
      `/orders/${encodeURIComponent(orderId)}`;
    const { json } = await this.requestJson(url);
    return sanitizePlayOrder(json);
  }

  /**
   * Acknowledge a verified subscription. Google's public acknowledge method
   * is purchases.subscriptions.acknowledge and requires the product id
   * (`subscriptionId`) plus token. GET remains subscriptionsv2.
   */
  async acknowledgeSubscription(purchaseToken: string, productId: string): Promise<void> {
    const url =
      `${PLAY_API_BASE}/${encodeURIComponent(this.packageName)}` +
      `/purchases/subscriptions/${encodeURIComponent(productId)}` +
      `/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
    const token = await this.getAccessToken();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: "{}",
        signal: ac.signal,
      });
      if (!res.ok) throw playHttpError(res.status);
    } catch (err) {
      if (err instanceof BillingError) throw err;
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError" || name === "TimeoutError") {
        throw new BillingError({
          clientCode: "temporary_unavailable",
          causeCode: "play_api_timeout",
          retryable: true,
        });
      }
      throw new BillingError({
        clientCode: "temporary_unavailable",
        causeCode: "play_api_network",
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

export async function getAndroidPublisherAccessTokenFromAdc(): Promise<string> {
  const { GoogleAuth } = await import("google-auth-library");
  const auth = new GoogleAuth({ scopes: [ANDROID_PUBLISHER_SCOPE] });
  const client = await auth.getClient();
  const result = await client.getAccessToken();
  const token =
    typeof result === "string"
      ? result
      : result && typeof result === "object" && "token" in result
        ? (result as { token?: string | null }).token
        : null;
  if (!token) {
    throw new BillingError({
      clientCode: "temporary_unavailable",
      causeCode: "google_adc_unavailable",
      retryable: true,
    });
  }
  return token;
}
