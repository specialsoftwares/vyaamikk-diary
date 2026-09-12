/**
 * Billing error taxonomy (Phase B).
 *
 * Internal errors may carry a machine `causeCode` for logs (never a token,
 * receipt, signed transaction, raw Google/Apple payload, or stack).
 * `toClientSafeBillingError` is the only shape future callables may return.
 */

export type BillingClientErrorCode =
  | "invalid_purchase"
  | "not_entitled"
  | "rate_limited"
  | "verification_failed"
  | "already_processed"
  | "temporary_unavailable"
  | "internal_error";

export const BILLING_CLIENT_MESSAGES: Record<BillingClientErrorCode, string> = {
  invalid_purchase: "This purchase could not be verified.",
  not_entitled: "This account is not eligible for that action.",
  rate_limited: "Too many billing attempts. Please wait a moment and try again.",
  verification_failed: "Purchase verification failed. Please try again.",
  already_processed: "This billing event was already processed.",
  temporary_unavailable: "Billing is temporarily unavailable. Please try again.",
  internal_error: "Something went wrong. Please try again.",
};

export class BillingError extends Error {
  readonly clientCode: BillingClientErrorCode;
  readonly retryable: boolean;
  readonly causeCode: string;

  constructor(opts: {
    clientCode: BillingClientErrorCode;
    causeCode: string;
    retryable?: boolean;
    message?: string;
  }) {
    super(opts.message ?? BILLING_CLIENT_MESSAGES[opts.clientCode]);
    this.name = "BillingError";
    this.clientCode = opts.clientCode;
    this.causeCode = opts.causeCode;
    this.retryable = opts.retryable === true;
  }
}

export interface ClientSafeBillingError {
  code: BillingClientErrorCode;
  message: string;
  retryable: boolean;
}

const FORBIDDEN_ERROR_SUBSTRINGS = [
  "purchaseToken",
  "purchase_token",
  "signedTransaction",
  "signedPayload",
  "receiptData",
  "latestReceipt",
  "BEGIN PRIVATE",
];

export function toClientSafeBillingError(err: unknown): ClientSafeBillingError {
  if (err instanceof BillingError) {
    return {
      code: err.clientCode,
      message: BILLING_CLIENT_MESSAGES[err.clientCode],
      retryable: err.retryable,
    };
  }
  return {
    code: "internal_error",
    message: BILLING_CLIENT_MESSAGES.internal_error,
    retryable: true,
  };
}

/** Guard used by tests: client-safe payloads must never echo secret material. */
export function clientSafeErrorContainsSecrets(safe: ClientSafeBillingError): boolean {
  const blob = `${safe.code} ${safe.message}`.toLowerCase();
  return FORBIDDEN_ERROR_SUBSTRINGS.some((s) => blob.includes(s.toLowerCase()));
}
