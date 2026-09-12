/** Canonical Firestore paths for billing collections. */

export function subscriptionStatusPath(uid: string): string {
  return `users/${uid}/subscription/status`;
}

export function subscriptionHistoryPath(uid: string, eventId: string): string {
  return `users/${uid}/subscriptionBillingHistory/${eventId}`;
}

export function companyBillingPath(uid: string): string {
  return `_companyBilling/${uid}`;
}

export function auditLogPath(eventId: string): string {
  return `_subscriptionAuditLog/${eventId}`;
}

export function processedEventPath(idempotencyKey: string): string {
  return `_processedBillingEvents/${idempotencyKey}`;
}

export function financialLedgerPath(financialEventId: string): string {
  return `_billingEventLedger/${financialEventId}`;
}

export function trialLedgerPath(trialIdentityHmac: string): string {
  return `_trialLedger/${trialIdentityHmac}`;
}

export function rateLimitBucketPath(bucketId: string): string {
  return `_billingRateLimits/${bucketId}`;
}

export function sanitizeDocId(raw: string): string {
  return raw.replace(/\//g, "_");
}
