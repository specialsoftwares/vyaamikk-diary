/**
 * Privacy-safe billing logger.
 *
 * Allowed context only. Passing a forbidden key throws — it does not log and
 * strip, because stripping would hide a caller bug. Structured fields never
 * include uid/phone/email/business name/tokens/receipts/raw webhook bodies.
 */

export const BILLING_LOG_ALLOWED_KEYS = [
  "correlationId",
  "diagnosticUid",
  "source",
  "platform",
  "eventType",
  "result",
  "latencyMs",
  "retryable",
  "canonicalSku",
  "causeCode",
  "googleSubscriptionState",
  "notificationType",
  "messageId",
  "orderId",
  "transactionId",
  "originalTransactionId",
  "notificationUUID",
  "reconciledAt",
  "tokenPrefix",
] as const;

export type BillingLogField = (typeof BILLING_LOG_ALLOWED_KEYS)[number];

export type BillingLogContext = Partial<Record<BillingLogField, string | number | boolean>>;

export const BILLING_LOG_FORBIDDEN_KEYS = [
  "uid",
  "userId",
  "phone",
  "phoneE164",
  "email",
  "businessName",
  "purchaseToken",
  "purchase_token",
  "receipt",
  "receiptData",
  "signedTransaction",
  "signedTransactionInfo",
  "signedRenewalInfo",
  "signedPayload",
  "APPSTORE_PRIVATE_KEY",
  "privateKey",
  "rawWebhookBody",
  "ciphertext",
  "encryptedPurchaseCredential",
  "linkedPurchaseToken",
  "pendingRefundToken",
  "expiredPurchaseToken",
  "Authorization",
  "authorization",
  "bearer",
  "gstin",
  "billingAddress",
  "legalName",
  "registeredAddress",
] as const;

const ALLOWED = new Set<string>(BILLING_LOG_ALLOWED_KEYS);
const FORBIDDEN = new Set<string>(BILLING_LOG_FORBIDDEN_KEYS);

export class BillingLogPrivacyError extends Error {
  constructor(key: string) {
    super(`billing log forbids field "${key}"`);
    this.name = "BillingLogPrivacyError";
  }
}

export function assertBillingLogContext(ctx: Record<string, unknown>): BillingLogContext {
  for (const key of Object.keys(ctx)) {
    if (FORBIDDEN.has(key) || !ALLOWED.has(key)) {
      throw new BillingLogPrivacyError(key);
    }
  }
  return ctx as BillingLogContext;
}

export type BillingLogSink = (level: "info" | "warn" | "error", ctx: BillingLogContext) => void;

const defaultSink: BillingLogSink = (level, ctx) => {
  const line = JSON.stringify({ level, channel: "billing", ...ctx });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

export function billingLog(
  level: "info" | "warn" | "error",
  ctx: Record<string, unknown>,
  sink: BillingLogSink = defaultSink
): void {
  sink(level, assertBillingLogContext(ctx));
}
