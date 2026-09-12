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

export function billingDetailsPath(uid: string): string {
  return `users/${uid}/subscription/billingDetails`;
}

export function subscriptionInvoicePath(invoiceId: string): string {
  return `_subscriptionInvoices/${invoiceId}`;
}

export function subscriptionCreditNotePath(creditNoteId: string): string {
  return `_subscriptionCreditNotes/${creditNoteId}`;
}

export function invoiceCounterPath(financialYear: string): string {
  return `_invoiceCounters/${financialYear}`;
}

export function creditNoteCounterPath(financialYear: string): string {
  return `_creditNoteCounters/${financialYear}`;
}

export function invoiceRetryQueuePath(invoiceId: string): string {
  return `_invoiceRetryQueue/${invoiceId}`;
}

export function gstr1FilingBatchPath(filingBatchId: string): string {
  return `_gstr1FilingBatches/${filingBatchId}`;
}

export function gstr1ReportManifestPath(reportId: string): string {
  return `_gstr1ReportManifests/${reportId}`;
}

export function invoicePdfStoragePath(financialYear: string, invoiceId: string): string {
  return `company/invoices/${financialYear}/${invoiceId}.pdf`;
}

export function gstr1ReportStoragePath(
  month: string,
  reportId: string,
  ext: "json" | "csv"
): string {
  return `company/gstr1-reports/${month}/${reportId}.${ext}`;
}

export function sanitizeDocId(raw: string): string {
  return raw.replace(/\//g, "_");
}
