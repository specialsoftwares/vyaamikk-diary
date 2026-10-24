/**
 * Short-lived PDF render input. Never persist dataUri in Firestore, SQLite,
 * navigation params, the outbox, or logs.
 */

export type PreparedReceiptPhoto =
  | {
      status: "ready";
      dataUri: string;
      mime: "image/jpeg" | "image/png";
      contentHash: string;
      width: number;
      height: number;
    }
  | { status: "none" }
  | {
      status: "unavailable";
      reason:
        | "missing_local"
        | "offline"
        | "access_denied"
        | "unsupported"
        | "too_large"
        | "decode_failed";
    };

export interface DocumentRevision {
  recordRevision: string;
  attachmentRevision: string;
  templateVersion: string;
}

export const CASH_VOUCHER_TEMPLATE_VERSION = "cash-voucher-photo-1";
