/**
 * Append-only subscription audit writer.
 *
 * Admin SDK bypasses Rules, so immutability is an application invariant:
 * this helper uses create() only. There is no update/delete API.
 */

import { type BillingTransaction } from "./store";
import { auditLogPath, sanitizeDocId } from "./paths";
import { BillingError } from "./errors";
import type { SubscriptionAuditLogEventDoc } from "./types";

export function auditEventIdFor(idempotencyKey: string): string {
  return sanitizeDocId(`a_${idempotencyKey}`);
}

export function appendSubscriptionAuditEvent(
  tx: BillingTransaction,
  eventId: string,
  event: SubscriptionAuditLogEventDoc
): void {
  if ("uid" in (event as unknown as Record<string, unknown>)) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "audit_raw_uid_forbidden",
    });
  }
  tx.create(auditLogPath(sanitizeDocId(eventId)), event as unknown as Record<string, unknown>);
}
